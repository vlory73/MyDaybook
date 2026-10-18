/**
 * Key hierarchy (docs/ARCHITECTURE.md §3). Everything here runs on the user's device only.
 *
 *   passphrase --Argon2id--> root --KDF 1--> PWK (wraps MK)
 *                                 --KDF 2--> AK  (login proof; server stores SHA-256(AK))
 *   recovery key --BLAKE2b--> rk root --KDF 1--> RWK (wraps MK)
 *                                     --KDF 2--> RAK (recovery proof)
 *   MK (random) --KDF 10--> record KEK ; MK wraps the identity private key
 */
import { concat, fromCrockford, toCrockford, utf8 } from './encoding';
import { sodium } from './sodium';

export const KEY_BYTES = 32;
export const SALT_BYTES = 16;
export const RECOVERY_KEY_BYTES = 20; // 160 bits -> 32 Crockford characters -> 8 groups of 4

const CTX_PASSPHRASE = 'MDBkdf01';
const CTX_RECOVERY = 'MDBrcv01';
const CTX_MASTER = 'MDBkeys1';
const RECOVERY_HASH_KEY = 'MDB-recovery-key-v1';

export type KdfParams = { alg: 'argon2id13'; ops: number; memBytes: number };

/** Production defaults: 64 MiB, 3 passes (calibrated on a real iPhone during M2). Stored per user, upgradable. */
export const DEFAULT_KDF: KdfParams = { alg: 'argon2id13', ops: 3, memBytes: 64 * 1024 * 1024 };

/** Unicode-normalise so "æ" typed on two keyboards derives the same key. */
export function normalizePassphrase(passphrase: string): string {
	return passphrase.normalize('NFKC');
}

export function randomBytes(length: number): Uint8Array {
	return sodium().randombytes_buf(length);
}

export type PassphraseKeys = { pwk: Uint8Array; authKey: Uint8Array };

export function deriveFromPassphrase(
	passphrase: string,
	salt: Uint8Array,
	params: KdfParams
): PassphraseKeys {
	const s = sodium();
	if (params.alg !== 'argon2id13') throw new Error(`unsupported kdf ${params.alg}`);
	if (salt.length !== SALT_BYTES) throw new Error('bad salt length');
	const root = s.crypto_pwhash(
		KEY_BYTES,
		utf8.encode(normalizePassphrase(passphrase)),
		salt,
		params.ops,
		params.memBytes,
		s.crypto_pwhash_ALG_ARGON2ID13
	);
	try {
		return {
			pwk: s.crypto_kdf_derive_from_key(KEY_BYTES, 1, CTX_PASSPHRASE, root),
			authKey: s.crypto_kdf_derive_from_key(KEY_BYTES, 2, CTX_PASSPHRASE, root)
		};
	} finally {
		s.memzero(root);
	}
}

export type RecoveryKeys = { rwk: Uint8Array; recoveryAuthKey: Uint8Array };

export function deriveFromRecoveryKey(recoveryKey: Uint8Array): RecoveryKeys {
	const s = sodium();
	if (recoveryKey.length !== RECOVERY_KEY_BYTES) throw new Error('bad recovery key length');
	const root = s.crypto_generichash(KEY_BYTES, recoveryKey, utf8.encode(RECOVERY_HASH_KEY));
	try {
		return {
			rwk: s.crypto_kdf_derive_from_key(KEY_BYTES, 1, CTX_RECOVERY, root),
			recoveryAuthKey: s.crypto_kdf_derive_from_key(KEY_BYTES, 2, CTX_RECOVERY, root)
		};
	} finally {
		s.memzero(root);
	}
}

/** "7KQ2-M9XA-…": 8 groups of 4 for display and printing. */
export function formatRecoveryKey(key: Uint8Array): string {
	return (toCrockford(key).match(/.{4}/g) ?? []).join('-');
}

