import type { Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { test, expect } from './fixtures';
import { DATA_DIR, createInvite, newPassphrase, newUsername, signUpAndSignIn } from './helpers';

// Synthetic data only. Covers consent v2 at sign-up, the Privacy page inside and outside the join flow, and
// that people who agreed to v1 keep v1.

function withDb<T>(readonly: boolean, run: (db: Database.Database) => T): T {
	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly });
	try {
		db.pragma('busy_timeout = 5000');
		return run(db);
	} finally {
		db.close();
	}
}

async function walkJoinToConsent(page: Page, username: string, passphrase: string): Promise<void> {
	await page.goto(`/join#t=${createInvite()}`);
	await page.getByRole('button', { name: 'Get started' }).click();
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	await page.getByLabel('Repeat passphrase').fill(passphrase);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible({ timeout: 30_000 });
	const groups = await page.getByTestId('recovery-key').locator('span').allTextContents();
	await page.getByRole('button', { name: "I've stored it. Check me" }).click();
	const lead = (await page.getByText(/Type group \d+ and group \d+/).textContent()) ?? '';
	const [a, b] = [...lead.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
	await page.getByLabel(`Group ${a} (4 characters)`).fill(groups[a! - 1]!);
	await page.getByLabel(`Group ${b} (4 characters)`).fill(groups[b! - 1]!);
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
}

test.describe('consent v2 and the Privacy page', () => {
	test('sign-up shows version 2; reading the Privacy page keeps what was typed; the record says version 2', async ({
		page,
		problems
	}) => {
		test.setTimeout(120_000);
		void problems;
		const username = newUsername('priv');
		await walkJoinToConsent(page, username, newPassphrase());

		// The age line is a calm pill at the top; the checkbox says 13 or older; the days come from the server's setting.
		await expect(page.getByTestId('consent-age')).toHaveText('MyDaybook is for people aged 13 and over.');
		await expect(page.getByText(/Encrypted backup copies disappear within 14 days/)).toBeVisible();
		const agree = page.getByRole('checkbox', {
			name: 'I am 13 or older. I understand, and I agree to my diary being stored this way.'
		});
		await expect(agree).not.toBeChecked();
		await agree.check();

		// "Read how your data is handled" opens the Privacy content inside the join flow.
		await page.getByTestId('consent-read').click();
		await expect(page.getByRole('heading', { name: 'Your privacy', level: 1 })).toBeVisible();
		await expect(page).toHaveURL(/\/join$/);
		await expect(page.getByRole('heading', { name: 'Your agreement' })).toHaveCount(0);
		await expect(page.getByTestId('privacy-export')).toHaveCount(0);
		await expect(page.getByTestId('privacy-keep')).toContainText('7 days');
		await expect(page.getByTestId('privacy-keep')).toContainText('14 days');

		// Back returns to the same step with the box still ticked.
		await page.getByTestId('privacy-back').click();
		await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
		await expect(agree).toBeChecked();

		await page.getByRole('button', { name: 'Create my diary' }).click();
		await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
		await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

		const rows = withDb(true, (db) =>
			db
				.prepare(
					'SELECT c.version, c.text_hash FROM consents c JOIN users u ON u.id = c.user_id WHERE u.username = ?'
				)
				.all(username)
		) as { version: string; text_hash: string }[];
		expect(rows).toHaveLength(1);
		expect(rows[0]!.version).toBe('consent-v2');
		expect(rows[0]!.text_hash).toMatch(/^[0-9a-f]{64}$/);

		// Me -> Privacy shows the agreement with version 2 and the text that was agreed to.
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await page.getByTestId('privacy-link').click();
		await expect(page.getByRole('heading', { name: 'Your privacy', level: 1 })).toBeVisible();
		await expect(page.getByTestId('agreement-line')).toContainText(/You agreed on .+ · version 2/);
		await page.getByTestId('agreement-read').click();
		await expect(page.getByTestId('agreement-text')).toContainText(
			'MyDaybook is for people aged 13 and over.'
		);
		await expect(page.getByTestId('agreement-text')).toContainText('I am 13 or older.');
		await expect(page.getByText(/A newer version of this text exists/)).toHaveCount(0);
		await page.getByRole('button', { name: 'Back' }).click();
		await page.getByTestId('privacy-back').click();
		await expect(page.getByRole('heading', { name: 'Me', level: 1 })).toBeVisible();
	});

	test('someone who agreed to version 1 keeps it and sees their own text', async ({ page }) => {
		const user = await signUpAndSignIn(page);
		withDb(false, (db) =>
			db
				.prepare(
					"UPDATE consents SET version = 'consent-v1' WHERE user_id = (SELECT id FROM users WHERE username = ?)"
				)
				.run(user.username)
		);
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await page.getByTestId('privacy-link').click();
		await expect(page.getByTestId('agreement-line')).toContainText(/· version 1/);
		await page.getByTestId('agreement-read').click();
		const text = page.getByTestId('agreement-text');
		await expect(text).toContainText('I understand, and I agree to my diary being stored this way.');
		await expect(text).not.toContainText('13');
		await expect(page.getByText(/A newer version of this text exists/)).toBeVisible();
	});

	test('the Privacy page works signed out, without the agreement block', async ({ page }) => {
		await page.goto('/privacy');
		await expect(page.getByRole('heading', { name: 'Your privacy', level: 1 })).toBeVisible();
		await expect(page).toHaveURL(/\/privacy$/);
		await expect(page.getByRole('heading', { name: 'Your agreement' })).toHaveCount(0);
		await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
		await expect(page.getByTestId('privacy-back')).toHaveCount(0);
		await expect(page.getByTestId('privacy-keep')).toContainText('7 days');
		await expect(page.getByText('Datatilsynet (datatilsynet.dk)')).toBeVisible();
		// Operator details come from OPERATOR_NAME / OPERATOR_CONTACT (set in playwright.config.ts).
		await expect(page.getByTestId('operator')).toContainText('Example operator');
		await expect(page.getByTestId('operator')).toContainText('privacy@example.invalid');
	});

	test('the public endpoint has only the four settings; the consent endpoint needs a session', async ({
		page
	}) => {
		const res = await page.request.get('/api/privacy');
		expect(res.status()).toBe(200);
		expect(res.headers()['cache-control']).toContain('max-age=60');
		expect(await res.json()).toEqual({
			ipRetentionDays: 7,
			backupRetentionDays: 14,
			operatorName: 'Example operator',
			operatorContact: 'privacy@example.invalid'
		});
		expect((await page.request.get('/api/account/consent')).status()).toBe(401);
	});

	test('the Delete account text and the Privacy page name the same backup days', async ({ page }) => {
		await signUpAndSignIn(page, '/me');
		await expect(
			page.locator('#delete-account').getByText(/Encrypted backup copies are kept for up to 14 days/)
		).toBeVisible();
		await page.getByTestId('privacy-link').click();
		await page.getByTestId('privacy-delete').click();
		await expect(page.getByRole('heading', { name: 'Me', level: 1 })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Delete my account…' })).toBeInViewport();
	});
});
