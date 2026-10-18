/**
 * Ciphertext cache in IndexedDB (ARCHITECTURE §5.1): wrapped keys, ciphertext, revision and sync cursor, so a reload
 * downloads only changes. Plaintext never goes in here. One database per user id (`mydaybook-records-<userId>`),
 * deleted on sign-out and account deletion; lock keeps it, because it holds nothing readable.
 * If IndexedDB is unavailable every function degrades to "empty cache": the app then re-downloads everything.
 */
import type { CachedRecord } from './codec';

const STORE = 'records';
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
		const req = indexedDB.open(cacheName(userId), 1);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE, { keyPath: 'id' });
			req.result.createObjectStore(META);
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
