import { createECDH, createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { logLine } from '../db/log';

/**
 * VAPID (RFC 8292) with node:crypto only: an ES256 JWT in the `Authorization: vapid t=<jwt>, k=<key>` header.
 * Pushes carry no payload (D7), so no payload encryption (RFC 8291) is needed and no dependency either.
 */
export interface VapidConfig {
	/** The public key as sent in `k=`: base64url of the uncompressed point (65 bytes). */
	publicKey: string;
	privateKey: KeyObject;
	subject: string;
}

/** JWT lifetime. RFC 8292 allows at most 24 h; push services are happier with less. */
export const JWT_TTL_SECONDS = 12 * 60 * 60;

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Reads VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT. Returns null (reminders off) when one is missing or
 * invalid; logs which variable is wrong, never its value.
 */
export function vapidConfig(env: Record<string, string | undefined> = process.env): VapidConfig | null {
	const pub = (env.VAPID_PUBLIC_KEY ?? '').trim();
	const priv = (env.VAPID_PRIVATE_KEY ?? '').trim();
	const subject = (env.VAPID_SUBJECT ?? '').trim();
	if (!pub || !priv || !subject) return null;
	const bad = (name: string) => {
		logLine({ event: 'vapid_invalid', variable: name });
		return null;
	};
	if (!B64URL.test(pub)) return bad('VAPID_PUBLIC_KEY');
	if (!B64URL.test(priv)) return bad('VAPID_PRIVATE_KEY');
	if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s/]+\S*)$/.test(subject)) return bad('VAPID_SUBJECT');
	const point = Buffer.from(pub, 'base64url');
	const scalar = Buffer.from(priv, 'base64url');
	if (point.length !== 65 || point[0] !== 0x04) return bad('VAPID_PUBLIC_KEY');
	if (scalar.length !== 32) return bad('VAPID_PRIVATE_KEY');
	try {
		const ecdh = createECDH('prime256v1');
		ecdh.setPrivateKey(scalar);
		if (!ecdh.getPublicKey().equals(point)) return bad('VAPID_PRIVATE_KEY'); // the pair does not match
		const privateKey = createPrivateKey({
			key: {
				kty: 'EC',
				crv: 'P-256',
				x: point.subarray(1, 33).toString('base64url'),
				y: point.subarray(33).toString('base64url'),
				d: scalar.toString('base64url')
			},
			format: 'jwk'
		});
		return { publicKey: pub, privateKey, subject };
	} catch {
		return bad('VAPID_PRIVATE_KEY');
	}
}

const json = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** `aud` is the endpoint's origin; `nowSeconds` is injectable for tests. */
export function signVapidJwt(
	config: Pick<VapidConfig, 'privateKey' | 'subject'>,
	audience: string,
	nowSeconds = Math.floor(Date.now() / 1000)
): string {
	const input = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({
		aud: audience,
		exp: nowSeconds + JWT_TTL_SECONDS,
		sub: config.subject
	})}`;
	// ieee-p1363 gives the raw r||s (64 bytes) that JWS wants, not DER.
	const signature = sign('sha256', Buffer.from(input), {
		key: config.privateKey,
		dsaEncoding: 'ieee-p1363'
	});
	return `${input}.${signature.toString('base64url')}`;
}

export function vapidAuthorization(config: VapidConfig, audience: string, nowSeconds?: number): string {
	return `vapid t=${signVapidJwt(config, audience, nowSeconds)}, k=${config.publicKey}`;
}
