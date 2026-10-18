import { describe, expect, it } from 'vitest';
import { DEFAULT_KDF } from '$lib/crypto/keys';
import { checkApiRequest, isApiPath } from './guard';
import { RateLimiter } from './rate-limit';
import { DEFAULT_KDF_PARAMS, fakeSalt } from './secret';
import { dummyVerify, newToken, safeEqual, sha256, verifySecret } from './tokens';
import {
	b64Bytes,
	parseConsent,
	parseKdfParams,
	parseToken,
	parseUsername,
	parseUuidV4,
	WRAPPED_LEN
} from './validate';

describe('tokens', () => {
	it('are 32 random bytes as unpadded base64url and differ each time', () => {
		const a = newToken();
		const b = newToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(a).not.toBe(b);
		expect(Buffer.from(a, 'base64url')).toHaveLength(32);
	});

	it('hash with SHA-256 and compare in constant time', () => {
		expect(sha256('abc').toString('hex')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
		const secret = Buffer.alloc(32, 7);
		expect(verifySecret(secret, sha256(secret))).toBe(true);
		expect(verifySecret(Buffer.alloc(32, 8), sha256(secret))).toBe(false);
		expect(safeEqual(Buffer.alloc(3), Buffer.alloc(4))).toBe(false);
		expect(dummyVerify(secret)).toBe(false);
	});
});

describe('fake salt', () => {
	const secret = Buffer.from('synthetic-test-secret');

	it('is 16 bytes and deterministic per username', () => {
		const a = fakeSalt('alice', secret);
		expect(a).toHaveLength(16);
		expect(fakeSalt('alice', secret).equals(a)).toBe(true);
		expect(fakeSalt(' ALICE ', secret).equals(a)).toBe(true);
	});

	it('differs per username and per secret, and from a random real salt', () => {
		expect(fakeSalt('alice', secret).equals(fakeSalt('bob', secret))).toBe(false);
		expect(fakeSalt('alice', secret).equals(fakeSalt('alice', Buffer.from('other')))).toBe(false);
		const real = Buffer.from(newToken(), 'base64url').subarray(0, 16);
		expect(fakeSalt('alice', secret).equals(real)).toBe(false);
	});

	it('uses the same default KDF parameters as the client', () => {
		expect(DEFAULT_KDF_PARAMS).toEqual(DEFAULT_KDF);
	});
});

describe('rate limiter', () => {
	function limiter(extra = {}) {
		const clock = { t: 1_000_000 };
		const l = new RateLimiter({ burst: 3, windowMs: 60_000, now: () => clock.t, ...extra });
		return { l, clock };
	}

	it('allows the burst, then blocks with a Retry-After', () => {
		const { l } = limiter();
		for (let i = 0; i < 3; i++) expect(l.take('k').ok).toBe(true);
		const blocked = l.take('k');
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) {
			expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
			expect(blocked.retryAfterSec).toBeLessThanOrEqual(20);
			expect(blocked.firstBlock).toBe(true);
		}
		const again = l.take('k');
		if (!again.ok) expect(again.firstBlock).toBe(false);
	});

	it('keeps keys independent and recovers as time passes', () => {
		const { l, clock } = limiter();
		for (let i = 0; i < 3; i++) l.take('a');
		expect(l.take('a').ok).toBe(false);
		expect(l.take('b').ok).toBe(true);
		clock.t += 21_000; // one token refills every 20 s
		expect(l.take('a').ok).toBe(true);
		expect(l.take('a').ok).toBe(false);
		clock.t += 120_000;
		for (let i = 0; i < 3; i++) expect(l.take('a').ok).toBe(true);
	});

	it('locks out exponentially after repeated failures and a success clears the streak', () => {
		const { l, clock } = limiter({ burst: 100, backoffAfter: 2, backoffBaseMs: 1000 });
		l.fail('u');
		expect(l.take('u').ok).toBe(true);
		l.fail('u'); // second failure: 1 s lock
		const r1 = l.take('u');
		expect(r1.ok).toBe(false);
		clock.t += 1100;
		expect(l.take('u').ok).toBe(true);
		l.fail('u'); // third: 2 s lock
		clock.t += 1100;
		expect(l.take('u').ok).toBe(false);
		clock.t += 1000;
		expect(l.take('u').ok).toBe(true);
		l.succeed('u');
		l.fail('u');
		expect(l.take('u').ok).toBe(true);
	});

	it('sweeps idle buckets', () => {
		const { l, clock } = limiter();
		l.take('x');
		expect(l.size()).toBe(1);
		clock.t += 120_000;
		l.sweep();
		expect(l.size()).toBe(0);
	});
});

