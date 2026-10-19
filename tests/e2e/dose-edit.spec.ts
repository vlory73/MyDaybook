import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Medicine names carry a random suffix: tests share one database.
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const medSheet = (page: Page) => page.getByRole('dialog', { name: /medication/i });
const today = (page: Page) => page.getByRole('region', { name: "Today's medication" });
const doseRow = (page: Page, name: string) =>
	today(page).getByRole('button', { name: new RegExp(`^${name}`) });
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const suffix = () => randomBytes(3).toString('hex');

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

const localDay = (page: Page) =>
	page.evaluate(() => {
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	});

test('a taken dose gets a corrected time, and Taken accepts a picked time without "late"', async ({
	page
}) => {
	const user = await signUpAndSignIn(page, '/meds');
	const alfa = `Timedol${suffix()}`;
	const beta = `Pickdol${suffix()}`;
	await addMed(page, alfa, { amount: '1 tablet' });
	await addMed(page, beta, { amount: '2 capsules' });
	const day = await localDay(page);

	// One tap, then the pill opens the sheet to correct the time.
	await today(page)
		.getByRole('button', { name: `Mark ${alfa} as taken` })
		.click();
	await expect(toast(page, 'Marked as taken')).toBeVisible();
	await today(page)
		.getByRole('button', { name: /^Taken · \d\d:\d\d$/ })
		.click();
	const sheet = page.getByRole('dialog', { name: alfa });
	await expect(sheet.getByRole('radio', { name: 'Taken', exact: true })).toBeChecked();
	await expect(sheet.getByLabel('When did you take it?')).toHaveValue(new RegExp(`^${day}T\\d\\d:\\d\\d$`));
	await sheet.getByLabel('When did you take it?').fill(`${day}T07:12`);
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();
	await expect(today(page).getByRole('button', { name: 'Taken · 07:12', exact: true })).toBeVisible();

	// A not yet logged dose: choose Taken and a time directly.
	await doseRow(page, beta).click();
	const direct = page.getByRole('dialog', { name: beta });
	await direct.getByRole('radio', { name: 'Taken', exact: true }).click();
	await expect(direct.getByLabel('When did you take it?')).toBeVisible();
	await direct.getByLabel('When did you take it?').fill(`${day}T06:45`);
	// The picked time survives switching status back and forth.
	await direct.getByRole('radio', { name: 'Skipped' }).click();
	await expect(direct.getByLabel('When did you take it?')).toBeHidden();
	await direct.getByRole('radio', { name: 'Taken', exact: true }).click();
	await expect(direct.getByLabel('When did you take it?')).toHaveValue(`${day}T06:45`);
	await direct.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(direct).toBeHidden();
	await expect(today(page).getByRole('button', { name: 'Taken · 06:45', exact: true })).toBeVisible();

	await page.reload();
	await unlockWith(page, user.passphrase);
	await expect(today(page).getByRole('button', { name: 'Taken · 07:12', exact: true })).toBeVisible();
	await expect(today(page).getByRole('button', { name: 'Taken · 06:45', exact: true })).toBeVisible();
});

test('an as-needed dose can be moved to another medicine', async ({ page }) => {
	await signUpAndSignIn(page, '/meds');
	const s = suffix();
	const a = `Aspray${s}`;
	const b = `Bspray${s}`;
	await addMed(page, a, { asNeeded: true });
	await addMed(page, b, { asNeeded: true });

	await today(page)
		.getByRole('button', { name: `Log a dose of ${a}` })
		.click();
	const created = page.getByRole('dialog', { name: 'Log a dose' });
	await expect(created.getByLabel('Medicine')).toHaveValue(/.+/);
	await created.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(created).toBeHidden();

	await page.getByRole('link', { name: 'Today', exact: true }).click();
	const tl = timeline(page);
	await tl.getByText(`${a} · Taken`).click();
	const edit = page.getByRole('dialog', { name: 'Dose', exact: true });
	await edit.getByLabel('Medicine').selectOption({ label: b });
	await edit.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(edit).toBeHidden();
	await expect(tl.getByText(`${b} · Taken`)).toBeVisible();
	await expect(tl.getByText(`${a} · Taken`)).toBeHidden();
});

test('the Meds row says Edit and opens the set-up sheet with the saved values', async ({ page }) => {
	await signUpAndSignIn(page, '/meds');
	const name = `Editdol${suffix()}`;
	await addMed(page, name, { amount: '3 drops' });
	const row = page.getByRole('button', { name: `Edit ${name}`, exact: true });
	await expect(row).toContainText('Edit');
	await row.click();
	const s = medSheet(page);
	await expect(s.getByLabel('Name', { exact: true })).toHaveValue(name);
	await expect(s.getByLabel('Amount 1', { exact: true })).toHaveValue('3 drops');
});
