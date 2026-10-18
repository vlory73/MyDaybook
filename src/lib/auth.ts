/**
 * Account flows that combine the crypto core with the auth API (ARCHITECTURE §3). Everything secret is derived
 * here, on the device; the server only receives verifiers (auth keys) and wrapped keys. Passphrases and the
 * recovery key are never sent, stored or logged.
 */
import { ApiError, apiGet, apiPost } from '$lib/api';
import type { Identity, SessionResponse } from '$lib/api';
import { fromB64, toB64 } from '$lib/crypto/encoding';
import {
	DEFAULT_KDF,
	deriveFromPassphrase,
	deriveFromRecoveryKey,
	rewrapForNewRecoveryKey,
	rewrapForPassphrase,
	unlockWithPwk,
	unlockWithRecoveryKey,
	wipe
} from '$lib/crypto/keys';
import type { AccountBundle, KdfParams, UnlockedKeys } from '$lib/crypto/keys';
import { initCrypto, sodium } from '$lib/crypto/sodium';
import type { MessageKey } from '$lib/i18n/en';
import {
	bundleFromWire,
	establish,
	getBundle,
	getKeys,
	nextFrame,
	session,
	updateBundle
} from '$lib/session.svelte';
import type { StoredBundle } from '$lib/session.svelte';

/** Server and network failures that every form words the same way. Form-specific codes are handled by the caller. */
export function commonErrorKey(err: unknown): MessageKey {
	if (err instanceof ApiError) {
		if (err.code === 'network') return 'auth.error.network';
		if (err.status === 429) return 'auth.error.rateLimited';
	}
	return 'auth.error.generic';
}

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

function zero(...arrays: Uint8Array[]): void {
	for (const a of arrays) sodium().memzero(a);
}

/**
 * Sign in in up to two steps. The first derives keys locally (one Argon2id run) and proves the auth key. If the
 * account has two-step sign-in, the server answers `totp_required`; the derived keys then stay in memory (in the
 * returned `PendingSignIn`) so the code step does not repeat the Argon2id run. Call `discardSignIn` if abandoned.
 */
export type PendingSignIn = { username: string; pwk: Uint8Array; authKey: Uint8Array };

async function finishSignIn(p: PendingSignIn, totp?: string): Promise<void> {
	const res = await apiPost<SessionResponse>('/api/auth/login', {
		username: p.username,
		authKey: toB64(p.authKey),
		...(totp === undefined ? {} : { totp })
	});
	const stored = bundleFromWire(res.bundle);
	// The PWK derived earlier already opens the bundle: one Argon2id run per sign-in, not two.
	const keys = unlockWithPwk(res.userId, p.pwk, stored);
	zero(p.pwk, p.authKey);
	establish({ userId: res.userId, username: res.username, role: res.role }, stored, keys);
}

/** Returns `null` when signed in, or the pending state when a code is needed. Throws ApiError on failure. */
export async function signIn(rawUsername: string, passphrase: string): Promise<PendingSignIn | null> {
	await initCrypto();
	const username = normalizeUsername(rawUsername);
	const pre = await apiPost<{ kdfSalt: string; kdfParams: KdfParams }>('/api/auth/prelogin', { username });
	await nextFrame();
	const { pwk, authKey } = deriveFromPassphrase(passphrase, fromB64(pre.kdfSalt), pre.kdfParams);
	const pending: PendingSignIn = { username, pwk, authKey };
	try {
		await finishSignIn(pending);
		return null;
	} catch (err) {
		if (err instanceof ApiError && err.code === 'totp_required') return pending;
		discardSignIn(pending);
		throw err;
	}
}

/** Second step: sends the six-digit code with the kept keys. A wrong code throws; the pending state stays usable. */
export async function signInWithCode(p: PendingSignIn, code: string): Promise<void> {
	await finishSignIn(p, code);
}

export function discardSignIn(p: PendingSignIn | null): void {
	if (p) zero(p.pwk, p.authKey);
}

