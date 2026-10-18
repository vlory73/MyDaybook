import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DATA_DIR, signInOnLoginPage, signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Each test uses its own account, so entries never leak between tests.
const unique = (label: string) => `${label} ${randomBytes(5).toString('hex')}`;

async function addNote(page: Page, text: string) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Note', exact: true }).click();
	await page.getByLabel('Note text').fill(text);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Note saved')).toBeVisible();
}

const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });

test('a note appears in the timeline, survives a reload, can be edited and deleted with undo', async ({
	page
}) => {
	const user = await signUpAndSignIn(page);
	const text = unique('first synthetic note');
	await expect(page.getByText('A fresh page')).toBeVisible();

	await addNote(page, text);
	await expect(timeline(page).getByText(text)).toBeVisible();
	await expect(page.getByText('A fresh page')).toBeHidden();
	// The week strip marks today with a dot.
	await expect(page.locator('[aria-current="date"][data-has-entries="true"] .dot.shown')).toBeVisible();

	// Reload: the diary is locked until the passphrase is typed, then the note comes back.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(timeline(page).getByText(text)).toBeVisible();

	// Edit
	const edited = unique('edited synthetic note');
	await timeline(page).getByText(text).click();
	await expect(page.getByRole('heading', { name: 'Edit note' })).toBeVisible();
	await expect(page.getByLabel('Note text')).toHaveValue(text);
	await page.getByLabel('Note text').fill(edited);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Note saved')).toBeVisible();
	await expect(timeline(page).getByText(edited)).toBeVisible();
	await expect(page.getByText(text, { exact: true })).toBeHidden();

	// Delete, then Undo
	await timeline(page).getByText(edited).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('Note deleted')).toBeVisible();
	await expect(page.getByText(edited)).toBeHidden();
	await expect(page.getByText('A fresh page')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText('Note restored')).toBeVisible();
	await expect(timeline(page).getByText(edited)).toBeVisible();
});

test('a deleted note stays deleted after a reload', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	const text = unique('to be deleted');
	await addNote(page, text);
	await timeline(page).getByText(text).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('Note deleted')).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(page.getByText('A fresh page')).toBeVisible();
	await expect(page.getByText(text)).toBeHidden();
});

test('a second browser sees the note after signing in, and the server never held its text', async ({
	page,
	browser
}) => {
	const user = await signUpAndSignIn(page);
	const text = unique('needle synthetic note');
	await addNote(page, text);
	await expect(timeline(page).getByText(text)).toBeVisible();

	const other = await browser.newContext();
	try {
		const second = await other.newPage();
		await second.goto('/login');
		await expect(second.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
		await signInOnLoginPage(second, user.username, user.passphrase);
		await expect(second.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
			timeout: 30_000
		});
		await expect(timeline(second).getByText(text)).toBeVisible();
	} finally {
		await other.close();
	}

	// Privacy: the database file (and its write-ahead log) must not contain the text, in any encoding we can think of.
	const files = ['app.db', 'app.db-wal'].map((f) => resolve(DATA_DIR, f)).filter((f) => existsSync(f));
	expect(files.length).toBeGreaterThan(0);
	const needles = [
		text,
		Buffer.from(text).toString('base64'),
		Buffer.from(text).toString('base64url'),
		'needle synthetic'
	];
	for (const file of files) {
		const bytes = readFileSync(file);
		for (const needle of needles) {
			expect(bytes.includes(Buffer.from(needle, 'utf8')), `${file} contains "${needle}"`).toBe(false);
		}
	}
});

test('the week strip selects other days and shows an empty day', async ({ page }) => {
	await signUpAndSignIn(page);
	const today = page.locator('[aria-current="date"]');
	await expect(today).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Previous week' }).click();
	await expect(today).toBeHidden();
	await page.locator('[data-day]').first().click();
	await expect(page.getByText('Nothing logged on this day.')).toBeVisible();
	await page.getByRole('button', { name: 'Next week' }).click();
	await expect(today).toBeVisible();
});

test('other quick-log tiles still say they are coming', async ({ page }) => {
	await signUpAndSignIn(page);
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal' }).click();
	await expect(page.getByText('Logging arrives in the next version.')).toBeVisible();
});
