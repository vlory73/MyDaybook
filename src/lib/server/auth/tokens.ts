import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A fresh 256-bit random token, base64url without padding. Only its SHA-256 is ever stored. */
export function newToken(): string {
	return randomBytes(32).toString('base64url');
}

export function sha256(data: Buffer | string): Buffer {
	return createHash('sha256').update(data).digest();
}

/** Constant-time comparison of two digests; false (not a throw) on a length mismatch. */
export function safeEqual(a: Buffer, b: Buffer): boolean {
	return a.length === b.length && timingSafeEqual(a, b);
}

/** True if SHA-256(secret) equals the stored verifier. */
export function verifySecret(secret: Buffer, verifier: Buffer): boolean {
	return safeEqual(sha256(secret), verifier);
}

const DUMMY_VERIFIER = sha256('mydaybook-dummy-verifier');

/** Does the same work as a real check, for unknown users, so timing does not reveal who exists. */
export function dummyVerify(secret: Buffer): false {
	safeEqual(sha256(secret), DUMMY_VERIFIER);
	return false;
}
