import { createHmac, randomBytes } from 'node:crypto';
import { logLine } from '../db/log';

let generated: Buffer | undefined;

/**
 * Startup check: in production a missing or empty SESSION_SECRET is fatal, because a per-process random one would
 * silently lock two-step users out at every restart. Dev and test keep the generated one.
 */
export function assertSessionSecret(env: NodeJS.ProcessEnv = process.env): void {
	if (env.NODE_ENV === 'production' && !env.SESSION_SECRET?.trim()) {
		throw new Error('SESSION_SECRET is not set (generate one with gen-secrets)');
	}
}

/** SESSION_SECRET from the environment. In dev/test a random one is generated per process, with a one-line warning. */
export function sessionSecret(): Buffer {
	const fromEnv = process.env.SESSION_SECRET;
	if (fromEnv?.trim()) return Buffer.from(fromEnv, 'utf8');
	if (!generated) {
		generated = randomBytes(32);
		logLine({ event: 'session_secret_missing', note: 'generated a temporary one; set SESSION_SECRET' });
	}
	return generated;
}

/** Same parameters as DEFAULT_KDF in src/lib/crypto/keys.ts (a unit test keeps them equal). */
export const DEFAULT_KDF_PARAMS = { alg: 'argon2id13', ops: 3, memBytes: 64 * 1024 * 1024 } as const;

export function normalizeUsername(username: string): string {
	return username.trim().toLowerCase();
}

/** Deterministic 16-byte salt for usernames that do not exist, so prelogin cannot enumerate accounts. */
export function fakeSalt(username: string, secret: Buffer = sessionSecret()): Buffer {
	return createHmac('sha256', secret)
		.update('prelogin:' + normalizeUsername(username))
		.digest()
		.subarray(0, 16);
}
