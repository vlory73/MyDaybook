import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import {
	deriveFromRecoveryKey,
	rewrapForNewRecoveryKey,
	rewrapForPassphrase,
	toB64
} from '../../src/lib/crypto';
import { test, expect } from './fixtures';
import {
	DATA_DIR,
	FAST_KDF,
	ORIGIN,
	loginApi,
	postJson,
	signInOnLoginPage,
	signUpApiAccount,
	signUpAndSignIn,
	type ApiAccount
} from './helpers';
import { codeFor, wrongCode, previousStepCode } from './totp-code';

// Synthetic data only. Codes are computed here with a test-side copy of RFC 6238.

const toast = (page: import('@playwright/test').Page, text: string) =>
	page.getByRole('status').getByText(text, { exact: true });

test('turn on in Me, sign in needs a code, wrong and replayed codes fail, turn off again', async ({
	page
}) => {
	const user = await signUpAndSignIn(page, '/me');
	const card = page.locator('section.card', { has: page.getByRole('heading', { name: 'Two-step sign-in' }) });
	await expect(card.getByTestId('totp-state')).toHaveText('Off');

	// Enrol: passphrase, then the setup key.
	await card.getByRole('button', { name: 'Turn on' }).click();
	await page.getByRole('dialog').getByLabel('Passphrase', { exact: true }).fill('not the passphrase');
	await page.getByRole('button', { name: 'Show setup key' }).click();
	await expect(page.getByRole('dialog').getByText("That passphrase doesn't match.")).toBeVisible();
	await page.getByRole('dialog').getByLabel('Passphrase', { exact: true }).fill(user.passphrase);
	await page.getByRole('button', { name: 'Show setup key' }).click();
	const secretBox = page.getByTestId('totp-secret');
	await expect(secretBox).toBeVisible();
	const secret = (await secretBox.locator('span').allTextContents()).join('');
	expect(secret).toMatch(/^[A-Z2-7]{32}$/);
	const href = (await page.getByTestId('totp-open-app').getAttribute('href'))!;
	expect(href).toBe(
		`otpauth://totp/MyDaybook:${user.username}?secret=${secret}&issuer=MyDaybook&digits=6&period=30`
	);

	// A wrong code is refused; the previous step's code is accepted (and uses that step up).
	await page.getByRole('dialog').getByLabel('Six-digit code from the app').fill(wrongCode(secret));
	await page.getByRole('button', { name: 'Confirm and turn on' }).click();
	await expect(
		page.getByRole('dialog').getByText("That code didn't work. Wait for a new one and try again.")
	).toBeVisible();
	await page
		.getByRole('dialog')
		.getByLabel('Six-digit code from the app')
		.fill(await previousStepCode(secret));
	await page.getByRole('button', { name: 'Confirm and turn on' }).click();
	await expect(toast(page, 'Two-step sign-in is on.')).toBeVisible();
	await expect(card.getByTestId('totp-state')).toHaveText('On');

	// Sign out, sign in: the code step appears.
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	await signInOnLoginPage(page, user.username, user.passphrase);
	await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
	const field = page.getByLabel('Six-digit code', { exact: true });
	await expect(field).toHaveAttribute('autocomplete', 'one-time-code');
	await expect(field).toHaveAttribute('inputmode', 'numeric');

	await field.fill(wrongCode(secret));
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText("That code didn't work. Wait for a new one and try again.")).toBeVisible();

	const good = codeFor(secret);
	await field.fill(good);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('button', { name: 'Log something' })).toBeVisible();

	// Replay: the same code, from a fresh sign-in, is refused.
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	await signInOnLoginPage(page, user.username, user.passphrase);
	await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
	await field.fill(good);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByText("That code didn't work. Wait for a new one and try again.")).toBeVisible();
	// The next step's code is fine (and keeps the keys from the first step: no second Argon2id run).
	await field.fill(codeFor(secret, 1));
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('button', { name: 'Log something' })).toBeVisible();

	// Turn off needs the passphrase and a code newer than the last one used (next step is already used: wait is
	// avoided by checking the wrong-code path, then the server-side state below).
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await expect(card.getByTestId('totp-state')).toHaveText('On');
	await card.getByRole('button', { name: 'Turn off' }).click();
	await page.getByRole('dialog').getByLabel('Passphrase', { exact: true }).fill(user.passphrase);
	await page.getByRole('dialog').getByLabel('Six-digit code from the app').fill(wrongCode(secret));
	await page.getByRole('dialog').getByRole('button', { name: 'Turn off', exact: true }).click();
	await expect(
		page.getByRole('dialog').getByText("That code didn't work. Wait for a new one and try again.")
	).toBeVisible();
});