describe('origin guard', () => {
	const own = 'https://example.test';
	const h = (o: Record<string, string>) => new Headers(o);
	const json = { 'content-type': 'application/json' };

	it('only guards /api/', () => {
		expect(isApiPath('/api/auth/login')).toBe(true);
		expect(isApiPath('/apiary')).toBe(false);
	});
	it('lets safe methods through', () => {
		expect(checkApiRequest('GET', h({}), own)).toBeNull();
	});
	it('requires the own Origin and a JSON content type on writes', () => {
		expect(checkApiRequest('POST', h({ ...json, origin: own }), own)).toBeNull();
		expect(
			checkApiRequest('POST', h({ 'content-type': 'application/json; charset=utf-8', origin: own }), own)
		).toBeNull();
		expect(checkApiRequest('POST', h(json), own)).toBe('bad_origin');
		expect(checkApiRequest('POST', h({ ...json, origin: 'https://evil.test' }), own)).toBe('bad_origin');
		expect(checkApiRequest('POST', h({ origin: own, 'content-type': 'text/plain' }), own)).toBe(
			'bad_content_type'
		);
		expect(checkApiRequest('POST', h({ origin: own }), own)).toBe('bad_content_type');
	});
	it('accepts raw bytes only under /api/attachments/, still with the own Origin', () => {
		const raw = { 'content-type': 'application/octet-stream', origin: own };
		expect(checkApiRequest('PUT', h(raw), own, '/api/attachments/abc')).toBeNull();
		expect(checkApiRequest('PUT', h(raw), own, '/api/records/abc')).toBe('bad_content_type');
		expect(checkApiRequest('PUT', h(raw), own)).toBe('bad_content_type');
		expect(
			checkApiRequest('PUT', h({ ...raw, origin: 'https://evil.test' }), own, '/api/attachments/abc')
		).toBe('bad_origin');
		expect(
			checkApiRequest('PUT', h({ origin: own, 'content-type': 'text/plain' }), own, '/api/attachments/abc')
		).toBe('bad_content_type');
	});
});

describe('input validation', () => {
	it('checks base64url byte lengths', () => {
		const ok = Buffer.alloc(32, 1).toString('base64url');
		expect(b64Bytes(ok, 32)).toHaveLength(32);
		expect(b64Bytes(ok, 16)).toBeNull();
		expect(b64Bytes(ok + '=', 32)).toBeNull();
		expect(b64Bytes('a+b/', 3)).toBeNull();
		expect(b64Bytes(5, 32)).toBeNull();
		expect(b64Bytes(Buffer.alloc(WRAPPED_LEN).toString('base64url'), WRAPPED_LEN)).toHaveLength(72);
	});

	it('normalises and validates usernames', () => {
		expect(parseUsername('  Alice.B-1_x ')).toBe('alice.b-1_x');
		expect(parseUsername('ab')).toBeNull();
		expect(parseUsername('a'.repeat(33))).toBeNull();
		expect(parseUsername('bad name')).toBeNull();
		expect(parseUsername('æøå123')).toBeNull();
		expect(parseUsername(null)).toBeNull();
	});

	it('accepts only uuid v4', () => {
		expect(parseUuidV4('3b241101-e2bb-4255-8caf-4136c566a962')).not.toBeNull();
		expect(parseUuidV4('3b241101-e2bb-1255-8caf-4136c566a962')).toBeNull();
		expect(parseUuidV4('nope')).toBeNull();
	});

	it('bounds KDF parameters', () => {
		const good = { alg: 'argon2id13', ops: 3, memBytes: 64 * 1024 * 1024 };
		expect(parseKdfParams(good)).toEqual(good);
		expect(parseKdfParams({ ...good, alg: 'pbkdf2' })).toBeNull();
		expect(parseKdfParams({ ...good, ops: 0 })).toBeNull();
		expect(parseKdfParams({ ...good, ops: 11 })).toBeNull();
		expect(parseKdfParams({ ...good, memBytes: 1024 })).toBeNull();
		expect(parseKdfParams({ ...good, memBytes: 2 * 1024 ** 3 })).toBeNull();
		expect(parseKdfParams({ ...good, ops: 1.5 })).toBeNull();
		expect(parseKdfParams('x')).toBeNull();
	});

	it('validates consent and tokens', () => {
		expect(parseConsent({ version: '1', textHash: 'abcDEF12-_', locale: 'da' })).not.toBeNull();
		expect(parseConsent({ version: '1', textHash: 'abc', locale: 'fr' })).toBeNull();
		expect(parseConsent({ version: '', textHash: 'abc', locale: 'en' })).toBeNull();
		expect(parseToken(newToken())).not.toBeNull();
		expect(parseToken('short')).toBeNull();
	});
});
