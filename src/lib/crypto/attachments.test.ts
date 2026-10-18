import { beforeAll, describe, expect, it } from 'vitest';
import {
	CHUNK,
	MAX_ATTACHMENT_PLAIN,
	decryptAttachment,
	encryptAttachment,
	encryptedSize,
	initCrypto,
	randomBytes
} from './index';

// Synthetic random bytes only.
beforeAll(async () => {
	await initCrypto();
});

const ENC_CHUNK = CHUNK + 17;

describe('attachment encryption', () => {
	it.each([0, 1, 65531, 65532, 65535, 65536, 200 * 1024])('round-trips %i bytes', (n) => {
		const data = randomBytes(n);
		const { key, blob } = encryptAttachment(data);
		expect(key).toHaveLength(32);
		expect(decryptAttachment(key, blob)).toEqual(data);
	});

	it('pads the ciphertext to a 64 KiB bucket', () => {
		for (const n of [0, 1, 1000, 65531, 65532, 130_000]) {
			const { blob } = encryptAttachment(randomBytes(n));
			expect(blob.length).toBe(encryptedSize(n));
			expect((blob.length - 24) % ENC_CHUNK).toBe(0);
		}
		// 65532 bytes + the 4-byte length fill one chunk exactly; one more byte needs a second.
		expect(encryptedSize(65532)).toBe(24 + ENC_CHUNK);
		expect(encryptedSize(65533)).toBe(24 + 2 * ENC_CHUNK);
		expect(encryptedSize(0)).toBe(encryptedSize(1000));
	});

	it('uses a fresh key and header every time', () => {
		const data = randomBytes(100);
		const a = encryptAttachment(data);
		const b = encryptAttachment(data);
		expect(a.key).not.toEqual(b.key);
		expect(a.blob).not.toEqual(b.blob);
	});

	it('fails on a tampered chunk, header, or wrong key', () => {
		const { key, blob } = encryptAttachment(randomBytes(150_000));
		for (const at of [3, 24 + 10, 24 + ENC_CHUNK + 5, blob.length - 1]) {
			const bad = blob.slice();
			bad[at] = bad[at]! ^ 1;
			expect(() => decryptAttachment(key, bad)).toThrow();
		}
		expect(() => decryptAttachment(randomBytes(32), blob)).toThrow();
	});

	it('fails on a truncated, extended or reordered stream', () => {
		const { key, blob } = encryptAttachment(randomBytes(150_000)); // 3 chunks
		expect(() => decryptAttachment(key, blob.slice(0, 24 + 2 * ENC_CHUNK))).toThrow(); // cut at a boundary
		expect(() => decryptAttachment(key, blob.slice(0, blob.length - 10))).toThrow();
		expect(() => decryptAttachment(key, blob.slice(0, 20))).toThrow();
		expect(() => decryptAttachment(key, new Uint8Array(0))).toThrow();
		const extended = new Uint8Array(blob.length + ENC_CHUNK);
		extended.set(blob);
		expect(() => decryptAttachment(key, extended)).toThrow();
		const swapped = blob.slice();
		swapped.set(blob.subarray(24 + ENC_CHUNK, 24 + 2 * ENC_CHUNK), 24);
		swapped.set(blob.subarray(24, 24 + ENC_CHUNK), 24 + ENC_CHUNK);
		expect(() => decryptAttachment(key, swapped)).toThrow();
	});

	it('does not contain the plaintext', () => {
		const marker = new TextEncoder().encode('SYNTHETIC-MARKER-0123456789');
		const data = new Uint8Array(5000);
		data.set(marker, 100);
		const { blob } = encryptAttachment(data);
		expect(Buffer.from(blob).includes(Buffer.from(marker))).toBe(false);
	});

	it('refuses data that cannot fit the 4 MiB blob limit', () => {
		expect(encryptedSize(MAX_ATTACHMENT_PLAIN)).toBeLessThanOrEqual(4 * 1024 * 1024);
		expect(encryptedSize(MAX_ATTACHMENT_PLAIN + 1)).toBeGreaterThan(4 * 1024 * 1024);
		expect(() => encryptAttachment(new Uint8Array(MAX_ATTACHMENT_PLAIN + 1))).toThrow();
	});
});