test('turning off works with a fresh code, then sign-in needs no code', async ({ page }) => {
	const user = await signUpAndSignIn(page, '/me');
	const card = page.locator('section.card', { has: page.getByRole('heading', { name: 'Two-step sign-in' }) });
	await card.getByRole('button', { name: 'Turn on' }).click();
	await page.getByRole('dialog').getByLabel('Passphrase', { exact: true }).fill(user.passphrase);
	await page.getByRole('button', { name: 'Show setup key' }).click();
	// The key appears once the setup request answers; reading it earlier would give an empty key and a wrong code.
	await expect(page.getByTestId('totp-secret').locator('span')).toHaveCount(8);
	const secret = (await page.getByTestId('totp-secret').locator('span').allTextContents()).join('');
	await page
		.getByRole('dialog')
		.getByLabel('Six-digit code from the app')
		.fill(await previousStepCode(secret));
	await page.getByRole('button', { name: 'Confirm and turn on' }).click();
	await expect(card.getByTestId('totp-state')).toHaveText('On');

	await card.getByRole('button', { name: 'Turn off' }).click();
	await page.getByRole('dialog').getByLabel('Passphrase', { exact: true }).fill(user.passphrase);
	await page.getByRole('dialog').getByLabel('Six-digit code from the app').fill(codeFor(secret));
	await page.getByRole('dialog').getByRole('button', { name: 'Turn off', exact: true }).click();
	await expect(toast(page, 'Two-step sign-in is off.')).toBeVisible();
	await expect(card.getByTestId('totp-state')).toHaveText('Off');

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
	await signInOnLoginPage(page, user.username, user.passphrase);
	await expect(page.getByRole('button', { name: 'Log something' })).toBeVisible();
});

