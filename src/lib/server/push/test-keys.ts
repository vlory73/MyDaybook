import { generateKeyPairSync } from 'node:crypto';

/** A fresh synthetic VAPID key pair in the env formats (tests only). */
export function syntheticVapidKeys(): { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string } {
	const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
	const point = Buffer.concat([
		Buffer.from([4]),
		Buffer.from(jwk.x!, 'base64url'),
		Buffer.from(jwk.y!, 'base64url')
	]);
	return { VAPID_PUBLIC_KEY: point.toString('base64url'), VAPID_PRIVATE_KEY: jwk.d! };
}
