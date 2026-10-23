import type { Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { test, expect } from './fixtures';
import {
	DATA_DIR,
	FAST_KDF,
	ORIGIN,
	JSON_HEADERS,
	createInvite,
	newPassphrase,
	newUsername,
	signInOnLoginPage,
	signUpAndSignIn,
	signUpViaApi,
	unlockWith
} from './helpers';
import { deriveFromPassphrase, initCrypto, toB64 } from '../../src/lib/crypto';

// Synthetic data only. The "join" journey runs the app's real KDF parameters (64 MiB, 3 passes) in the browser;
// the other tests create their accounts through the API with cheap parameters so they stay quick.

const GREETING = /Good (morning|afternoon|evening)/;
const todayHeading = (page: Page) => page.getByRole('heading', { level: 1 });

async function readRecoveryKey(page: Page): Promise<string[]> {
	const groups = await page.getByTestId('recovery-key').locator('span').allTextContents();
	expect(groups).toHaveLength(8);
	for (const g of groups) expect(g).toMatch(/^[0-9A-Z]{4}$/);
	return groups;
}

/** Answers the "type group X and group Y" check from the groups read off the screen. */
async function confirmRecoveryKey(page: Page, groups: string[]): Promise<void> {
	await expect(page.getByRole('heading', { name: "Let's check it" })).toBeVisible();
	const lead = (await page.getByText(/Type group \d+ and group \d+/).textContent()) ?? '';
	const [a, b] = [...lead.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
	expect(a).not.toBe(b);
	await page.getByLabel(`Group ${a} (4 characters)`).fill(groups[a! - 1]!.toLowerCase()); // case-insensitive
	await page.getByLabel(`Group ${b} (4 characters)`).fill(groups[b! - 1]!);
	await page.getByRole('button', { name: 'Confirm' }).click();
}

async function fillNewPassphrase(page: Page, passphrase: string, repeat = passphrase): Promise<void> {
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	await page.getByLabel('Repeat passphrase').fill(repeat);
}

/** Walks /join from the welcome step to the consent step. Returns the recovery key groups. */
async function walkJoinToConsent(
	page: Page,
	token: string,
	username: string,
	passphrase: string
): Promise<string[]> {
	await page.goto(`/join#t=${token}`);
	await page.getByRole('button', { name: 'Get started' }).click();
	await page.getByLabel('Username').fill(username);
	await fillNewPassphrase(page, passphrase);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible({ timeout: 30_000 });
	const groups = await readRecoveryKey(page);
	await page.getByRole('button', { name: "I've stored it. Check me" }).click();
	await confirmRecoveryKey(page, groups);
	await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
	return groups;
}

function dbRows<T>(sql: string, ...params: string[]): T[] {
	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
	try {
		db.pragma('busy_timeout = 5000');
		return db.prepare(sql).all(...params) as T[];
	} finally {
		db.close();
	}
}

test.describe('joining', () => {
	test('full journey: invite, keys, recovery key, check, consent, then Today', async ({ page, problems }) => {
		test.setTimeout(120_000);
		const token = createInvite();
		const username = newUsername('journey');
		const passphrase = newPassphrase();

		await page.goto(`/join#t=${token}`);
		// The token is read once and removed from the address bar.
		await expect(page).toHaveURL(/\/join$/);
		await expect(page.getByRole('heading', { name: /Welcome to / })).toBeVisible();
		await expect(page.getByText(/Not even the person running this server can/)).toBeVisible();
		await expect(page.getByText(/not a medical device/)).toBeVisible();
		// No tab bar or quick-log on public routes.
		await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Get started' }).click();

		// Username and passphrase rules, with a local strength hint.
		await page.getByLabel('Username').fill('No Spaces!');
		await fillNewPassphrase(page, 'short');
		await expect(page.getByText('Strength: weak')).toBeVisible();
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('alert')).toContainText('3 to 32 characters');
		await page.getByLabel('Username').fill(username);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('alert')).toContainText('too easy to guess');
		await fillNewPassphrase(page, passphrase, passphrase + 'x');
		await expect(page.getByText('Strength: strong')).toBeVisible();
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('alert')).toContainText("don't match");
		await fillNewPassphrase(page, passphrase);
		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeFocused();
		await expect(page.getByText(/gone for good/)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
		const groups = await readRecoveryKey(page);

		// A wrong answer is refused, then the right one passes.
		await page.getByRole('button', { name: "I've stored it. Check me" }).click();
		await expect(page.getByRole('heading', { name: "Let's check it" })).toBeFocused();
		const lead = (await page.getByText(/Type group \d+ and group \d+/).textContent()) ?? '';
		const [a, b] = [...lead.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
		await page.getByLabel(`Group ${a} (4 characters)`).fill('ZZZZ');
		await page.getByLabel(`Group ${b} (4 characters)`).fill('ZZZZ');
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect(page.getByRole('alert')).toContainText("don't match the key");
		await page.getByLabel(`Group ${a} (4 characters)`).fill(groups[a! - 1]!.toLowerCase());
		await page.getByLabel(`Group ${b} (4 characters)`).fill(groups[b! - 1]!);
		await page.getByRole('button', { name: 'Confirm' }).click();

		// Consent: explicit, not pre-ticked.
		await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
		const agree = page.getByRole('checkbox', { name: /I understand, and I agree/ });
		await expect(agree).not.toBeChecked();
		await page.getByRole('button', { name: 'Create my diary' }).click();
		await expect(page.getByRole('alert')).toContainText('tick the box');
		await agree.check();
		await page.getByRole('button', { name: 'Create my diary' }).click();

		await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
		await expect(todayHeading(page)).toHaveText(GREETING);
		await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

		// The server stored the consent record: version, a SHA-256 hex hash, locale (and its own timestamp).
		const rows = dbRows<{ version: string; text_hash: string; locale: string; actor: string }>(
			'SELECT c.version, c.text_hash, c.locale, c.actor FROM consents c JOIN users u ON u.id = c.user_id WHERE u.username = ?',
			username
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ version: 'consent-v1', locale: 'en', actor: 'self' });
		expect(rows[0]!.text_hash).toMatch(/^[0-9a-f]{64}$/);

		// After a reload the diary is locked until the passphrase is typed again.
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
		await page.getByLabel('Passphrase', { exact: true }).fill('not my passphrase at all');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.getByRole('alert')).toContainText("doesn't match");
		await unlockWith(page, passphrase);
		await expect(todayHeading(page)).toHaveText(GREETING);
		expect(problems).toEqual([]);
	});

	test('a taken username sends you back one step and keeps your keys', async ({ page, problems }) => {
		test.setTimeout(120_000);
		const existing = await signUpViaApi(page, 'taken');
		await page.context().clearCookies();
		const passphrase = newPassphrase();
		const groups = await walkJoinToConsent(page, createInvite(), existing.username, passphrase);
		await page.getByRole('checkbox', { name: /I understand, and I agree/ }).check();
		await page.getByRole('button', { name: 'Create my diary' }).click();
		await expect(page.getByRole('alert')).toContainText('already taken');
		// Same passphrase, new name: the recovery key already saved stays valid, so we go straight to consent.
		const fresh = newUsername('freed');
		await page.getByLabel('Username').fill(fresh);
		await fillNewPassphrase(page, passphrase);
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('checkbox', { name: /I understand, and I agree/ }).check();
		await page.getByRole('button', { name: 'Create my diary' }).click();
		await expect(todayHeading(page)).toHaveText(GREETING, { timeout: 30_000 });
		expect(groups).toHaveLength(8);
		expect(problems).toEqual([]);
	});

	test('invalid or missing invite links get a friendly page', async ({ page, problems }) => {
		await page.goto('/join');
		await expect(page.getByRole('heading', { name: "This invite link doesn't work" })).toBeVisible();
		await page.goto('/login'); // a fragment-only change would not reload the page
		// Wait for the page to finish starting up: navigating away mid-request makes WebKit log an error.
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
		await page.goto(`/join#t=${randomBytes(32).toString('base64url')}`);
		await expect(page.getByRole('heading', { name: "This invite link doesn't work" })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible();
		expect(problems).toEqual([]);
	});
});

