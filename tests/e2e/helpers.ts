import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
	initCrypto,
	createAccount,
	encryptRecord,
	formatRecoveryKey,
	recordKek,
	toB64,
	type KdfParams
} from '../../src/lib/crypto';

// Synthetic data only. Accounts made by `signUpAndSignIn` use cheap KDF parameters (the client reads them from the
// server when it unlocks), so most UI tests stay fast. The real join journey in auth-ui.spec.ts uses the app's defaults.
export const ORIGIN = `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`;
export const DATA_DIR = 'test-results/e2e-data';
export const FAST_KDF: KdfParams = { alg: 'argon2id13', ops: 1, memBytes: 8 * 1024 * 1024 };
export const JSON_HEADERS = { origin: ORIGIN, 'content-type': 'application/json' };

export type TestUser = {
	userId: string;
	username: string;
	passphrase: string;
	/** Formatted like the screen: 8 groups of 4 joined by dashes. */
	recoveryKey: string;
};

/** An invite token, created the way an operator would (scripts/cli.mjs). */
export function createInvite(admin = false): string {
	const out = execFileSync('node', ['scripts/cli.mjs', 'invite', ...(admin ? ['--admin'] : [])], {
		env: { ...process.env, DATA_DIR, PUBLIC_URL: ORIGIN },
		encoding: 'utf8'
	});
	const m = /\/join#t=([A-Za-z0-9_-]{43})/.exec(out);
	if (!m) throw new Error('no invite token in CLI output');
	return m[1]!;
}

export const newUsername = (prefix = 'ui') => `${prefix}-${randomBytes(4).toString('hex')}`;
export const newPassphrase = () => `synthetic passphrase ${randomBytes(6).toString('hex')}`;

/** Creates an account through the API (like the app would, with cheap KDF parameters). The page gets the session cookie. */
export async function signUpViaApi(page: Page, prefix = 'ui'): Promise<TestUser> {
	await initCrypto();
	const userId = randomUUID();
	const username = newUsername(prefix);
	const passphrase = newPassphrase();
	const account = createAccount(userId, passphrase, FAST_KDF);
	const b = account.bundle;
	const res = await page.request.post('/api/auth/signup', {
		headers: JSON_HEADERS,
		data: {
			inviteToken: createInvite(),
			userId,
			username,
			kdfSalt: toB64(b.kdfSalt),
			kdfParams: b.kdfParams,
			authKey: toB64(b.authKey),
			recoveryAuthKey: toB64(b.recoveryAuthKey),
			wrappedMkByPassphrase: toB64(b.wrappedMkByPassphrase),
			wrappedMkByRecovery: toB64(b.wrappedMkByRecovery),
			publicKey: toB64(b.publicKey),
			wrappedPrivateKey: toB64(b.wrappedPrivateKey),
			consent: { version: 'consent-v2', textHash: 'synthetic-test-hash', locale: 'en' }
		}
	});
	expect(res.status()).toBe(200);
	return { userId, username, passphrase, recoveryKey: formatRecoveryKey(account.recoveryKey) };
}

/** Types the passphrase into the Unlock view and waits for it to go away. */
export async function unlockWith(page: Page, passphrase: string): Promise<void> {
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	await page.getByRole('button', { name: 'Unlock' }).click();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeHidden({ timeout: 30_000 });
}

/**
 * The app requires an account. This creates one (via the API, fast), opens `path` and unlocks the diary through the
 * real Unlock view, so the test starts signed in and unlocked on that page.
 */
export async function signUpAndSignIn(page: Page, path = '/'): Promise<TestUser> {
	const user = await signUpViaApi(page);
	await page.goto(path);
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	return user;
}

/** Signs in on the /login screen. */
export async function signInOnLoginPage(page: Page, username: string, passphrase: string): Promise<void> {
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

/** An account made through the API only, with the secrets a test needs to call the API as that user. */
export type ApiAccount = TestUser & {
	authKey: Uint8Array;
	recoveryAuthKey: Uint8Array;
	recoveryKeyBytes: Uint8Array;
	masterKey: Uint8Array;
};

/** Signs up (through `ctx`, which receives the session cookie). Pass `admin` to use an admin invite from the CLI. */
export async function signUpApiAccount(
	ctx: APIRequestContext,
	options: { prefix?: string; admin?: boolean; inviteToken?: string } = {}
): Promise<ApiAccount> {
	await initCrypto();
	const userId = randomUUID();
	const username = newUsername(options.prefix ?? 'api');
	const passphrase = newPassphrase();
	const account = createAccount(userId, passphrase, FAST_KDF);
	const b = account.bundle;
	const res = await ctx.post('/api/auth/signup', {
		headers: JSON_HEADERS,
		data: {
			inviteToken: options.inviteToken ?? createInvite(options.admin ?? false),
			userId,
			username,
			kdfSalt: toB64(b.kdfSalt),
			kdfParams: b.kdfParams,
			authKey: toB64(b.authKey),
			recoveryAuthKey: toB64(b.recoveryAuthKey),
			wrappedMkByPassphrase: toB64(b.wrappedMkByPassphrase),
			wrappedMkByRecovery: toB64(b.wrappedMkByRecovery),
			publicKey: toB64(b.publicKey),
			wrappedPrivateKey: toB64(b.wrappedPrivateKey),
			consent: { version: 'consent-v2', textHash: 'synthetic-test-hash', locale: 'en' }
		}
	});
	expect(res.status()).toBe(200);
	return {
		userId,
		username,
		passphrase,
		recoveryKey: formatRecoveryKey(account.recoveryKey),
		authKey: b.authKey,
		recoveryAuthKey: b.recoveryAuthKey,
		recoveryKeyBytes: account.recoveryKey,
		masterKey: account.keys.masterKey
	};
}

/** POST /api/auth/login for an API account; returns the raw response. */
export function loginApi(ctx: APIRequestContext, a: Pick<ApiAccount, 'username' | 'authKey'>, totp?: string) {
	return ctx.post('/api/auth/login', {
		headers: JSON_HEADERS,
		data: { username: a.username, authKey: toB64(a.authKey), ...(totp === undefined ? {} : { totp }) }
	});
}

/** A POST with the origin and content type the API requires. */
export function postJson(ctx: APIRequestContext, path: string, data: unknown = {}) {
	return ctx.post(path, { headers: JSON_HEADERS, data: data as object });
}

/**
 * Writes synthetic records for an API account straight to the server, encrypted the way the app does it (so the
 * app opens them after unlock). Returns the record ids, in the same order as `payloads`.
 */
export async function seedRecords(
	ctx: APIRequestContext,
	account: Pick<ApiAccount, 'userId' | 'masterKey'>,
	payloads: object[]
): Promise<string[]> {
	const kek = recordKek(account.masterKey);
	const ids: string[] = [];
	for (const payload of payloads) {
		const id = randomUUID();
		const enc = encryptRecord(kek, account.userId, id, payload as never);
		const res = await ctx.put(`/api/records/${id}`, {
			headers: JSON_HEADERS,
			data: { wrappedKey: toB64(enc.wrappedKey), ciphertext: toB64(enc.ciphertext) }
		});
		expect(res.status()).toBe(200);
		ids.push(id);
	}
	return ids;
}

/** The first-run step of sign-up ("What do you want to track?"): keeps everything ticked and continues. */
export async function passTrackerStep(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { name: 'What do you want to track?' })).toBeVisible();
	await page.getByTestId('tracker-continue').click();
}
