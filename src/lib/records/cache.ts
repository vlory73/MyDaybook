/**
 * Ciphertext cache in IndexedDB (ARCHITECTURE §5.1): wrapped keys, ciphertext, revision and sync cursor, so a reload
 * downloads only changes. Plaintext never goes in here. One database per user id (`mydaybook-records-<userId>`),
 * deleted on sign-out and account deletion; lock keeps it, because it holds nothing readable.
 * If IndexedDB is unavailable every function degrades to "empty cache": the app then re-downloads everything.
 */
import type { CachedRecord } from './codec';
import type { OutboxRow } from './outbox';
import type { BlobRow } from '$lib/photos/blobs';

const STORE = 'records';
const OUTBOX = 'outbox';
const BLOBS = 'blobs';
const META = 'meta';
const CURSOR_KEY = 'cursor';

export const cacheName = (userId: string) => `mydaybook-records-${userId}`;

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

function open(userId: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(cacheName(userId), 3);
		req.onupgradeneeded = () => {
			// Version 1 had records and meta; version 2 adds the outbox; version 3 the queue of photo blobs. Existing data is kept.
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
			if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
			if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'id' });
			if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'id' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('blocked'));
	});
}

export type CacheContents = { records: CachedRecord[]; cursor: string | null };

export async function readCache(userId: string): Promise<CacheContents> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction([STORE, META], 'readonly');
			const records = (await request(tx.objectStore(STORE).getAll())) as CachedRecord[];
			const cursor = (await request(tx.objectStore(META).get(CURSOR_KEY))) as string | undefined;
			return { records, cursor: cursor ?? null };
		} finally {
			db.close();
		}
	} catch {
		return { records: [], cursor: null };
	}
}

/** Stores records (and, when given, the new cursor) in one transaction. Failures are ignored: it is only a cache. */
export async function writeCache(userId: string, records: CachedRecord[], cursor?: string): Promise<void> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction([STORE, META], 'readwrite');
			const store = tx.objectStore(STORE);
			for (const r of records) store.put(r);
			if (cursor !== undefined) tx.objectStore(META).put(cursor, CURSOR_KEY);
			await done(tx);
		} finally {
			db.close();
		}
	} catch {
		// No cache this time; the next sync simply downloads more.
	}
}

export async function deleteCache(userId: string): Promise<void> {
	try {
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase(cacheName(userId));
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	} catch {
		// IndexedDB unavailable: nothing to delete.
	}
}

/**
 * Session ended on its own (signed out elsewhere, account disabled): the cached records and the cursor go, the outbox
 * and the queued photo blobs stay, so changes made offline can still be sent when the same person signs in again on this device.
 */
export async function clearRecordsKeepOutbox(userId: string): Promise<void> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction([STORE, META], 'readwrite');
			tx.objectStore(STORE).clear();
			tx.objectStore(META).clear();
			await done(tx);
		} finally {
			db.close();
		}
	} catch {
		// Nothing to clear.
	}
}

// ---- Outbox (ARCHITECTURE §5.1): sealed changes waiting to be sent. Ciphertext and wrapped keys only. ----

/** All waiting changes, oldest first. Empty when IndexedDB is unavailable. */
export async function readOutbox(userId: string): Promise<OutboxRow[]> {
	try {
		const db = await open(userId);
		try {
			const rows = (await request(
				db.transaction(OUTBOX, 'readonly').objectStore(OUTBOX).getAll()
			)) as OutboxRow[];
			return rows.sort((a, b) => a.queuedAt - b.queuedAt);
		} finally {
			db.close();
		}
	} catch {
		return [];
	}
}

/** Stores (or replaces) the row of its record id. Returns false when it could not be stored. */
export async function putOutboxRow(userId: string, row: OutboxRow): Promise<boolean> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction(OUTBOX, 'readwrite');
			tx.objectStore(OUTBOX).put(row);
			await done(tx);
			return true;
		} finally {
			db.close();
		}
	} catch {
		return false;
	}
}

/**
 * Removes the row when it is still the version that was sent (same `queuedAt`); a newer change to the same record,
 * queued while this one was on its way, stays. With `update`, changes the row instead (attempts, refused).
 */
export async function settleOutboxRow(
	userId: string,
	id: string,
	queuedAt: number,
	update?: Partial<OutboxRow>
): Promise<void> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction(OUTBOX, 'readwrite');
			const rows = tx.objectStore(OUTBOX);
			const get = rows.get(id);
			// Inside the request callback, so the transaction is still active (no awaiting in between).
			get.onsuccess = () => {
				const current = get.result as OutboxRow | undefined;
				if (current && current.queuedAt === queuedAt) {
					if (update) rows.put({ ...current, ...update });
					else rows.delete(id);
				}
			};
			await done(tx);
		} finally {
			db.close();
		}
	} catch {
		// The row stays and is tried again.
	}
}

// ---- Photo blob queue (ARCHITECTURE §5.2): encrypted photos not yet uploaded. Ciphertext only, no keys. ----

/** All queued blobs, oldest first. Empty when IndexedDB is unavailable. */
export async function readBlobs(userId: string): Promise<BlobRow[]> {
	try {
		const db = await open(userId);
		try {
			const rows = (await request(
				db.transaction(BLOBS, 'readonly').objectStore(BLOBS).getAll()
			)) as BlobRow[];
			return rows.sort((a, b) => a.queuedAt - b.queuedAt);
		} finally {
			db.close();
		}
	} catch {
		return [];
	}
}

/** One queued blob, or null when the id is not queued. */
export async function readBlob(userId: string, id: string): Promise<BlobRow | null> {
	try {
		const db = await open(userId);
		try {
			const row = (await request(db.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(id))) as
				BlobRow | undefined;
			return row ?? null;
		} finally {
			db.close();
		}
	} catch {
		return null;
	}
}

/** Stores blobs in one transaction. Returns false when they could not be stored (nothing is stored then). */
export async function putBlobs(userId: string, rows: BlobRow[]): Promise<boolean> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction(BLOBS, 'readwrite');
			for (const row of rows) tx.objectStore(BLOBS).put(row);
			await done(tx);
			return true;
		} finally {
			db.close();
		}
	} catch {
		return false;
	}
}

/** Removes blobs (uploaded, or dropped before they were). */
export async function deleteBlobs(userId: string, ids: string[]): Promise<void> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction(BLOBS, 'readwrite');
			for (const id of ids) tx.objectStore(BLOBS).delete(id);
			await done(tx);
		} finally {
			db.close();
		}
	} catch {
		// The blobs stay and are dealt with next time.
	}
}

/** Sets or clears the refused mark of blobs. */
export async function markBlobs(userId: string, ids: string[], refused: boolean): Promise<void> {
	try {
		const db = await open(userId);
		try {
			const tx = db.transaction(BLOBS, 'readwrite');
			const store = tx.objectStore(BLOBS);
			for (const id of ids) {
				const get = store.get(id);
				get.onsuccess = () => {
					const row = get.result as BlobRow | undefined;
					if (!row) return;
					if (refused) store.put({ ...row, refused: true });
					else {
						const rest: BlobRow = { ...row };
						delete rest.refused;
						store.put(rest);
					}
				};
			}
			await done(tx);
		} finally {
			db.close();
		}
	} catch {
		// Unchanged.
	}
}