test.describe('gating, lock and sign-in', () => {
	test('signed-out visitors only see public routes', async ({ page, problems }) => {
		await page.goto('/me');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Log something' })).toHaveCount(0);
		await page.goto('/join');
		await expect(page).toHaveURL(/\/join$/);
		// Without a token /join shows the invalid-invite page; wait for it before navigating on, because
		// cancelling its in-flight session request makes WebKit log an "access control checks" error.
		await expect(page.getByRole('heading', { name: "This invite link doesn't work" })).toBeVisible();
		await page.goto('/recover');
		await expect(page.getByRole('heading', { name: 'Get back into your diary' })).toBeVisible();
		await page.goto('/styleguide'); // developer page, enabled by STYLEGUIDE=1 on the test server
		await expect(page).toHaveURL(/\/styleguide$/);
		expect(problems).toEqual([]);
	});

	test('Lock now shows the Unlock view and hides the app; unlocking returns to the same page', async ({
		page,
		problems
	}) => {
		const user = await signUpAndSignIn(page, '/me');
		await expect(page.getByText(`Signed in as ${user.username}`)).toBeVisible();
		await page.getByRole('button', { name: 'Lock now' }).click();
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Me', exact: true })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Forgot your passphrase?' })).toHaveCount(0); // it is a button here
		await expect(page.getByRole('button', { name: 'Forgot your passphrase?' })).toBeVisible();
		await unlockWith(page, user.passphrase);
		await expect(page.getByRole('heading', { name: 'Me', exact: true })).toBeVisible();
		expect(problems).toEqual([]);
	});

	test('sign out leads to /login; signing in again opens Today', async ({ page, problems }) => {
		const user = await signUpAndSignIn(page, '/me');
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByText('You are signed out.')).toBeVisible();
		// Wrong passphrase: one generic message.
		await signInOnLoginPage(page, user.username, 'definitely not it');
		await expect(page.getByRole('alert')).toContainText("That username and passphrase don't match");
		await page.getByLabel('Username').fill(`nobody-${randomBytes(3).toString('hex')}`);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('alert')).toContainText("That username and passphrase don't match");
		await signInOnLoginPage(page, user.username, user.passphrase);
		await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
		await expect(todayHeading(page)).toHaveText(GREETING);
		// Opening /login while signed in goes back to the app.
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await expect(page.getByText(`Signed in as ${user.username}`)).toBeVisible();
		expect(problems).toEqual([]);
	});

	test('sign in from the Unlock view: "Not you? Sign out"', async ({ page, problems }) => {
		await signUpAndSignIn(page);
		await page.reload();
		await page.getByRole('button', { name: 'Not you? Sign out' }).click();
		await expect(page).toHaveURL(/\/login$/);
		expect(problems).toEqual([]);
	});
});

