/**
 * The queue of photo blobs (ARCHITECTURE §5.2): encrypted photos made without a connection, kept on the device until
 * they are uploaded. A row holds only the ciphertext exactly as it will be uploaded; the keys stay inside the
 * encrypted record that references the photo. This file is pure logic (no IndexedDB, no network), so the order and
 * the refusal rules can be tested on their own.
 */
import { classify } from '$lib/records/outbox';

export type BlobRow = {
	/** The attachment id the blob is uploaded under. */
	id: string;
	/** Ciphertext, as uploaded. */
	blob: Uint8Array;
	/** When it was queued; also the upload order (oldest first). */
	queuedAt: number;
	/** The full-size attachment id of the photo this blob belongs to (a photo is two blobs: image and thumbnail). */
	photo: string;
	/** The server refused it (not a network problem). It stays on the device and is shown on the Sync card. */
	refused?: true;
};

export type BlobState = 'waiting' | 'refused';

export const blobStates = (rows: BlobRow[]): Record<string, BlobState> =>
	Object.fromEntries(rows.map((r) => [r.id, r.refused ? 'refused' : 'waiting'] as const));

/** How many photos (not blobs) the server refused. */
export const refusedPhotos = (rows: BlobRow[]): number =>
	new Set(rows.filter((r) => r.refused).map((r) => r.photo)).size;

export type BlobHooks = {
	send: (row: BlobRow) => Promise<void>;
	sent: (row: BlobRow) => Promise<void>;
	refused: (row: BlobRow) => Promise<void>;
};

/**
 * Uploads the queued blobs, oldest first. Network or server trouble (or a lost session) stops the run; a blob the
 * server refuses is marked refused and does not block the others. Already refused blobs are skipped.
 */
export async function flushBlobRows(
	rows: BlobRow[],
	hooks: BlobHooks
): Promise<{ sent: BlobRow[]; stopped: boolean }> {
	const sent: BlobRow[] = [];
	const queue = rows.filter((r) => !r.refused).sort((a, b) => a.queuedAt - b.queuedAt);
	for (const row of queue) {
		try {
			await hooks.send(row);
		} catch (err) {
			const kind = classify(err);
			if (kind === 'network' || kind === 'auth' || kind === 'transient') return { sent, stopped: true };
			await hooks.refused(row);
			continue;
		}
		await hooks.sent(row);
		sent.push(row);
	}
	return { sent, stopped: false };
}
