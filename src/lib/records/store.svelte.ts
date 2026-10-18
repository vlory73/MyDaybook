/**
 * The decrypted record store (ARCHITECTURE §5.1).
 *
 * - `store.items` holds decrypted records in memory only, reactive for the UI. Lock and sign-out empty it.
 * - IndexedDB (see cache.ts) holds ciphertext and the sync cursor, so a reload downloads only changes.
 * - Every write is encrypted on this device and sent with the revision it was based on; a conflict is retried once
 *   on top of the server's revision (last writer wins, which suits one person on a few devices).
 * - Records that cannot be decrypted or validated are skipped and counted (`store.skipped`), never fatal.
 */
import { ApiError, apiDelete, apiGet, apiPut } from '$lib/api';
import { initCrypto } from '$lib/crypto/sodium';
import { getKeys, onLock, onSignOut, session } from '$lib/session.svelte';
import { deleteCache, readCache, writeCache } from './cache';
import {
	open,
	recordsForDay,
	daysWithEntries,
	seal,
	wireToCached,
	type CachedRecord,
	type StoredRecord,
	type Wire
} from './codec';
import { flushPendingAttachmentDeletes, scheduleAttachmentDelete } from '$lib/photos/pending';
import type { Payload } from './types';

export type { StoredRecord } from './codec';

export const store = $state<{
	items: Record<string, StoredRecord>;
	/** `idle` until the first load after unlock has finished. */
	status: 'idle' | 'loading' | 'ready';
	syncing: boolean;
	/** The last sync could not reach the server. */
	syncFailed: boolean;
	/** Records that could not be decrypted or understood, since unlock. */
	skipped: number;
}>({ items: {}, status: 'idle', syncing: false, syncFailed: false, skipped: 0 });

const PAGE = 500;
/** Last known revision per id, tombstones included, used as `baseRev`. Not reactive. */
let revs: Record<string, number> = {};
let cursor: string | null = null;
let generation = 0;
let inflight: Promise<void> | null = null;
let lastSyncAt = 0;

function userId(): string {
	const id = session.identity?.userId;
	if (!id) throw new Error('no session');
	return id;
}

function reset(): void {
	generation++;
	store.items = {};
	store.status = 'idle';
	store.syncing = false;
	store.syncFailed = false;
	store.skipped = 0;
	revs = {};
	cursor = null;
	inflight = null;
	lastSyncAt = 0;
}

onLock(reset);
onSignOut((id) => {
	reset();
	if (id) void deleteCache(id);
});

/** Applies cached or downloaded records to memory; records that fail to open are skipped and counted. */
function apply(records: CachedRecord[]): void {
	const kek = getKeys().kek;
	const uid = userId();
	for (const rec of records) {
		revs[rec.id] = rec.rev;
		const res = open(kek, uid, rec);
		if (res.ok) {
			store.items[rec.id] = { id: rec.id, rev: rec.rev, updatedAt: rec.updatedAt, payload: res.payload };
		} else {
			delete store.items[rec.id];
			if (res.reason !== 'tombstone') store.skipped++;
		}
	}
}

/** First thing after unlock: show what the cache holds, then fetch changes. */
export async function startRecords(): Promise<void> {
	if (session.status !== 'unlocked' || store.status !== 'idle') return;
	const gen = generation;
	store.status = 'loading';
	await initCrypto();
	const cached = await readCache(userId());
	if (gen !== generation) return;
	cursor = cached.cursor;
	apply(cached.records);
	store.status = 'ready';
	void flushPendingAttachmentDeletes(userId());
	await sync();
}

/** Downloads changes since the cursor until there are no more. Concurrent calls share one run. */
export function sync(): Promise<void> {
	if (inflight) return inflight;
	if (session.status !== 'unlocked') return Promise.resolve();
	const gen = generation;
	store.syncing = true;
	const run = (async () => {
		try {
			let more = true;
			while (more) {
				const query = `limit=${PAGE}${cursor ? `&since=${cursor}` : ''}`;
				const page = await apiGet<{ records: Wire[]; cursor: string | null; hasMore: boolean }>(
					`/api/records?${query}`
				);
				if (gen !== generation) return;
				const cached = page.records.map(wireToCached);
				apply(cached);
				if (page.cursor) cursor = page.cursor;
				await writeCache(userId(), cached, page.cursor ?? undefined);
				more = page.hasMore;
			}
			store.syncFailed = false;
			lastSyncAt = Date.now();
		} catch {
			if (gen === generation) store.syncFailed = true;
		} finally {
			if (gen === generation) {
				store.syncing = false;
				inflight = null;
			}
		}
	})();
	inflight = run;
	return run;
}

/** Sync if the last successful one is older than `maxAgeMs` (for visibility changes). */
export function syncIfStale(maxAgeMs = 15_000): void {
	if (session.status === 'unlocked' && store.status === 'ready' && Date.now() - lastSyncAt > maxAgeMs) {
		void sync();
	}
}

type PutResponse = { id: string; rev: number; updatedAt: number };

async function put(id: string, payload: Payload): Promise<PutResponse> {
	const uid = userId();
	const sealed = seal(getKeys().kek, uid, id, payload);
	let baseRev = revs[id];
	for (let attempt = 0; ; attempt++) {
		try {
			const res = await apiPut<PutResponse>(`/api/records/${id}`, { ...sealed, baseRev });
			await writeCache(uid, [
				wireToCached({ ...sealed, id, rev: res.rev, updatedAt: res.updatedAt, deletedAt: null })
			]);
			return res;
		} catch (err) {
			if (attempt === 0 && err instanceof ApiError && err.status === 409) {
				// Another device changed it first: write on top (the next sync brings its version's revision).
				baseRev = undefined;
				continue;
			}
			throw err;
		}
	}
}

/** Creates or replaces a record. Throws ApiError (e.g. `network`) when it could not be saved. */
export async function save(payload: Payload, id: string = crypto.randomUUID()): Promise<string> {
	const gen = generation;
	const res = await put(id, payload);
	if (gen === generation) {
		revs[id] = res.rev;
		store.items[id] = { id, rev: res.rev, updatedAt: res.updatedAt, payload };
	}
	return id;
}

/**
 * Deletes a record. Returns `undo()`, which puts the same payload back under the same id.
 * The record's photos are deleted on the server only after a grace period longer than the Undo toast
 * (see photos/pending.ts); Undo keeps them.
 */
export async function remove(id: string): Promise<() => Promise<void>> {
	const previous = store.items[id];
	const gen = generation;
	const uid = userId();
	const res = await apiDelete<PutResponse>(`/api/records/${id}`);
	if (gen === generation) {
		revs[id] = res.rev;
		delete store.items[id];
	}
	await writeCache(uid, [
		{
			id,
			wrappedKey: null,
			ciphertext: null,
			rev: res.rev,
			updatedAt: res.updatedAt,
			deletedAt: res.updatedAt
		}
	]);
	const photos = previous?.payload.attachments;
	const pending = photos?.length ? scheduleAttachmentDelete(uid, photos) : null;
	return async () => {
		if (!previous) return;
		await save(previous.payload, id);
		pending?.cancel();
	};
}

// ---- Selectors (reactive when called inside effects or deriveds) ----

export const allRecords = (): StoredRecord[] => Object.values(store.items);
export const recordsOnDay = (day: string) => recordsForDay(allRecords(), day);
export const daysInRange = (from: string, to: string) => daysWithEntries(allRecords(), from, to);
