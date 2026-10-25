/** Input validation for the auth API. Every function returns the parsed value, or null when invalid. */
import { CONSENT_VERSION } from '$lib/consent';

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const B64URL_RE = /^[A-Za-z0-9_-]*$/;
const HASH_RE = /^[A-Za-z0-9+/=_-]{1,128}$/;

export const SALT_LEN = 16;
export const KEY_LEN = 32;
/** nonce 24 + key 32 + Poly1305 tag 16 */
export const WRAPPED_LEN = 24 + 32 + 16;
export const MIN_MEM = 8 * 1024 * 1024;
export const MAX_MEM = 1024 * 1024 * 1024;

export type KdfParamsIn = { alg: 'argon2id13'; ops: number; memBytes: number };

export function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** URL-safe base64 without padding, decoding to exactly `length` bytes. */
export function b64Bytes(v: unknown, length: number): Buffer | null {
	if (typeof v !== 'string' || v.length > 4 * length || !B64URL_RE.test(v)) return null;
	const buf = Buffer.from(v, 'base64url');
	if (buf.length !== length) return null;
	// Reject non-canonical spellings so one value has one encoding.
	return buf.toString('base64url') === v ? buf : null;
}

export function parseUsername(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const name = v.trim().toLowerCase();
	return USERNAME_RE.test(name) ? name : null;
}

/** Lenient variant for login/prelogin: any non-empty string up to 64 chars, lowercased. Unknown names fail later. */
export function looseUsername(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const name = v.trim().toLowerCase();
	return name.length > 0 && name.length <= 64 ? name : null;
}

export function parseUuidV4(v: unknown): string | null {
	return typeof v === 'string' && UUID_V4_RE.test(v) ? v : null;
}

export function parseKdfParams(v: unknown): KdfParamsIn | null {
	if (!isObject(v)) return null;
	const { alg, ops, memBytes } = v;
	if (alg !== 'argon2id13') return null;
	if (typeof ops !== 'number' || !Number.isInteger(ops) || ops < 1 || ops > 10) return null;
	if (
		typeof memBytes !== 'number' ||
		!Number.isInteger(memBytes) ||
		memBytes < MIN_MEM ||
		memBytes > MAX_MEM
	) {
		return null;
	}
	return { alg, ops, memBytes };
}

export function parseConsent(v: unknown): { version: string; textHash: string; locale: 'en' | 'da' } | null {
	if (!isObject(v)) return null;
	const { version, textHash, locale } = v;
	if (version !== CONSENT_VERSION) return null; // new accounts always agree to the newest text
	if (typeof textHash !== 'string' || !HASH_RE.test(textHash)) return null;
	if (locale !== 'en' && locale !== 'da') return null;
	return { version, textHash, locale };
}

/** Invite and recovery tokens: 32 random bytes as base64url (43 characters). */
export function parseToken(v: unknown): string | null {
	return typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
}
