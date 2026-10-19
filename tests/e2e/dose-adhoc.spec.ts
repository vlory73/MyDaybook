import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DATA_DIR, signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Tests share one database, so every medicine name carries a random suffix.
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Log another medicine' });
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const unique = (base: string) => `${base}${randomBytes(3).toString('hex')}`;

async function logAdhoc(page: Page, name: string, options: { amount?: string; keep?: boolean } = {}) {
	await page.getByRole('button', { name: 'Log another medicine' }).click();
	const s = sheet(page);
	await s.getByLabel('Medicine', { exact: true }).fill(name);
	if (options.amount) await s.getByLabel('Amount', { exact: false }).fill(options.amount);
	if (options.keep === false) await s.getByRole('switch', { name: 'Keep in my medicines' }).click();
	await s.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Dose logged')).toBeVisible();
	await expect(s).toBeHidden();
}

test('log another medicine: keep on and off, existing name, Undo, reload, ciphertext only', async ({
	page
}) => {
	const user = await signUpAndSignIn(page, '/meds');
	const kept = unique('Keepol');
	const dropped = unique('Dropol');
	const undone = unique('Undool');

	// Keep ON (the default): it is a "when needed" medicine afterwards.
	await logAdhoc(page, kept, { amount: '3 drops' });
	await expect(page.getByRole('button', { name: `Log a dose of ${kept}` })).toBeVisible();
	// Listed on Meds as well (the row is named "Edit <name>").
	const keptRow = page.getByRole('button', { name: `Edit ${kept}`, exact: true });
	await expect(keptRow).toBeVisible();
	// Its form is "Other", which the row leaves out.
	await expect(keptRow).not.toContainText('Other');

	// Keep OFF: archived, not under When needed.
	await toast(page, 'Dose logged').waitFor({ state: 'hidden' });
	await logAdhoc(page, dropped, { keep: false });
	await expect(page.getByRole('button', { name: `Log a dose of ${dropped}` })).toBeHidden();
	await page.locator('details.archived summary').click();
	await expect(page.getByRole('list', { name: 'Archived' }).getByText(dropped)).toBeVisible();

	// Doses are on the timeline.
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(timeline(page).getByText(`${kept} · Taken`)).toBeVisible();
	await expect(timeline(page).getByText('3 drops')).toBeVisible();
	await expect(timeline(page).getByText(`${dropped} · Taken`)).toBeVisible();

	// An existing name (any case) hides the toggle and creates no second medication.
	await page.getByRole('link', { name: 'Meds', exact: true }).click();
	await toast(page, 'Dose logged').waitFor({ state: 'hidden' });
	await page.getByRole('button', { name: 'Log another medicine' }).click();
	const s = sheet(page);
	await expect(s.getByRole('switch')).toBeVisible();
	await s.getByLabel('Medicine', { exact: true }).fill(kept.toUpperCase());
	await expect(s.getByRole('switch')).toBeHidden();
	await expect(s.getByText('Already in your medicines')).toBeVisible();
	await s.getByLabel('Medicine', { exact: true }).fill(dropped);
	await expect(s.getByText('Logged with your earlier entries')).toBeVisible();
	await s.getByLabel('Medicine', { exact: true }).fill(kept.toUpperCase());
	await s.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(s).toBeHidden();
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(timeline(page).getByText(`${kept} · Taken`)).toHaveCount(2);
	await page.getByRole('link', { name: 'Meds', exact: true }).click();
	await expect(page.getByRole('list', { name: 'Medication' }).getByText(kept, { exact: true })).toHaveCount(
		1
	);

	// Undo removes the dose and the medication that was created for it.
	await toast(page, 'Dose logged').waitFor({ state: 'hidden' });
	await logAdhoc(page, undone);
	await expect(page.getByRole('button', { name: `Log a dose of ${undone}` })).toBeVisible();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: `Log a dose of ${undone}` })).toBeHidden();
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(timeline(page).getByText(`${undone} · Taken`)).toBeHidden();

	// Reload and unlock: everything is still there.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	// After unlock the records are synced and decrypted first; WebKit on CI can take longer than the default 5 s.
	await expect(timeline(page).getByText(`${kept} · Taken`)).toHaveCount(2, { timeout: 15_000 });
	await expect(timeline(page).getByText(`${dropped} · Taken`)).toBeVisible();
	await expect(timeline(page).getByText(`${undone} · Taken`)).toBeHidden();

	// The quick-log Medicine sheet has the entry point too.
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Medicine', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Medicine' })
		.getByRole('button', { name: 'Log another medicine' })
		.click();
	await expect(sheet(page)).toBeVisible();

	// Privacy: names and amounts are not in the database file or the API response.
	const files = ['app.db', 'app.db-wal'].map((f) => resolve(DATA_DIR, f)).filter((f) => existsSync(f));
	expect(files.length).toBeGreaterThan(0);
	for (const file of files) {
		const bytes = readFileSync(file);
		for (const needle of [kept, dropped, '3 drops']) {
			for (const encoded of [needle, Buffer.from(needle).toString('base64')]) {
				expect(bytes.includes(Buffer.from(encoded, 'utf8')), `${file} contains "${encoded}"`).toBe(false);
			}
		}
	}
	const body = await (await page.request.get('/api/records')).text();
	for (const needle of [kept, dropped, '3 drops']) expect(body).not.toContain(needle);
});
