import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { formatEnvLines, generateSecrets } from './gen-secrets.mjs';

type Secrets = Record<'SESSION_SECRET' | 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY', string>;

const B64URL = /^[A-Za-z0-9_-]+$/;

describe('gen-secrets', () => {
	const s = generateSecrets() as Secrets;

	it('makes a session secret of at least 32 random bytes', () => {
		expect(s.SESSION_SECRET).toMatch(B64URL);
		expect(Buffer.from(s.SESSION_SECRET, 'base64url').length).toBeGreaterThanOrEqual(32);
		expect((generateSecrets() as Secrets).SESSION_SECRET).not.toBe(s.SESSION_SECRET);
	});

	it('uses the standard VAPID formats', () => {
		expect(s.VAPID_PUBLIC_KEY).toMatch(B64URL);
		expect(s.VAPID_PRIVATE_KEY).toMatch(B64URL);
		const pub = Buffer.from(s.VAPID_PUBLIC_KEY, 'base64url');
		const priv = Buffer.from(s.VAPID_PRIVATE_KEY, 'base64url');
		expect(pub.length).toBe(65);
		expect(pub[0]).toBe(0x04);
		expect(priv.length).toBe(32);
		expect(s.VAPID_PUBLIC_KEY).toHaveLength(87);
		expect(s.VAPID_PRIVATE_KEY).toHaveLength(43);
	});

	it('has a private key that matches the public key', () => {
		const ecdh = createECDH('prime256v1');
		ecdh.setPrivateKey(Buffer.from(s.VAPID_PRIVATE_KEY, 'base64url'));
		expect(ecdh.getPublicKey().equals(Buffer.from(s.VAPID_PUBLIC_KEY, 'base64url'))).toBe(true);
	});

	it('prints one NAME=value line per secret', () => {
		const lines = (formatEnvLines(s) as string).trimEnd().split('\n');
		expect(lines.map((l) => l.split('=')[0])).toEqual([
			'SESSION_SECRET',
			'VAPID_PUBLIC_KEY',
			'VAPID_PRIVATE_KEY'
		]);
	});
});