test.describe('auto-lock', () => {
	test('locks after 5 minutes without interaction (default)', async ({ page, problems }) => {
		await page.clock.install();
		await signUpAndSignIn(page);
		await expect(todayHeading(page)).toHaveText(GREETING);
		await page.clock.fastForward('04:00');
		await expect(todayHeading(page)).toHaveText(GREETING);
		await page.clock.fastForward('02:00');
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
		expect(problems).toEqual([]);
	});

	test('activity postpones the lock', async ({ page, problems }) => {
		await page.clock.install();
		await signUpAndSignIn(page);
		await page.clock.fastForward('04:00');
		// Interaction restarts the countdown. Click the inert heading: a click on whatever sits at a fixed spot
		// could open something whose animation scrolls later and postpones the lock again.
		await todayHeading(page).click();
		await page.clock.fastForward('04:00');
		await expect(todayHeading(page)).toHaveText(GREETING);
		await page.clock.fastForward('02:00');
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		expect(problems).toEqual([]);
	});

	test('locks after 60 seconds with the page hidden', async ({ page, problems }) => {
		await page.clock.install();
		await signUpAndSignIn(page);
		await page.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await page.clock.fastForward('00:30');
		await expect(todayHeading(page)).toHaveText(GREETING);
		await page.clock.fastForward('00:40');
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		expect(problems).toEqual([]);
	});

	test('the timeout can be changed in Me and is remembered', async ({ page, problems }) => {
		await page.clock.install();
		const user = await signUpAndSignIn(page, '/me');
		await page.getByLabel('Lock after').selectOption({ label: '1 min' });
		await page.clock.fastForward('01:30');
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		await page.reload();
		await unlockWith(page, user.passphrase);
		await expect(page.getByLabel('Lock after')).toHaveValue('1');
		expect(problems).toEqual([]);
	});
});