/** Accepts the key as typed (any case, with or without dashes/spaces). Returns null if it can't be a key. */
export function parseRecoveryKey(text: string): Uint8Array | null {
	return fromCrockford(text, RECOVERY_KEY_BYTES);
}

/** Groups of the formatted key, for the "type groups 3 and 7" confirmation step. */
export function recoveryKeyGroups(key: Uint8Array): string[] {
	return formatRecoveryKey(key).split('-');
}

// ---- Wrapping: XChaCha20-Poly1305 with a random nonce; AD binds the blob to its purpose and owner ----

export function wrap(key: Uint8Array, wrappingKey: Uint8Array, ad: string): Uint8Array {
	const s = sodium();
	const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
	const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(key, utf8.encode(ad), null, nonce, wrappingKey);
	return concat(nonce, ct);
}

/** Throws if the wrapping key or associated data is wrong, or the blob was altered. */
export function unwrap(blob: Uint8Array, wrappingKey: Uint8Array, ad: string): Uint8Array {
	const s = sodium();
	const n = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
	if (blob.length <= n) throw new Error('bad wrapped key');
	return s.crypto_aead_xchacha20poly1305_ietf_decrypt(
		null,
		blob.subarray(n),
		utf8.encode(ad),
		blob.subarray(0, n),
		wrappingKey
	);
}

export const ad = {
	masterKey: (userId: string) => `mk/v1/${userId}`,
	identityKey: (userId: string) => `idk/v1/${userId}`,
	recordKey: (userId: string, recordId: string) => `rec/v1/${userId}/${recordId}`
};

export function recordKek(masterKey: Uint8Array): Uint8Array {
	return sodium().crypto_kdf_derive_from_key(KEY_BYTES, 10, CTX_MASTER, masterKey);
}

// ---- Account-level operations ----

/** What the server stores for a user (all binary values; the transport layer base64-encodes them). */
export type AccountBundle = {
	kdfSalt: Uint8Array;
	kdfParams: KdfParams;
	authKey: Uint8Array; // sent at signup/login; the server keeps only its SHA-256
	recoveryAuthKey: Uint8Array; // likewise
	wrappedMkByPassphrase: Uint8Array;
	wrappedMkByRecovery: Uint8Array;
	publicKey: Uint8Array;
	wrappedPrivateKey: Uint8Array;
};

export type UnlockedKeys = {
	masterKey: Uint8Array;
	kek: Uint8Array;
	privateKey: Uint8Array;
	publicKey: Uint8Array;
};

export type NewAccount = { bundle: AccountBundle; recoveryKey: Uint8Array; keys: UnlockedKeys };

export function createAccount(
	userId: string,
	passphrase: string,
	params: KdfParams = DEFAULT_KDF
): NewAccount {
	const s = sodium();
	const kdfSalt = randomBytes(SALT_BYTES);
	const masterKey = randomBytes(KEY_BYTES);
	const recoveryKey = randomBytes(RECOVERY_KEY_BYTES);
	const identity = s.crypto_box_keypair();
	const { pwk, authKey } = deriveFromPassphrase(passphrase, kdfSalt, params);
	const { rwk, recoveryAuthKey } = deriveFromRecoveryKey(recoveryKey);
	const bundle: AccountBundle = {
		kdfSalt,
		kdfParams: params,
		authKey,
		recoveryAuthKey,
		wrappedMkByPassphrase: wrap(masterKey, pwk, ad.masterKey(userId)),
		wrappedMkByRecovery: wrap(masterKey, rwk, ad.masterKey(userId)),
		publicKey: identity.publicKey,
		wrappedPrivateKey: wrap(identity.privateKey, masterKey, ad.identityKey(userId))
	};
	s.memzero(pwk);
	s.memzero(rwk);
	return {
		bundle,
		recoveryKey,
		keys: {
			masterKey,
			kek: recordKek(masterKey),
			privateKey: identity.privateKey,
			publicKey: identity.publicKey
		}
	};
}

