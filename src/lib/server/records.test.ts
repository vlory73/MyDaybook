import { describe, expect, it } from 'vitest';
import {
	MAX_CIPHERTEXT,
	MIN_CIPHERTEXT,
	b64Range,
	decodeCursor,
	encodeCursor,
	parseBaseRev,
	parseCiphertext,
	parseLimit,
	parseWrappedKey
} from './records';

const ID = '0b8a3c6e-5f0e-4d6b-9a38-2f1f5a4f6c10';
const b64 = (bytes: Buffer) => bytes.toString('base64url');

describe('cursor', () => {
	it('round-trips updatedAt and id', () => {
		const c = { updatedAt: 1_792_000_000_123, id: ID };
		expect(decodeCursor(encodeCursor(c))).toEqual(c);
	});
	it('rejects anything else', () => {
		for (const bad of [
			'',
			'!!!',
			'x'.repeat(200),
			Buffer.from('12.not-a-uuid').toString('base64url'),
			Buffer.from(`-5.${ID}`).toString('base64url'),
			Buffer.from(`abc.${ID}`).toString('base64url'),
			42,
			null
		]) {
			expect(decodeCursor(bad)).toBeNull();
		}
	});
});

describe('limit', () => {
	it('defaults to 500 and allows 1 to 1000', () => {
		expect(parseLimit(null)).toBe(500);
		expect(parseLimit('1')).toBe(1);
		expect(parseLimit('1000')).toBe(1000);
	});
	it('rejects 0, 1001, negatives and non-numbers', () => {
		for (const bad of ['0', '1001', '-1', '1.5', 'abc', '', '999999']) expect(parseLimit(bad)).toBeNull();
	});
});

describe('wrapped key and ciphertext validators', () => {
	it('accepts exactly 72 bytes for the wrapped key', () => {
		expect(parseWrappedKey(b64(Buffer.alloc(72, 1)))).toHaveLength(72);
		expect(parseWrappedKey(b64(Buffer.alloc(71, 1)))).toBeNull();
		expect(parseWrappedKey(b64(Buffer.alloc(73, 1)))).toBeNull();
		expect(parseWrappedKey(undefined)).toBeNull();
	});
	it('requires version 0x01 and the size window for the ciphertext', () => {
		const make = (len: number, version = 1) => {
			const buf = Buffer.alloc(len, 9);
			buf[0] = version;
			return b64(buf);
		};
		expect(MIN_CIPHERTEXT).toBe(1 + 24 + 256 + 16);
		expect(MAX_CIPHERTEXT).toBe(1 + 24 + 65536 + 16);
		expect(parseCiphertext(make(MIN_CIPHERTEXT))).not.toBeNull();
		expect(parseCiphertext(make(MAX_CIPHERTEXT))).not.toBeNull();
		expect(parseCiphertext(make(MIN_CIPHERTEXT - 1))).toBeNull();
		expect(parseCiphertext(make(MAX_CIPHERTEXT + 1))).toBeNull();
		expect(parseCiphertext(make(MIN_CIPHERTEXT, 2))).toBeNull();
		expect(parseCiphertext(make(MIN_CIPHERTEXT, 0))).toBeNull();
	});
	it('rejects non-canonical or padded base64', () => {
		expect(b64Range(`${b64(Buffer.alloc(72, 1))}=`, 72, 72)).toBeNull();
		expect(b64Range('a+b/', 1, 10)).toBeNull();
	});
});

describe('baseRev', () => {
	it('is undefined when absent, null when invalid', () => {
		expect(parseBaseRev(undefined)).toBeUndefined();
		expect(parseBaseRev(3)).toBe(3);
		expect(parseBaseRev(0)).toBe(0);
		expect(parseBaseRev(-1)).toBeNull();
		expect(parseBaseRev(1.5)).toBeNull();
		expect(parseBaseRev('2')).toBeNull();
	});
});