// ---- Two-step sign-in (TOTP) ----

export type TotpSetup = { secret: string; uri: string };

export const totpStatus = () => apiGet<{ enabled: boolean }>('/api/auth/totp');

/** Starts enrolment. Throws ApiError 401 (wrong passphrase) or 409 `totp_already_enabled`. */
export async function startTotpSetup(passphrase: string): Promise<TotpSetup> {
	const key = await currentAuthKey(passphrase);
	try {
		return await apiPost<TotpSetup>('/api/auth/totp/setup', { authKey: toB64(key) });
	} finally {
		zero(key);
	}
}

/** Throws ApiError 401 `invalid_totp` for a wrong code. */
export const confirmTotp = (code: string) => apiPost('/api/auth/totp/enable', { code });

/** Throws ApiError 401 `invalid_credentials` (passphrase) or `invalid_totp` (code). */
export async function disableTotp(passphrase: string, code: string): Promise<void> {
	const key = await currentAuthKey(passphrase);
	try {
		await apiPost('/api/auth/totp/disable', { authKey: toB64(key), code });
	} finally {
		zero(key);
	}
}

/** The auth key for the current passphrase, from the cached salt and parameters (for sensitive actions). */
async function currentAuthKey(passphrase: string): Promise<Uint8Array> {
	await initCrypto();
	await nextFrame();
	const stored = getBundle();
	const { pwk, authKey } = deriveFromPassphrase(passphrase, stored.kdfSalt, stored.kdfParams);
	zero(pwk);
	return authKey;
}

/** Throws ApiError 401 `invalid_credentials` when the current passphrase is wrong. */
export async function changePassphrase(current: string, next: string): Promise<void> {
	const identity = session.identity;
	if (!identity) throw new Error('no session');
	const currentKey = await currentAuthKey(current);
	await nextFrame();
	const fresh = rewrapForPassphrase(identity.userId, getKeys().masterKey, next, DEFAULT_KDF);
	try {
		await apiPost('/api/auth/passphrase', {
			currentAuthKey: toB64(currentKey),
			kdfSalt: toB64(fresh.kdfSalt),
			kdfParams: fresh.kdfParams,
			authKey: toB64(fresh.authKey),
			wrappedMkByPassphrase: toB64(fresh.wrappedMkByPassphrase)
		});
	} finally {
		zero(currentKey, fresh.authKey);
	}
	const old = getBundle();
	updateBundle({
		...old,
		kdfSalt: fresh.kdfSalt,
		kdfParams: fresh.kdfParams,
		wrappedMkByPassphrase: fresh.wrappedMkByPassphrase
	});
}

/** Erases the account on the server. Throws ApiError 401 (wrong passphrase) or 409 `last_guardian`. */
export async function deleteAccount(passphrase: string): Promise<void> {
	const key = await currentAuthKey(passphrase);
	try {
		await apiPost('/api/account/delete', { authKey: toB64(key) });
	} finally {
		zero(key);
	}
}

// ---- Recovery ----

export type RecoverySession = {
	identity: Pick<Identity, 'userId'> & { username: string };
	recoveryToken: string;
	keys: UnlockedKeys;
	stored: Pick<StoredBundle, 'wrappedPrivateKey' | 'publicKey'>;
};

/** Proves possession of the recovery key and opens the master key with it. Throws ApiError 401 if it's wrong. */
export async function startRecovery(rawUsername: string, recoveryKey: Uint8Array): Promise<RecoverySession> {
	await initCrypto();
	const username = normalizeUsername(rawUsername);
	const { rwk, recoveryAuthKey } = deriveFromRecoveryKey(recoveryKey);
	let res: {
		recoveryToken: string;
		userId: string;
		wrappedMkByRecovery: string;
		wrappedPrivateKey: string;
		publicKey: string;
	};
	try {
		res = await apiPost('/api/auth/recover/start', { username, recoveryAuthKey: toB64(recoveryAuthKey) });
	} finally {
		zero(rwk, recoveryAuthKey);
	}
	const wrappedPrivateKey = fromB64(res.wrappedPrivateKey);
	const publicKey = fromB64(res.publicKey);
	const keys = unlockWithRecoveryKey(res.userId, recoveryKey, {
		wrappedMkByRecovery: fromB64(res.wrappedMkByRecovery),
		wrappedPrivateKey,
		publicKey
	});
	return {
		identity: { userId: res.userId, username },
		recoveryToken: res.recoveryToken,
		keys,
		stored: { wrappedPrivateKey, publicKey }
	};
}

