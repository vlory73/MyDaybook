/**
 * Device account cache in IndexedDB (ARCHITECTURE §3.2): who was signed in on this device and the passphrase-wrapped
 * key bundle, so the diary can be unlocked with no connection. It holds exactly what the server stores for the account
 * (wrapped keys, salt, KDF parameters, public key) and nothing else: never the passphrase, unwrapped keys or anything
 * decrypted. Deleted on sign-out, session end and account deletion. If IndexedDB is unavailable every function
 * degrades to "nothing cached".
 */
import type { Identity, Role, WireBundle } from '$lib/api';

const DB_NAME = 'mydaybook-device';
const STORE = 'account';
const KEY = 'current';

export type DeviceAccount = { userId: string; username: string; role: Role; bundle: WireBundle };

export function toDeviceAccount(identity: Identity, bundle: WireBundle): DeviceAccount {
	return { userId: identity.userId, username: identity.username, role: identity.role, bundle };
}

/** Accepts only a well-formed record, so a damaged entry reads as "nothing cached". */
export function parseDeviceAccount(value: unknown): DeviceAccount | null {
	if (typeof value !== 'object' || value === null) return null;
	const v = value as Record<string, unknown>;
	const b = v.bundle as Record<string, unknown> | null | undefined;
	if (typeof v.userId !== 'string' || typeof v.username !== 'string') return null;
	if (v.role !== 'admin' && v.role !== 'member') return null;
	if (typeof b !== 'object' || b === null) return null;
	for (const k of ['kdfSalt', 'wrappedMkByPassphrase', 'wrappedPrivateKey', 'publicKey']) {
		if (typeof b[k] !== 'string') return null;
	}
	if (typeof b.kdfParams !== 'object' || b.kdfParams === null) return null;
	return {
		userId: v.userId,
		username: v.username,
		role: v.role,
		bundle: b as unknown as WireBundle
	};
}

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

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		req.onblocked = () => reject(new Error('blocked'));
	});
}

// Operations run one after another, so a delete on sign-out can never be overtaken by an earlier write.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
	const next = queue.then(job, job);
	queue = next.catch(() => undefined);
	return next;
}

export function readDeviceAccount(): Promise<DeviceAccount | null> {
	return serial(async () => {
		try {
			const db = await open();
			try {
				const tx = db.transaction(STORE, 'readonly');
				return parseDeviceAccount(await request(tx.objectStore(STORE).get(KEY)));
			} finally {
				db.close();
			}
		} catch {
			return null;
		}
	});
}

/** Failures are ignored: it is only a convenience for starting offline. */
export function writeDeviceAccount(account: DeviceAccount): Promise<void> {
	return serial(async () => {
		try {
			const db = await open();
			try {
				const tx = db.transaction(STORE, 'readwrite');
				tx.objectStore(STORE).put(account, KEY);
				await done(tx);
			} finally {
				db.close();
			}
		} catch {
			// Nothing cached; starting offline will show the "can't reach the server" screen instead.
		}
	});
}

export function deleteDeviceAccount(): Promise<void> {
	return serial(async () => {
		try {
			const db = await open();
			try {
				const tx = db.transaction(STORE, 'readwrite');
				tx.objectStore(STORE).delete(KEY);
				await done(tx);
			} finally {
				db.close();
			}
		} catch {
			// Unavailable: nothing was stored either.
		}
	});
}
