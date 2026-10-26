/**
 * The photo blob queue in use (see blobs.ts for the rules): reactive state for the badges and the Sync card, plus the
 * IndexedDB reads and writes. Only ciphertext is stored; nothing is decrypted here.
 */
import { apiPutBytes } from '$lib/api';
import { deleteBlobs, markBlobs, putBlobs, readBlob, readBlobs } from '$lib/records/cache';
import { SEND_TIMEOUT_MS, withTimeout } from '$lib/records/outbox';
import { session } from '$lib/session.svelte';
import { blobStates, flushBlobRows, refusedPhotos, type BlobRow, type BlobState } from './blobs';

/** Ids of the blobs on this device that are not on the server yet. `loaded` is false until the first read. */
export const photoQueue = $state<{ ids: Record<string, BlobState>; refused: number; loaded: boolean }>({
	ids: {},
	refused: 0,
	loaded: false
});

let lastStamp = 0;
const stamp = (): number => (lastStamp = Math.max(Date.now(), lastStamp + 1));

const uid = (): string | null => session.identity?.userId ?? null;

function show(rows: BlobRow[]): void {
	photoQueue.ids = blobStates(rows);
	photoQueue.refused = refusedPhotos(rows);
	photoQueue.loaded = true;
}

export function resetPhotoQueue(): void {
	photoQueue.ids = {};
	photoQueue.refused = 0;
	photoQueue.loaded = false;
}

/** Reads the queue of the signed-in person into memory (after unlock). */
export async function loadPhotoQueue(): Promise<void> {
	const id = uid();
	if (id) show(await readBlobs(id));
}

export type EncryptedBlob = { id: string; blob: Uint8Array };

/** Queues the two blobs of one photo (image first, thumbnail second). Returns false when they could not be stored. */
export async function queuePhotoBlobs(photo: string, blobs: EncryptedBlob[]): Promise<boolean> {
	const user = uid();
	if (!user) return false;
	const rows = blobs.map((b) => ({ id: b.id, blob: b.blob, photo, queuedAt: stamp() }));
	if (!(await putBlobs(user, rows))) return false;
	photoQueue.ids = { ...photoQueue.ids, ...blobStates(rows) };
	return true;
}

/** The queued ciphertext for this attachment id, or null when it is not queued (it is on the server). */
export async function queuedBlob(id: string): Promise<Uint8Array | null> {
	if (photoQueue.loaded && !(id in photoQueue.ids)) return null;
	const user = uid();
	if (!user) return null;
	return (await readBlob(user, id))?.blob ?? null;
}

/** Drops a queued blob that was removed before it was uploaded. Returns true when it was queued (nothing to delete on the server). */
export async function dropQueued(id: string): Promise<boolean> {
	const user = uid();
	if (!user) return false;
	if (photoQueue.loaded && !(id in photoQueue.ids)) return false;
	if (!(await readBlob(user, id))) return false;
	await deleteBlobs(user, [id]);
	await refreshQueue(user);
	return true;
}

async function refreshQueue(user: string): Promise<void> {
	const rows = await readBlobs(user);
	if (uid() === user) show(rows);
}

/** Gives refused blobs another go (the Sync card's "Try again"). */
export async function retryRefusedBlobs(user: string): Promise<void> {
	const ids = (await readBlobs(user)).filter((r) => r.refused).map((r) => r.id);
	if (ids.length > 0) await markBlobs(user, ids, false);
	await refreshQueue(user);
}

/**
 * Uploads the queued blobs before any record row is sent (a record must never reach the server before its photos).
 * Needs no keys, so it also runs while locked. Returns true when it stopped early (network or server trouble).
 */
export async function flushBlobs(user: string): Promise<boolean> {
	const rows = await readBlobs(user);
	if (rows.length === 0) {
		if (uid() === user) show(rows);
		return false;
	}
	const { stopped } = await flushBlobRows(rows, {
		send: async (row) => {
			await withTimeout(apiPutBytes(`/api/attachments/${row.id}`, row.blob), SEND_TIMEOUT_MS);
		},
		sent: async (row) => {
			// If the photo was removed from its entry while this was on its way, the blob is on the server for nothing
			// and the normal clean-up (deleteAttachment) asks the server to delete it.
			await deleteBlobs(user, [row.id]);
		},
		refused: async (row) => {
			await markBlobs(user, [row.id], true);
		}
	});
	await refreshQueue(user);
	return stopped;
}
