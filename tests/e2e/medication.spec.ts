import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DATA_DIR, signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Each test uses its own account.
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: /medication/i });
const list = (page: Page) => page.getByRole('list', { name: 'Medication', exact: true });
// Only the medication list rows (the Today section above the list has its own buttons for the same names).
const row = (page: Page, name: string) => page.locator('button.med', { hasText: new RegExp(name) });

async function addMed(page: Page, name: string) {
	await page.getByRole('button', { name: 'Add medication' }).click();
	await sheet(page).getByLabel('Name', { exact: true }).fill(name);
}
const save = async (page: Page) => {
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(sheet(page)).toBeHidden();
};

test('add, edit, archive, delete with undo; survives reload; the server only holds ciphertext', async ({
	page
}) => {
	const user = await signUpAndSignIn(page, '/meds');
	const daily = `Synthol ${randomBytes(4).toString('hex')}`;
	await expect(page.getByText('No medication yet')).toBeVisible();

	// Every day with two times and a strength.
	await addMed(page, daily);
	const s = sheet(page);
	await s.getByLabel('Strength', { exact: true }).fill('20');
	await s.getByLabel('Unit', { exact: true }).selectOption('µg');
	await s.getByRole('button', { name: 'Capsule', exact: true }).click();
	await s.getByLabel('Amount 1', { exact: true }).fill('1 capsule');
	await s.getByRole('button', { name: 'Add a time' }).click();
	await s.getByLabel('Time 2', { exact: true }).fill('20:00');
	await s.getByLabel('Amount 2', { exact: true }).fill('2 capsules');
	await save(page);
	await expect(row(page, daily)).toContainText('20 µg · Capsule');
	await expect(row(page, daily)).toContainText('Every day · 08:00, 20:00');
	await expect(page.getByText('No medication yet')).toBeHidden();

	// Some weekdays.
	await addMed(page, 'Weekdol');
	await s.getByRole('radio', { name: 'Some weekdays' }).click();
	await expect(s.getByRole('button', { name: 'Save', exact: true })).toBeDisabled(); // needs a day
	for (const d of ['Mon', 'Wed', 'Fri']) await s.getByRole('button', { name: d, exact: true }).click();
	await s.getByLabel('Amount 1', { exact: true }).fill('5 ml');
	await save(page);
	await expect(row(page, 'Weekdol')).toContainText('Mon, Wed, Fri · 08:00');

	// Every few days.
	await addMed(page, 'Fewdol');
	await s.getByRole('radio', { name: 'Every few days' }).click();
	await s.getByRole('button', { name: 'One day more' }).click();
	await save(page);
	await expect(row(page, 'Fewdol')).toContainText('Every 3 days · 08:00');

	// As needed: no times.
	await addMed(page, 'Asneedol');
	await s.getByRole('radio', { name: 'When needed' }).click();
	await expect(s.getByLabel('Time 1', { exact: true })).toBeHidden();
	await save(page);
	await expect(row(page, 'Asneedol')).toContainText('When needed');

	// Edit: the sheet shows the saved values; the change shows in the list.
	await row(page, daily).click();
	await expect(s.getByLabel('Name', { exact: true })).toHaveValue(daily);
	await expect(s.getByLabel('Amount 2', { exact: true })).toHaveValue('2 capsules');
	await s.getByLabel('Amount 2', { exact: true }).fill('1 capsule at night');
	await s.getByRole('button', { name: 'Remove time 1' }).click();
	await save(page);
	await expect(row(page, daily)).toContainText('Every day · 20:00');
	await row(page, daily).click();
	await expect(s.getByLabel('Amount 1', { exact: true })).toHaveValue('1 capsule at night');
	await s.getByRole('button', { name: 'Close' }).click();

	// Archive and unarchive.
	await row(page, 'Weekdol').click();
	await s.getByRole('button', { name: 'Archive', exact: true }).click();
	await expect(toast(page, 'Medication archived')).toBeVisible();
	await expect(list(page).getByText('Weekdol')).toBeHidden();
	const archived = page.locator('details.archived');
	await expect(archived.locator('summary')).toHaveText('Archived (1)');
	await archived.locator('summary').click();
	await row(page, 'Weekdol').click();
	await s.getByRole('button', { name: 'Unarchive' }).click();
	await expect(toast(page, 'Medication active again')).toBeVisible();
	await expect(list(page).getByText('Weekdol')).toBeVisible();
	await expect(archived).toBeHidden();

	// Delete with Undo, no confirmation.
	await row(page, 'Asneedol').click();
	await s.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(toast(page, 'Medication deleted')).toBeVisible();
	await expect(list(page).getByText('Asneedol')).toBeHidden();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(toast(page, 'Medication restored')).toBeVisible();
	await expect(row(page, 'Asneedol')).toBeVisible();

	// Reload and unlock: all four are still there.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(row(page, daily)).toContainText('Every day · 20:00');
	for (const name of ['Weekdol', 'Fewdol', 'Asneedol']) await expect(row(page, name)).toBeVisible();

	// Privacy: neither names nor amounts appear in the database file, in any encoding we can think of.
	const files = ['app.db', 'app.db-wal'].map((f) => resolve(DATA_DIR, f)).filter((f) => existsSync(f));
	expect(files.length).toBeGreaterThan(0);
	const needles = [daily, 'Weekdol', 'Asneedol', '1 capsule at night', 'medication'];
	for (const file of files) {
		const bytes = readFileSync(file);
		for (const needle of needles) {
			for (const encoded of [needle, Buffer.from(needle).toString('base64')]) {
				expect(bytes.includes(Buffer.from(encoded, 'utf8')), `${file} contains "${encoded}"`).toBe(false);
			}
		}
	}
	// And the API hands out only opaque ciphertext.
	const res = await page.request.get('/api/records');
	const body = await res.text();
	expect(body).not.toContain(daily);
	expect(body).not.toContain('Weekdol');
});
