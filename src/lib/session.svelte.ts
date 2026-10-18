/**
 * Client session and key state (ARCHITECTURE §3.2).
 *
 * - `session` (reactive) holds only non-secret facts: status, identity and the auto-lock preference.
 * - The unlocked keys live in a plain module variable below. They are never put in `$state`, localStorage,
 *   sessionStorage or IndexedDB, so they cannot be serialised by accident and vanish on reload.
 * - The wrapped bundle (what the server also stores) is cached in memory so the unlock view works offline.
 *
 * Lock keeps the server session and drops the keys. Sign out ends the server session too.
 */
import { browser } from '$app/environment';
import { ApiError, apiGet, apiPost, setUnauthenticatedHandler } from '$lib/api';
import type { Identity, SessionResponse, WireBundle } from '$lib/api';
import { initCrypto } from '$lib/crypto/sodium';
import { fromB64 } from '$lib/crypto/encoding';
import { unlockWithPassphrase, wipe } from '$lib/crypto/keys';
import type { AccountBundle, UnlockedKeys } from '$lib/crypto/keys';

export type SessionStatus = 'loading' | 'signed-out' | 'locked' | 'unlocked';
export type StoredBundle = Pick<
	AccountBundle,
	'kdfSalt' | 'kdfParams' | 'wrappedMkByPassphrase' | 'wrappedPrivateKey' | 'publicKey'
>;

/** Minutes of inactivity before the diary locks. A per-device preference, not data (D9). */
export const AUTO_LOCK_CHOICES = [1, 2, 5, 10, 15, 30] as const;
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
/** Seconds the page may stay hidden before it locks. */
export const HIDDEN_LOCK_SECONDS = 60;
const AUTO_LOCK_STORAGE_KEY = 'auto-lock-minutes';

function loadAutoLock(): number {
	if (!browser) return DEFAULT_AUTO_LOCK_MINUTES;
	try {
		const saved = Number(localStorage.getItem(AUTO_LOCK_STORAGE_KEY));
		if ((AUTO_LOCK_CHOICES as readonly number[]).includes(saved)) return saved;
	} catch {
		// Storage unavailable: use the default.
	}
	return DEFAULT_AUTO_LOCK_MINUTES;
}

export type FlashMessage = 'deleted' | 'signedOut' | 'sessionEnded';

export const session = $state<{
	status: SessionStatus;
	identity: Identity | null;
	autoLockMinutes: number;
	/** The first session check could not reach the server. */
	loadFailed: boolean;
	/** One-shot message for the login page (goodbye after deletion, session ended elsewhere). */
	flash: FlashMessage | null;
}>({
	status: 'loading',
	identity: null,
	autoLockMinutes: loadAutoLock(),
	loadFailed: false,
	flash: null
});

let keys: UnlockedKeys | null = null;
let bundle: StoredBundle | null = null;
let lockHooks: (() => void)[] = [];

setUnauthenticatedHandler(() => {
	if (session.status === 'locked' || session.status === 'unlocked') {
		dropEverything();
		session.flash = 'sessionEnded';
	}
});

/** The unlocked keys. Throws when locked: callers must only run while `session.status === 'unlocked'`. */
export function getKeys(): UnlockedKeys {
	if (!keys) throw new Error('locked');
	return keys;
}

/** The cached wrapped bundle (salt, KDF parameters, wrapped keys). */
export function getBundle(): StoredBundle {
	if (!bundle) throw new Error('no bundle');
	return bundle;
}

/** Register cleanup that must run when the diary locks (decrypted caches, open editors). Returns an unsubscribe. */
export function onLock(hook: () => void): () => void {
	lockHooks.push(hook);
	return () => {
		lockHooks = lockHooks.filter((h) => h !== hook);
	};
}

export function bundleFromWire(wire: WireBundle): StoredBundle {
	return {
		kdfSalt: fromB64(wire.kdfSalt),
		kdfParams: wire.kdfParams,
		wrappedMkByPassphrase: fromB64(wire.wrappedMkByPassphrase),
		wrappedPrivateKey: fromB64(wire.wrappedPrivateKey),
		publicKey: fromB64(wire.publicKey)
	};
}

function runLockHooks(): void {
	for (const hook of lockHooks) {
		try {
			hook();
		} catch {
			// A failing hook must not stop the lock.
		}
	}
}

function dropKeys(): void {
	wipe(keys);
	keys = null;
	runLockHooks();
}

function dropEverything(): void {
	dropKeys();
	bundle = null;
	session.identity = null;
	session.status = 'signed-out';
}

/** First call on app start: is there a server session? If so, the app starts locked. */
export async function loadSession(): Promise<void> {
	session.loadFailed = false;
	try {
		await initCrypto();
		const res = await apiGet<SessionResponse>('/api/auth/session');
		bundle = bundleFromWire(res.bundle);
		session.identity = { userId: res.userId, username: res.username, role: res.role };
		session.status = keys ? 'unlocked' : 'locked';
	} catch (err) {
		if (err instanceof ApiError && err.status === 401) {
			dropEverything();
		} else {
			session.loadFailed = true;
		}
	}
}

/** Takes ownership of freshly derived keys (after signup, login or recovery). */
export function establish(identity: Identity, stored: StoredBundle, unlocked: UnlockedKeys): void {
	if (keys && keys !== unlocked) wipe(keys);
	keys = unlocked;
	bundle = stored;
	session.identity = identity;
	session.status = 'unlocked';
	session.flash = null;
}

/** Replaces the cached bundle after a passphrase change on this device. */
export function updateBundle(stored: StoredBundle): void {
	bundle = stored;
}

/** Lets the browser paint (a spinner) before a synchronous Argon2id run blocks the main thread. */
export function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => setTimeout(resolve, 0));
	});
}

/**
 * Unlock with the passphrase. Refreshes the wrapped bundle first (it may have changed on another device); if the
 * server cannot be reached the cached copy is used, so unlocking works offline. Throws on a wrong passphrase,
 * and with a 401 ApiError when the server session has ended.
 */
export async function unlock(passphrase: string): Promise<void> {
	const identity = session.identity;
	if (!identity || !bundle) throw new Error('no session');
	try {
		const fresh = await apiGet<SessionResponse>('/api/auth/session');
		bundle = bundleFromWire(fresh.bundle);
	} catch (err) {
		if (err instanceof ApiError && err.status === 401) throw err; // the handler already signed out
		// Offline or server trouble: fall back to the cached bundle.
	}
	await initCrypto();
	await nextFrame();
	keys = unlockWithPassphrase(identity.userId, passphrase, bundle);
	session.status = 'unlocked';
}

/** Wipes the keys and any decrypted state; the server session stays. */
export function lock(): void {
	if (session.status !== 'unlocked') return;
	dropKeys();
	session.status = 'locked';
}

/** Ends the server session, wipes everything held in memory. */
export async function signOut(flash: FlashMessage | null = 'signedOut'): Promise<void> {
	try {
		await apiPost('/api/auth/logout');
	} catch {
		// Even if the server can't be reached, this device forgets everything.
	}
	dropEverything();
	session.flash = flash;
}

/** After the account was deleted on the server: forget everything and leave a goodbye message. */
export function afterDeletion(): void {
	dropEverything();
	session.flash = 'deleted';
}

export function setAutoLockMinutes(minutes: number): void {
	session.autoLockMinutes = minutes;
	try {
		localStorage.setItem(AUTO_LOCK_STORAGE_KEY, String(minutes));
	} catch {
		// Not persisted; applies until the page is closed.
	}
}
