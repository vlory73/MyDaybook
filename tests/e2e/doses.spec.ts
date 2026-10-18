import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DATA_DIR, signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Each test uses its own account.
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const medSheet = (page: Page) => page.getByRole('dialog', { name: /medication/i });
const today = (page: Page) => page.getByRole('region', { name: "Today's medication" });
const doseRow = (page: Page, name: string) =>
	today(page).getByRole('button', { name: new RegExp(`^${name}`) });
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });

/** Adds a medication through the set-up sheet. Every day at 08:00 unless `asNeeded`. */
async function addMed(page: Page, name: string, options: { amount?: string; asNeeded?: boolean } = {}) {
	await page.getByRole('button', { name: 'Add medication' }).click();
	const s = medSheet(page);
	await s.getByLabel('Name', { exact: true }).fill(name);
	if (options.asNeeded) await s.getByRole('radio', { name: 'When needed' }).click();
	else if (options.amount) await s.getByLabel('Amount 1', { exact: true }).fill(options.amount);
	await s.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(s).toBeHidden();
}

/** The phone's local day, the way the app computes it. */
const localDay = (page: Page) =>
	page.evaluate(() => {
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	});

test('All taken with one Undo, skipped, taken late, as-needed, quick-log tile; survives reload; ciphertext only', async ({
	page
}) => {
	const user = await signUpAndSignIn(page, '/meds');
	const suffix = randomBytes(3).toString('hex');
	const alfa = `Alfadol${suffix}`;
	const beta = `Betadol${suffix}`;
	const spray = `Spraydol${suffix}`;

	await addMed(page, alfa, { amount: '1 tablet' });
	await expect(today(page)).toBeVisible();
	await addMed(page, beta, { amount: '2 capsules' });
	await addMed(page, spray, { asNeeded: true });

	// The Today section on the Meds tab: one 08:00 group, amounts as entered, nothing logged yet.
	const group = today(page).getByRole('group', { name: '08:00' });
	await expect(group).toBeVisible();
	await expect(doseRow(page, alfa)).toContainText('1 tablet');
	await expect(doseRow(page, beta)).toContainText('2 capsules');
	await expect(today(page).locator('.pill')).toHaveCount(0);

	// All taken: both logged at once, one Undo removes both.
	await today(page).getByRole('button', { name: 'All taken at 08:00' }).click();
	await expect(toast(page, 'Marked as taken')).toBeVisible();
	await expect(today(page).locator('.pill.taken')).toHaveCount(2);
	await expect(today(page).getByRole('button', { name: 'All taken at 08:00' })).toBeHidden();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(today(page).locator('.pill')).toHaveCount(0);
	await expect(today(page).getByRole('button', { name: 'All taken at 08:00' })).toBeVisible();

	// One tap on a single row, and changing it to Skipped through the sheet.
	await today(page)
		.getByRole('button', { name: `Mark ${alfa} as taken` })
		.click();
	await expect(toast(page, 'Marked as taken')).toBeVisible();
	await expect(today(page).locator('.pill.taken')).toHaveCount(1);
	await doseRow(page, alfa).click();
	const dose = page.getByRole('dialog', { name: alfa });
	await expect(dose.getByRole('radio', { name: 'Taken', exact: true })).toBeChecked();
	await dose.getByRole('radio', { name: 'Skipped' }).click();
	await dose.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(dose).toBeHidden();
	await expect(today(page).locator('.pill.skipped')).toHaveText('Skipped');

	// Taken late with a picked time.
	const day = await localDay(page);
	await doseRow(page, beta).click();
	const lateSheet = page.getByRole('dialog', { name: beta });
	await expect(lateSheet.getByLabel('When did you take it?')).toBeHidden();
	await lateSheet.getByRole('radio', { name: 'Taken late' }).click();
	await expect(lateSheet.getByLabel('When did you take it?')).toHaveValue(
		new RegExp(`^${day}T\\d\\d:\\d\\d$`)
	);
	await lateSheet.getByLabel('When did you take it?').fill(`${day}T13:40`);
	await lateSheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(lateSheet).toBeHidden();
	await expect(today(page).locator('.pill.late')).toHaveText('Late · 13:40');

	// As needed: "Log a dose" with an amount and a time.
	await today(page)
		.getByRole('button', { name: `Log a dose of ${spray}` })
		.click();
	const asNeeded = page.getByRole('dialog', { name: 'Log a dose' });
	await asNeeded.getByLabel('Amount', { exact: false }).fill('2 puffs');
	await asNeeded.getByLabel('Time of the entry').fill(`${day}T09:15`);
	await asNeeded.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(asNeeded).toBeHidden();

	// The timeline on Today shows all three, with the meds wording.
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	const tl = timeline(page);
	await expect(tl.getByText(`${alfa} · Skipped`)).toBeVisible();
	await expect(tl.getByText(`${beta} · Taken late 13:40`)).toBeVisible();
	await expect(tl.getByText(`${spray} · Taken`)).toBeVisible();
	await expect(tl.getByText('2 puffs')).toBeVisible();
	await expect(today(page).locator('.pill')).toHaveCount(2);

	// A logged dose opens from the timeline and can be removed with Undo (no confirmation).
	await tl.getByText(`${alfa} · Skipped`).click();
	await page.getByRole('dialog', { name: alfa }).getByRole('button', { name: 'Remove entry' }).click();
	await expect(toast(page, 'Entry removed')).toBeVisible();
	await expect(tl.getByText(`${alfa} · Skipped`)).toBeHidden();
	await expect(today(page).locator('.pill')).toHaveCount(1);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(tl.getByText(`${alfa} · Skipped`)).toBeVisible();

	// The quick-log "Medicine" tile lists today's doses and the as-needed medication.
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Medicine', exact: true }).click();
	const medicine = page.getByRole('dialog', { name: 'Medicine' });
	await expect(medicine.getByRole('button', { name: `Log a dose of ${spray}` })).toBeVisible();
	await expect(medicine.getByRole('button', { name: new RegExp(`^${alfa}`) })).toBeVisible();
	await medicine.getByRole('button', { name: new RegExp(`^${alfa}`) }).click();
	await expect(medicine).toBeHidden();
	await page.getByRole('dialog', { name: alfa }).getByRole('radio', { name: 'Taken', exact: true }).click();
	await page.getByRole('dialog', { name: alfa }).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(tl.getByText(`${alfa} · Taken`, { exact: true })).toBeVisible();

	// Reload and unlock: the doses are still there.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(tl.getByText(`${beta} · Taken late 13:40`)).toBeVisible();
	await expect(tl.getByText(`${spray} · Taken`)).toBeVisible();
	await expect(today(page).locator('.pill.late')).toHaveText('Late · 13:40');
	await expect(today(page).locator('.pill.taken')).toHaveCount(1);

	// Privacy: names, amounts and statuses are not in the database file in any encoding we can think of.
	const files = ['app.db', 'app.db-wal'].map((f) => resolve(DATA_DIR, f)).filter((f) => existsSync(f));
	expect(files.length).toBeGreaterThan(0);
	const needles = [alfa, beta, spray, '1 tablet', '2 capsules', '2 puffs', 'dose', 'skipped', 'late'];
	for (const file of files) {
		const bytes = readFileSync(file);
		for (const needle of needles) {
			for (const encoded of [needle, Buffer.from(needle).toString('base64')]) {
				expect(bytes.includes(Buffer.from(encoded, 'utf8')), `${file} contains "${encoded}"`).toBe(false);
			}
		}
	}
	const body = await (await page.request.get('/api/records')).text();
	for (const needle of [alfa, beta, spray, '2 puffs', 'skipped']) expect(body).not.toContain(needle);
});

test('days without anything scheduled show no medication card', async ({ page }) => {
	await signUpAndSignIn(page, '/');
	await expect(page.getByText('A fresh page')).toBeVisible();
	await expect(today(page)).toBeHidden();
	await page.getByRole('link', { name: 'Meds', exact: true }).click();
	await expect(today(page)).toBeHidden();
});
