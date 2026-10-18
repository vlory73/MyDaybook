import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DATA_DIR, signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Each test uses its own account.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).click();
const strength = (page: Page, symptom: string, n: number) =>
	page
		.getByRole('radiogroup', { name: `${symptom}, how strong` })
		.getByRole('radio', { name: `${n}/5` })
		.click();

async function openTile(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Nausea / heartburn', exact: true }).click();
}

test('gut: nausea only needs two taps and Save', async ({ page }) => {
	await signUpAndSignIn(page);
	await openTile(page);
	await expect(
		page.getByRole('dialog').getByText('Only you can see this. Not even the server can.')
	).toBeVisible();
	const saveButton = page.getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeDisabled();

	// A symptom without a strength is not enough; "Vomited" only appears with nausea.
	await expect(page.getByRole('button', { name: 'Vomited', exact: true })).toBeHidden();
	await page.getByRole('button', { name: 'Nausea', exact: true }).click();
	await expect(saveButton).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Vomited', exact: true })).toBeVisible();
	await strength(page, 'Nausea', 3);
	await expect(saveButton).toBeEnabled();
	await save(page);

	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(timeline(page).getByText('Nausea 3/5', { exact: true })).toBeVisible();
	// Records only: nothing reacts to an entry.
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('gut: both symptoms with context; edit; delete with undo; reload; ciphertext only', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	const note = `synthetic gut note ${randomBytes(5).toString('hex')}`;
	await openTile(page);
	await page.getByRole('button', { name: 'Nausea', exact: true }).click();
	await strength(page, 'Nausea', 3);
	await page.getByRole('button', { name: 'Heartburn', exact: true }).click();
	await strength(page, 'Heartburn', 2);
	await page.getByRole('button', { name: 'Vomited', exact: true }).click();
	await page.getByRole('button', { name: 'After a meal', exact: true }).click();
	await page.getByRole('button', { name: 'At night', exact: true }).click();
	await page.getByRole('dialog').getByLabel('Note', { exact: true }).fill(note);
	await save(page);
	await expect(toast(page, 'Saved')).toBeVisible();
	const line = timeline(page).getByText('Nausea 3/5 · Heartburn 2/5', { exact: true });
	await expect(line).toBeVisible();
	await expect(timeline(page).getByText(`Vomited · After a meal · At night · ${note}`)).toBeVisible();

	// Reload: locked until the passphrase is typed, then the entry is back.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(line).toBeVisible();

	// Edit: change a strength, drop nausea (which also drops "Vomited").
	await line.click();
	await expect(
		page.getByRole('radiogroup', { name: 'Heartburn, how strong' }).getByRole('radio', { name: '2/5' })
	).toBeChecked();
	await strength(page, 'Heartburn', 4);
	await page.getByRole('button', { name: 'Nausea', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Vomited', exact: true })).toBeHidden();
	await save(page);
	const edited = timeline(page).getByText('Heartburn 4/5', { exact: true });
	await expect(edited).toBeVisible();
	await expect(timeline(page).getByText(`After a meal · At night · ${note}`)).toBeVisible();

	// Delete, then Undo
	await edited.click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(toast(page, 'Entry deleted')).toBeVisible();
	await expect(edited).toBeHidden();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(toast(page, 'Entry restored')).toBeVisible();
	await expect(edited).toBeVisible();

	// Privacy: the database (and its write-ahead log) holds ciphertext only.
	const files = ['app.db', 'app.db-wal'].map((f) => resolve(DATA_DIR, f)).filter((f) => existsSync(f));
	expect(files.length).toBeGreaterThan(0);
	const needles = [note, 'nausea', 'heartburn', Buffer.from(note).toString('base64')];
	for (const file of files) {
		const bytes = readFileSync(file);
		for (const needle of needles) {
			expect(bytes.includes(Buffer.from(needle, 'utf8')), `${file} contains "${needle}"`).toBe(false);
		}
	}
});
