import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	base32Decode,
	base32Encode,
	decryptSecret,
	encryptSecret,
	generateSecret,
	hotp,
	otpauthUri,
	parseCode,
	stepOf,
	totp,
	verifyTotp
} from './totp';

const RFC_SECRET = Buffer.from('12345678901234567890');

describe('TOTP (RFC 6238, SHA-1)', () => {
	const vectors: [number, string][] = [
		[59, '94287082'],
		[1111111109, '07081804'],
		[1111111111, '14050471'],
		[1234567890, '89005924'],
		[2000000000, '69279037'],
		[20000000000, '65353130']
	];

	it.each(vectors)('matches the RFC test vector at %i s (8 digits)', (seconds, expected) => {
		expect(totp(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
	});

	it('truncates to the same last six digits', () => {
		for (const [seconds, expected] of vectors) {
			expect(totp(RFC_SECRET, seconds * 1000)).toBe(expected.slice(2));
		}
	});

	it('matches the RFC 4226 HOTP vectors', () => {
		const expected = ['755224', '287082', '359152', '969429', '338314'];
		expected.forEach((code, i) => expect(hotp(RFC_SECRET, i)).toBe(code));
	});
});

describe('base32', () => {
	it('round trips and encodes the RFC secret', () => {
		expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
		expect(base32Decode('gezd gnbv-GY3TQOJQGEZDGNBVGY3TQOJQ').equals(RFC_SECRET)).toBe(true);
		const s = generateSecret();
		expect(s).toMatch(/^[A-Z2-7]{32}$/);
		expect(base32Encode(base32Decode(s))).toBe(s);
	});
});

describe('verifyTotp', () => {
	const now = 1_700_000_000_000;
	const at = (offsetSteps: number) => totp(RFC_SECRET, now + offsetSteps * 30_000);

	it('accepts the current step and one step either side', () => {
		expect(verifyTotp(RFC_SECRET, at(0), now, null)).toBe(stepOf(now));
		expect(verifyTotp(RFC_SECRET, at(-1), now, null)).toBe(stepOf(now) - 1);
		expect(verifyTotp(RFC_SECRET, at(1), now, null)).toBe(stepOf(now) + 1);
	});

	it('rejects two steps away and wrong codes', () => {
		expect(verifyTotp(RFC_SECRET, at(-2), now, null)).toBeNull();
		expect(verifyTotp(RFC_SECRET, at(2), now, null)).toBeNull();
		expect(verifyTotp(RFC_SECRET, '000000', now, null)).toBeNull();
	});

	it('rejects replays: the same step or any older one', () => {
		const step = verifyTotp(RFC_SECRET, at(0), now, null)!;
		expect(verifyTotp(RFC_SECRET, at(0), now, step)).toBeNull();
		expect(verifyTotp(RFC_SECRET, at(-1), now, step)).toBeNull();
		expect(verifyTotp(RFC_SECRET, at(1), now, step)).toBe(step + 1);
	});
});

describe('parseCode', () => {
	it('accepts six digits with spaces or dashes only', () => {
		expect(parseCode('123 456')).toBe('123456');
		expect(parseCode('123-456')).toBe('123456');
		expect(parseCode('12345')).toBeNull();
		expect(parseCode('1234567')).toBeNull();
		expect(parseCode('12345a')).toBeNull();
		expect(parseCode(123456)).toBeNull();
	});
});

describe('otpauthUri', () => {
	it('carries issuer, digits and period', () => {
		expect(otpauthUri('anna', 'ABCDEFGH')).toBe(
			'otpauth://totp/MyDaybook:anna?secret=ABCDEFGH&issuer=MyDaybook&digits=6&period=30'
		);
	});
});

describe('secret encryption at rest', () => {
	const key = randomBytes(32);
	it('round trips, with a fresh nonce each time', () => {
		const s = generateSecret();
		const a = encryptSecret(s, key);
		const b = encryptSecret(s, key);
		expect(a.equals(b)).toBe(false);
		expect(a.toString('latin1')).not.toContain(s);
		expect(decryptSecret(a, key)).toBe(s);
	});
	it('fails with another key or a damaged blob', () => {
		const a = encryptSecret(generateSecret(), key);
		expect(decryptSecret(a, randomBytes(32))).toBeNull();
		const bad = Buffer.from(a);
		bad[bad.length - 1] = bad[bad.length - 1]! ^ 1;
		expect(decryptSecret(bad, key)).toBeNull();
		expect(decryptSecret(Buffer.alloc(5), key)).toBeNull();
	});
});