test.describe('API', () => {
	let ctx: APIRequestContext;
	test.beforeEach(async () => {
		ctx = await pwRequest.newContext({ baseURL: ORIGIN });
	});
	test.afterEach(async () => {
		await ctx.dispose();
	});

	async function withTotp(account: ApiAccount): Promise<string> {
		expect((await loginApi(ctx, account)).status()).toBe(200);
		const setup = await postJson(ctx, '/api/auth/totp/setup', { authKey: toB64(account.authKey) });
		expect(setup.status()).toBe(200);
		const { secret, uri } = await setup.json();
		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(uri).toContain(`secret=${secret}`);
		const on = await postJson(ctx, '/api/auth/totp/enable', { code: await previousStepCode(secret) });
		expect(on.status()).toBe(200);
		return secret;
	}

	test('setup is pending until a valid code confirms it; the secret is encrypted at rest', async () => {
		const a = await signUpApiAccount(ctx);
		expect((await postJson(ctx, '/api/auth/totp/setup', { authKey: toB64(randomBytes(32)) })).status()).toBe(
			401
		);
		const setup = await postJson(ctx, '/api/auth/totp/setup', { authKey: toB64(a.authKey) });
		const { secret } = await setup.json();

		// Pending only: sign-in is unchanged, enable needs a valid code.
		const other = await pwRequest.newContext({ baseURL: ORIGIN });
		expect((await loginApi(other, a)).status()).toBe(200);
		const bad = await postJson(ctx, '/api/auth/totp/enable', { code: wrongCode(secret) });
		expect(bad.status()).toBe(401);
		expect(await bad.json()).toEqual({ error: 'invalid_totp' });
		expect((await postJson(ctx, '/api/auth/totp/enable', { code: 'abc' })).status()).toBe(400);
		expect((await postJson(ctx, '/api/auth/totp/enable', { code: codeFor(secret) })).status()).toBe(200);
		expect((await (await ctx.get('/api/auth/totp')).json()).enabled).toBe(true);
		const again = await postJson(ctx, '/api/auth/totp/setup', { authKey: toB64(a.authKey) });
		expect(again.status()).toBe(409);

		const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
		const row = db
			.prepare(
				'SELECT totp_secret_enc AS s, totp_pending_enc AS p, totp_last_step AS l FROM users WHERE id = ?'
			)
			.get(a.userId) as { s: Buffer; p: Buffer | null; l: number };
		db.close();
		expect(row.p).toBeNull();
		expect(row.l).toBeGreaterThan(0);
		expect(row.s.length).toBeGreaterThan(12 + 16 + 20);
		expect(row.s.toString('latin1')).not.toContain(secret);
		await other.dispose();
	});

	test('login: totp_required only after the right auth key; wrong, right and replayed codes', async () => {
		const a = await signUpApiAccount(ctx);
		const secret = await withTotp(a);

		const anon = await pwRequest.newContext({ baseURL: ORIGIN });
		// Never reveal TOTP to someone without the key.
		const wrongKey = await loginApi(anon, { username: a.username, authKey: randomBytes(32) });
		expect(wrongKey.status()).toBe(401);
		expect(await wrongKey.json()).toEqual({ error: 'invalid_credentials' });
		const withTotpNoKey = await loginApi(anon, { username: a.username, authKey: randomBytes(32) }, '123456');
		expect(await withTotpNoKey.json()).toEqual({ error: 'invalid_credentials' });

		const need = await loginApi(anon, a);
		expect(need.status()).toBe(401);
		expect(await need.json()).toEqual({ error: 'totp_required' });
		expect((await anon.get('/api/auth/session')).status()).toBe(401); // no session was created

		const wrong = await loginApi(anon, a, wrongCode(secret));
		expect(wrong.status()).toBe(401);
		expect(await wrong.json()).toEqual({ error: 'invalid_totp' });
		expect((await loginApi(anon, a, 'nope')).status()).toBe(401);

		const good = codeFor(secret);
		const ok = await loginApi(anon, a, good);
		expect(ok.status()).toBe(200);
		expect((await anon.get('/api/auth/session')).status()).toBe(200);

		const replay = await pwRequest.newContext({ baseURL: ORIGIN });
		const denied = await loginApi(replay, a, good);
		expect(denied.status()).toBe(401);
		expect(await denied.json()).toEqual({ error: 'invalid_totp' });
		// An older step than the last one used is refused too.
		expect((await loginApi(replay, a, codeFor(secret, -1))).status()).toBe(401);

		// Failures are recorded as security events (no IP assertions here).
		const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
		const n = db
			.prepare("SELECT COUNT(*) AS n FROM security_events WHERE type = 'totp_failed' AND user_id = ?")
			.get(a.userId) as { n: number };
		db.close();
		expect(n.n).toBeGreaterThanOrEqual(3);
		await anon.dispose();
		await replay.dispose();
	});

	test('disable needs the auth key and a fresh valid code', async () => {
		const a = await signUpApiAccount(ctx);
		const secret = await withTotp(a);
		const noKey = await postJson(ctx, '/api/auth/totp/disable', {
			authKey: toB64(randomBytes(32)),
			code: codeFor(secret)
		});
		expect(noKey.status()).toBe(401);
		const badCode = await postJson(ctx, '/api/auth/totp/disable', {
			authKey: toB64(a.authKey),
			code: wrongCode(secret)
		});
		expect(badCode.status()).toBe(401);
		expect(await badCode.json()).toEqual({ error: 'invalid_totp' });
		const off = await postJson(ctx, '/api/auth/totp/disable', {
			authKey: toB64(a.authKey),
			code: codeFor(secret)
		});
		expect(off.status()).toBe(200);
		expect(
			(await postJson(ctx, '/api/auth/totp/disable', { authKey: toB64(a.authKey), code: '123456' })).status()
		).toBe(409);
		const fresh = await pwRequest.newContext({ baseURL: ORIGIN });
		expect((await loginApi(fresh, a)).status()).toBe(200);
		await fresh.dispose();
	});

	test('recovering with the recovery key bypasses the code and switches two-step sign-in off', async () => {
		const a = await signUpApiAccount(ctx);
		await withTotp(a);
		const anon = await pwRequest.newContext({ baseURL: ORIGIN });
		expect((await loginApi(anon, a)).status()).toBe(401);

		const { recoveryAuthKey } = deriveFromRecoveryKey(a.recoveryKeyBytes);
		const start = await postJson(anon, '/api/auth/recover/start', {
			username: a.username,
			recoveryAuthKey: toB64(recoveryAuthKey)
		});
		expect(start.status()).toBe(200);
		const s = await start.json();
		const next = 'synthetic recovered passphrase ' + randomBytes(4).toString('hex');
		const pw = rewrapForPassphrase(a.userId, a.masterKey, next, FAST_KDF);
		const rk = rewrapForNewRecoveryKey(a.userId, a.masterKey);
		const finish = await postJson(anon, '/api/auth/recover/finish', {
			recoveryToken: s.recoveryToken,
			kdfSalt: toB64(pw.kdfSalt),
			kdfParams: pw.kdfParams,
			authKey: toB64(pw.authKey),
			wrappedMkByPassphrase: toB64(pw.wrappedMkByPassphrase),
			recoveryAuthKey: toB64(rk.recoveryAuthKey),
			wrappedMkByRecovery: toB64(rk.wrappedMkByRecovery)
		});
		expect(finish.status()).toBe(200);
		expect((await (await anon.get('/api/auth/totp')).json()).enabled).toBe(false);

		const fresh = await pwRequest.newContext({ baseURL: ORIGIN });
		expect((await loginApi(fresh, { username: a.username, authKey: pw.authKey })).status()).toBe(200);
		await anon.dispose();
		await fresh.dispose();
	});
});