test.describe('recovery and account changes', () => {
	test('recovery key: new passphrase and new key; old ones stop working', async ({ page, problems }) => {
		test.setTimeout(120_000);
		const user = await signUpViaApi(page, 'recover');
		await page.context().clearCookies();
		const next = newPassphrase();

		await page.goto('/recover');
		await page.getByLabel('Username').fill(user.username.toUpperCase());
		// Any formatting works: lower case, spaces instead of dashes.
		await page.getByLabel('Recovery key').fill(user.recoveryKey.toLowerCase().replaceAll('-', ' '));
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Choose a new passphrase' })).toBeVisible();
		await fillNewPassphrase(page, next);
		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText(/the old one no longer works/)).toBeVisible();
		const groups = await readRecoveryKey(page);
		expect(groups.join('-')).not.toBe(user.recoveryKey);
		await page.getByRole('button', { name: "I've stored it. Check me" }).click();
		await confirmRecoveryKey(page, groups);
		await expect(todayHeading(page)).toHaveText(GREETING, { timeout: 30_000 });

		// Sign out: the old passphrase fails, the new one works.
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await page.getByRole('button', { name: 'Sign out' }).click();
		await signInOnLoginPage(page, user.username, user.passphrase);
		await expect(page.getByRole('alert')).toContainText("don't match");
		await signInOnLoginPage(page, user.username, next);
		await expect(todayHeading(page)).toHaveText(GREETING, { timeout: 30_000 });

		// The old recovery key is dead.
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await page.getByRole('button', { name: 'Sign out' }).click();
		await page.goto('/recover');
		await page.getByLabel('Username').fill(user.username);
		await page.getByLabel('Recovery key').fill(user.recoveryKey);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('alert')).toContainText("don't match");
		expect(problems).toEqual([]);
	});

	test('a malformed recovery key is explained without asking the server', async ({ page, problems }) => {
		await page.goto('/recover');
		await page.getByLabel('Username').fill('someone');
		await page.getByLabel('Recovery key').fill('1234-5678');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('alert')).toContainText('32 letters and numbers, in 8 groups of 4');
		expect(problems).toEqual([]);
	});

	test('change passphrase signs out other devices; the new passphrase works', async ({
		page,
		playwright,
		problems
	}) => {
		test.setTimeout(120_000);
		const user = await signUpAndSignIn(page, '/me');
		await initCrypto();
		// A second "device": its own cookie jar, signed in through the API.
		const other = await playwright.request.newContext({ baseURL: ORIGIN });
		const pre = await (
			await other.post('/api/auth/prelogin', { headers: JSON_HEADERS, data: { username: user.username } })
		).json();
		const { authKey } = deriveFromPassphrase(
			user.passphrase,
			Buffer.from(pre.kdfSalt, 'base64url'),
			pre.kdfParams as typeof FAST_KDF
		);
		const login = await other.post('/api/auth/login', {
			headers: JSON_HEADERS,
			data: { username: user.username, authKey: toB64(authKey) }
		});
		expect(login.status()).toBe(200);
		expect((await other.get('/api/auth/session')).status()).toBe(200);

		const next = newPassphrase();
		await page.getByRole('button', { name: 'Change passphrase' }).click();
		const sheet = page.getByRole('dialog', { name: 'Change passphrase' });
		await sheet.getByLabel('Current passphrase').fill('wrong passphrase entirely');
		await sheet.getByLabel('New passphrase', { exact: true }).fill(next);
		await sheet.getByLabel('Repeat passphrase').fill(next);
		await sheet.getByRole('button', { name: 'Change passphrase' }).click();
		await expect(sheet.getByRole('alert')).toContainText("current passphrase doesn't match", {
			timeout: 30_000
		});
		await sheet.getByLabel('Current passphrase').fill(user.passphrase);
		await sheet.getByRole('button', { name: 'Change passphrase' }).click();
		await expect(page.getByText('Passphrase changed. Other devices were signed out.')).toBeVisible({
			timeout: 30_000
		});
		await expect(sheet).toBeHidden();
		expect((await other.get('/api/auth/session')).status()).toBe(401);
		await other.dispose();

		// This device stays signed in; after a lock the NEW passphrase unlocks.
		await page.getByRole('button', { name: 'Lock now' }).click();
		await page.getByLabel('Passphrase', { exact: true }).fill(user.passphrase);
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.getByRole('alert')).toContainText("doesn't match", { timeout: 30_000 });
		await unlockWith(page, next);
		await expect(page.getByRole('heading', { name: 'Me', exact: true })).toBeVisible();
		expect(problems).toEqual([]);
	});

	test('delete account: needs the passphrase, says what happens, then sign-in fails', async ({
		page,
		problems
	}) => {
		const user = await signUpAndSignIn(page, '/me');
		const danger = page.getByRole('heading', { name: 'Delete account' });
		await expect(danger).toBeVisible();
		await expect(page.getByText(/up to 14 days/).first()).toBeVisible();
		await expect(page.getByText(/Download a copy of your diary first/)).toBeVisible();
		await expect(page.getByText(/withdraws the agreement/).first()).toBeVisible();
		await page.getByRole('button', { name: 'Delete my account…' }).click();
		const sheet = page.getByRole('dialog', { name: 'Delete your account?' });
		await expect(sheet).toBeVisible();
		await sheet.getByLabel('Type your passphrase to confirm').fill('wrong passphrase entirely');
		await sheet.getByRole('button', { name: 'Delete everything' }).click();
		await expect(sheet.getByRole('alert')).toContainText("doesn't match");
		await sheet.getByLabel('Type your passphrase to confirm').fill(user.passphrase);
		await sheet.getByRole('button', { name: 'Delete everything' }).click();

		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByText(/Your account is deleted/)).toBeVisible();
		await signInOnLoginPage(page, user.username, user.passphrase);
		await expect(page.getByRole('alert')).toContainText("don't match");
		expect(
			dbRows('SELECT 1 FROM users WHERE username = ?', user.username),
			'user row is gone from the database'
		).toHaveLength(0);
		expect(problems).toEqual([]);
	});
});

