/**
 * Optional TOTP second factor (RFC 6238; SHA-1, 6 digits, 30 s steps, accepting one step either side).
 * It protects the login session only: it never touches the diary keys (ARCHITECTURE §3.4). Written on node:crypto, no
 * dependency. The secret is stored encrypted with AES-256-GCM under a key derived from SESSION_SECRET (HKDF, info
 * `totp-v1`), as nonce(12) | tag(16) | ciphertext.
 */
import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	hkdfSync,
	randomBytes,
	timingSafeEqual
} from 'node:crypto';
import { brand } from '../../brand';
import { sessionSecret } from './secret';

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_S = 30;
const SECRET_BYTES = 20;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of data) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
		value &= (1 << bits) - 1;
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	return out;
}

export function base32Decode(text: string): Buffer {
	const clean = text.replace(/[\s=-]/g, '').toUpperCase();
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of clean) {
		const i = B32.indexOf(ch);
		if (i < 0) throw new Error('bad base32');
		value = (value << 5) | i;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
			value &= (1 << bits) - 1;
		}
	}
	return Buffer.from(out);
}

/** A new random secret, as base32 text (32 characters for 20 bytes). */
export function generateSecret(): string {
	return base32Encode(randomBytes(SECRET_BYTES));
}

/** RFC 4226 HOTP, dynamic truncation, `digits` digits. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(counter));
	const h = createHmac('sha1', secret).update(msg).digest();
	const off = h[h.length - 1]! & 15;
	const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
	return String(bin % 10 ** digits).padStart(digits, '0');
}

export const stepOf = (timeMs: number) => Math.floor(timeMs / 1000 / TOTP_PERIOD_S);

export function totp(secret: Uint8Array, timeMs: number, digits = TOTP_DIGITS): string {
	return hotp(secret, stepOf(timeMs), digits);
}

/** Cleans what a person types: spaces and dashes removed. Returns null unless exactly six digits remain. */
export function parseCode(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const code = v.replace(/[\s-]/g, '');
	return /^\d{6}$/.test(code) ? code : null;
}

/**
 * Checks `code` against the steps now-1, now and now+1. Returns the matching step, or null. A step at or below
 * `lastUsedStep` is rejected, so a code (or an older one) can never be used twice. All three candidates are always
 * compared, so timing does not reveal which step matched.
 */
export function verifyTotp(
	secret: Uint8Array,
	code: string,
	timeMs: number,
	lastUsedStep: number | null
): number | null {
	const now = stepOf(timeMs);
	const given = Buffer.from(code);
	let hit: number | null = null;
	for (const step of [now - 1, now, now + 1]) {
		const want = Buffer.from(hotp(secret, step));
		const equal = given.length === want.length && timingSafeEqual(given, want);
		if (equal && hit === null && (lastUsedStep === null || step > lastUsedStep)) hit = step;
	}
	return hit;
}

/** otpauth:// link that authenticator apps accept. */
export function otpauthUri(username: string, secret: string): string {
	const issuer = encodeURIComponent(brand.displayName);
	const label = `${issuer}:${encodeURIComponent(username)}`;
	return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_S}`;
}

// ---- Encryption at rest ----

function storageKey(secret: Buffer): Buffer {
	return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'totp-v1', 32));
}

export function encryptSecret(base32: string, key: Buffer = sessionSecret()): Buffer {
	const nonce = randomBytes(12);
	const c = createCipheriv('aes-256-gcm', storageKey(key), nonce);
	const ct = Buffer.concat([c.update(base32, 'utf8'), c.final()]);
	return Buffer.concat([nonce, c.getAuthTag(), ct]);
}

/** Returns the base32 secret, or null when the blob is damaged or the key is not the one it was sealed with. */
export function decryptSecret(blob: Buffer, key: Buffer = sessionSecret()): string | null {
	if (blob.length < 12 + 16 + 1) return null;
	try {
		const d = createDecipheriv('aes-256-gcm', storageKey(key), blob.subarray(0, 12));
		d.setAuthTag(blob.subarray(12, 28));
		return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
	} catch {
		return null;
	}
}