function openKeys(
	userId: string,
	masterKey: Uint8Array,
	wrappedPrivateKey: Uint8Array,
	publicKey: Uint8Array
): UnlockedKeys {
	return {
		masterKey,
		kek: recordKek(masterKey),
		privateKey: unwrap(wrappedPrivateKey, masterKey, ad.identityKey(userId)),
		publicKey
	};
}

type StoredForPassphrase = Pick<
	AccountBundle,
	'kdfSalt' | 'kdfParams' | 'wrappedMkByPassphrase' | 'wrappedPrivateKey' | 'publicKey'
>;

/** Unlock with an already-derived passphrase wrapping key (saves a second Argon2id run at login). */
export function unlockWithPwk(
	userId: string,
	pwk: Uint8Array,
	stored: Pick<AccountBundle, 'wrappedMkByPassphrase' | 'wrappedPrivateKey' | 'publicKey'>
): UnlockedKeys {
	const mk = unwrap(stored.wrappedMkByPassphrase, pwk, ad.masterKey(userId));
	return openKeys(userId, mk, stored.wrappedPrivateKey, stored.publicKey);
}

/** Unlock with the passphrase. Throws on a wrong passphrase (AEAD authentication fails). */
export function unlockWithPassphrase(
	userId: string,
	passphrase: string,
	stored: StoredForPassphrase
): UnlockedKeys {
	const { pwk, authKey } = deriveFromPassphrase(passphrase, stored.kdfSalt, stored.kdfParams);
	sodium().memzero(authKey);
	try {
		return unlockWithPwk(userId, pwk, stored);
	} finally {
		sodium().memzero(pwk);
	}
}

export function unlockWithRecoveryKey(
	userId: string,
	recoveryKey: Uint8Array,
	stored: Pick<AccountBundle, 'wrappedMkByRecovery' | 'wrappedPrivateKey' | 'publicKey'>
): UnlockedKeys {
	const { rwk, recoveryAuthKey } = deriveFromRecoveryKey(recoveryKey);
	sodium().memzero(recoveryAuthKey);
	try {
		const mk = unwrap(stored.wrappedMkByRecovery, rwk, ad.masterKey(userId));
		return openKeys(userId, mk, stored.wrappedPrivateKey, stored.publicKey);
	} finally {
		sodium().memzero(rwk);
	}
}

/** New passphrase: fresh salt, new PWK/AK, MK re-wrapped. Content is untouched. */
export function rewrapForPassphrase(
	userId: string,
	masterKey: Uint8Array,
	passphrase: string,
	params: KdfParams = DEFAULT_KDF
) {
	const kdfSalt = randomBytes(SALT_BYTES);
	const { pwk, authKey } = deriveFromPassphrase(passphrase, kdfSalt, params);
	const wrappedMkByPassphrase = wrap(masterKey, pwk, ad.masterKey(userId));
	sodium().memzero(pwk);
	return { kdfSalt, kdfParams: params, authKey, wrappedMkByPassphrase };
}

/** New recovery key (issued after every recovery, because the old one has been typed on a device). */
export function rewrapForNewRecoveryKey(userId: string, masterKey: Uint8Array) {
	const recoveryKey = randomBytes(RECOVERY_KEY_BYTES);
	const { rwk, recoveryAuthKey } = deriveFromRecoveryKey(recoveryKey);
	const wrappedMkByRecovery = wrap(masterKey, rwk, ad.masterKey(userId));
	sodium().memzero(rwk);
	return { recoveryKey, recoveryAuthKey, wrappedMkByRecovery };
}

/** Best-effort wipe on lock. JavaScript can't guarantee no copies remain, but this removes the live ones. */
export function wipe(keys: UnlockedKeys | null | undefined): void {
	if (!keys) return;
	const s = sodium();
	s.memzero(keys.masterKey);
	s.memzero(keys.kek);
	s.memzero(keys.privateKey);
}
