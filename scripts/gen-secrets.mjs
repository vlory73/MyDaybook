#!/usr/bin/env node
// Prints the three generated secrets as .env lines on stdout, using node:crypto only:
//
//   docker run --rm ghcr.io/vlory73/mydaybook:0.1.0 gen-secrets >> .env
//
// SESSION_SECRET: 32 random bytes, base64url.
// VAPID_*: a P-256 key pair in the standard Web Push (RFC 8292) formats: the public key is the uncompressed point
// (0x04 || X || Y, 65 bytes) and the private key is the raw 32-byte scalar, both base64url without padding.
// Nothing is written anywhere but stdout, so the values never appear on screen when the output is redirected.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function generateSecrets() {
	const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	const jwk = privateKey.export({ format: 'jwk' });
	const x = Buffer.from(jwk.x, 'base64url');
	const y = Buffer.from(jwk.y, 'base64url');
	const publicPoint = Buffer.concat([Buffer.from([0x04]), x, y]);
	return {
		SESSION_SECRET: randomBytes(32).toString('base64url'),
		VAPID_PUBLIC_KEY: publicPoint.toString('base64url'),
		VAPID_PRIVATE_KEY: Buffer.from(jwk.d, 'base64url').toString('base64url')
	};
}

export function formatEnvLines(secrets) {
	return Object.entries(secrets)
		.map(([name, value]) => `${name}=${value}\n`)
		.join('');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.stdout.write(formatEnvLines(generateSecrets()));
}