test('the recovery key print sheet shows only the key and short instructions', async ({ page, problems }) => {
	test.setTimeout(120_000);
	const user = await signUpViaApi(page, 'print');
	await page.context().clearCookies();
	await page.goto('/recover');
	await page.getByLabel('Username').fill(user.username);
	await page.getByLabel('Recovery key').fill(user.recoveryKey);
	await page.getByRole('button', { name: 'Continue' }).click();
	await fillNewPassphrase(page, newPassphrase());
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible({ timeout: 30_000 });
	const groups = await readRecoveryKey(page);

	// On screen the print sheet is hidden. In print media, with the print flag set by the Print button, only it shows.
	const sheet = page.locator('.print-sheet');
	await expect(sheet).toBeHidden();
	await page.evaluate(() => {
		window.print = () => {}; // headless: just record that the button ran
	});
	await page.getByRole('button', { name: 'Print' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-print', 'recovery');
	await page.emulateMedia({ media: 'print' });
	await expect(sheet).toBeVisible();
	await expect(sheet).toContainText(groups.join('-'));
	await expect(sheet).toContainText('Printed on');
	await expect(sheet).toContainText(`Account: ${user.username}`);
	await expect(page.getByRole('button', { name: "I've stored it. Check me" })).toBeHidden();
	await expect(page.locator('#main')).toBeHidden();
	await page.emulateMedia({ media: 'screen' });
	expect(problems).toEqual([]);
});
