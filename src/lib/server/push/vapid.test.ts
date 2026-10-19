import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { syntheticVapidKeys } from './test-keys';
import { JWT_TTL_SECONDS, signVapidJwt, vapidAuthorization, vapidConfig } from './vapid';

const keys = syntheticVapidKeys();
const env = {
	VAPID_PUBLIC_KEY: keys.VAPID_PUBLIC_KEY,
	VAPID_PRIVATE_KEY: keys.VAPID_PRIVATE_KEY,
	VAPID_SUBJECT: 'mailto:owner@example.invalid'
};
const decode = (part: string) =>
	JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

describe('vapidConfig', () => {
	it('accepts a matching key pair and a mailto: or https: subject', () => {
		expect(vapidConfig(env)?.publicKey).toBe(keys.VAPID_PUBLIC_KEY);
		expect(vapidConfig({ ...env, VAPID_SUBJECT: 'https://example.invalid/contact' })).not.toBeNull();
	});

	it('is off when anything is missing', () => {
		for (const name of Object.keys(env)) expect(vapidConfig({ ...env, [name]: undefined })).toBeNull();
		expect(vapidConfig({})).toBeNull();
	});

	it('is off for a bad subject, a short key or a private key that does not match the public key', () => {
		const other = syntheticVapidKeys();
		expect(vapidConfig({ ...env, VAPID_SUBJECT: 'owner@example.invalid' })).toBeNull();
		expect(vapidConfig({ ...env, VAPID_SUBJECT: 'http://example.invalid' })).toBeNull();
		expect(vapidConfig({ ...env, VAPID_PUBLIC_KEY: 'AAAA' })).toBeNull();
		expect(vapidConfig({ ...env, VAPID_PRIVATE_KEY: 'AAAA' })).toBeNull();
		expect(vapidConfig({ ...env, VAPID_PRIVATE_KEY: other.VAPID_PRIVATE_KEY })).toBeNull();
	});
});

describe('VAPID JWT', () => {
	const config = vapidConfig(env)!;
	const now = 1_792_000_000;
	const jwt = signVapidJwt(config, 'https://fcm.googleapis.com', now);
	const [h, c, s] = jwt.split('.') as [string, string, string];

	it('has the ES256 header and the claims of RFC 8292', () => {
		expect(decode(h)).toEqual({ typ: 'JWT', alg: 'ES256' });
		expect(decode(c)).toEqual({
			aud: 'https://fcm.googleapis.com',
			exp: now + JWT_TTL_SECONDS,
			sub: 'mailto:owner@example.invalid'
		});
		expect(JWT_TTL_SECONDS).toBeLessThanOrEqual(12 * 3600);
	});

	it('verifies with the public key, as a 64-byte raw signature', () => {
		const point = Buffer.from(keys.VAPID_PUBLIC_KEY, 'base64url');
		const publicKey = createPublicKey({
			key: {
				kty: 'EC',
				crv: 'P-256',
				x: point.subarray(1, 33).toString('base64url'),
				y: point.subarray(33).toString('base64url')
			},
			format: 'jwk'
		});
		const sig = Buffer.from(s, 'base64url');
		expect(sig.length).toBe(64);
		expect(
			verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig)
		).toBe(true);
		const stranger = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey;
		expect(
			verify('sha256', Buffer.from(`${h}.${c}`), { key: stranger, dsaEncoding: 'ieee-p1363' }, sig)
		).toBe(false);
	});

	it('builds the Authorization header with the key', () => {
		const header = vapidAuthorization(config, 'https://fcm.googleapis.com', now);
		const m = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(header);
		expect(m?.[2]).toBe(keys.VAPID_PUBLIC_KEY);
		expect(decode(m![1]!.split('.')[1]!)['aud']).toBe('https://fcm.googleapis.com');
		expect(header.startsWith('vapid t=')).toBe(true);
		expect(header.endsWith(`, k=${keys.VAPID_PUBLIC_KEY}`)).toBe(true);
	});
});