export type RecoveryPrepared = {
	passphrase: ReturnType<typeof rewrapForPassphrase>;
	recovery: ReturnType<typeof rewrapForNewRecoveryKey>;
};

/** Derives everything for the new passphrase and a fresh recovery key. Nothing is sent yet. */
export async function prepareRecovery(r: RecoverySession, newPassphrase: string): Promise<RecoveryPrepared> {
	await nextFrame();
	return {
		passphrase: rewrapForPassphrase(r.identity.userId, r.keys.masterKey, newPassphrase, DEFAULT_KDF),
		recovery: rewrapForNewRecoveryKey(r.identity.userId, r.keys.masterKey)
	};
}

/** Sends the new secrets, replacing the old ones and ending all other sessions, and signs in on this device. */
export async function finishRecovery(r: RecoverySession, p: RecoveryPrepared): Promise<void> {
	// Nothing is zeroed before success: after a network error the same prepared values can be sent again.
	const res = await apiPost<Identity>('/api/auth/recover/finish', {
		recoveryToken: r.recoveryToken,
		kdfSalt: toB64(p.passphrase.kdfSalt),
		kdfParams: p.passphrase.kdfParams,
		authKey: toB64(p.passphrase.authKey),
		wrappedMkByPassphrase: toB64(p.passphrase.wrappedMkByPassphrase),
		recoveryAuthKey: toB64(p.recovery.recoveryAuthKey),
		wrappedMkByRecovery: toB64(p.recovery.wrappedMkByRecovery)
	});
	zero(p.passphrase.authKey, p.recovery.recoveryAuthKey, p.recovery.recoveryKey);
	const stored: StoredBundle = {
		kdfSalt: p.passphrase.kdfSalt,
		kdfParams: p.passphrase.kdfParams,
		wrappedMkByPassphrase: p.passphrase.wrappedMkByPassphrase,
		wrappedPrivateKey: r.stored.wrappedPrivateKey,
		publicKey: r.stored.publicKey
	};
	establish({ userId: res.userId, username: res.username, role: res.role }, stored, r.keys);
}

/** Drops key material held by an abandoned recovery. */
export function discardRecovery(r: RecoverySession | null, p: RecoveryPrepared | null): void {
	if (r) wipe(r.keys);
	if (p) zero(p.passphrase.authKey, p.recovery.recoveryAuthKey, p.recovery.recoveryKey);
}

// ---- Signup ----

export function signupBody(
	inviteToken: string,
	userId: string,
	username: string,
	b: AccountBundle,
	consent: object
) {
	return {
		inviteToken,
		userId,
		username,
		kdfSalt: toB64(b.kdfSalt),
		kdfParams: b.kdfParams,
		authKey: toB64(b.authKey),
		recoveryAuthKey: toB64(b.recoveryAuthKey),
		wrappedMkByPassphrase: toB64(b.wrappedMkByPassphrase),
		wrappedMkByRecovery: toB64(b.wrappedMkByRecovery),
		publicKey: toB64(b.publicKey),
		wrappedPrivateKey: toB64(b.wrappedPrivateKey),
		consent
	};
}

export function storedFromAccount(b: AccountBundle): StoredBundle {
	return {
		kdfSalt: b.kdfSalt,
		kdfParams: b.kdfParams,
		wrappedMkByPassphrase: b.wrappedMkByPassphrase,
		wrappedPrivateKey: b.wrappedPrivateKey,
		publicKey: b.publicKey
	};
}
