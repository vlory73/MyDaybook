import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { seedRecords, signUpApiAccount, unlockWith } from './helpers';
import { at, heatSet, smallSet } from './trends-data';
import { addDays, todayKey } from '../../src/lib/records/time';

// Synthetic data only. The service worker is blocked like in the other specs that reload (WebKit lessons).
test.use({ serviceWorkers: 'block' });

const QUESTION = 'Is it worth moving the evening tablet? The knee is worse at night.';

async function seed(page: Page) {
	const account = await signUpApiAccount(page.request);
	const [daily, prn] = await seedRecords(page.request, account, [
		{
			v: 1,
			type: 'medication',
			name: 'Magnesium',
			strength: 250,
			unit: 'mg',
			form: 'tablet',
			schedule: { kind: 'daily' },
			times: [{ time: '08:00', amount: '1 tablet' }],
			start: addDays(todayKey(), -60),
			reminders: false,
			archived: false
		},
		{
			v: 1,
			type: 'medication',
			name: 'Paracetamol',
			strength: 500,
			unit: 'mg',
			form: 'tablet',
			schedule: { kind: 'as_needed' },
			times: [],
			start: addDays(todayKey(), -60),
			reminders: false,
			archived: false
		}
	]);
	const slot = (ago: number) => ({ date: addDays(todayKey(), -ago), time: '08:00' });
	await seedRecords(page.request, account, [
		{ v: 1, type: 'dose', at: at(1, 8, 5), medicationId: daily!, status: 'taken', slot: slot(1) },
		{ v: 1, type: 'dose', at: at(2, 8, 5), medicationId: daily!, status: 'taken', slot: slot(2) },
		{ v: 1, type: 'dose', at: at(3, 8, 5), medicationId: daily!, status: 'taken', slot: slot(3) },
		{ v: 1, type: 'dose', at: at(4, 9, 30), medicationId: daily!, status: 'late', slot: slot(4) },
		{ v: 1, type: 'dose', at: at(5, 8, 0), medicationId: daily!, status: 'skipped', slot: slot(5) },
		{ v: 1, type: 'dose', at: at(2, 21, 15), medicationId: prn!, status: 'taken', amount: '500 mg' },
		{ v: 1, type: 'dose', at: at(6, 12, 0), medicationId: prn!, status: 'taken', amount: '500 mg' },
		{ v: 1, type: 'note', at: at(3, 12), text: 'Walked to the shop and back', tags: [] },
		...smallSet(),
		...heatSet()
	]);
	return account;
}

const optionsOf = async (page: Page) => {
	const account = await seed(page);
	await page.goto('/trends');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await page.getByRole('link', { name: 'Reports' }).click();
	await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible();
	await page.getByTestId('report-doctor').click();
	await expect(page.getByRole('heading', { name: 'Doctor visit', level: 1 })).toBeVisible();
	return account;
};
const box = (page: Page, name: RegExp | string) => page.getByRole('checkbox', { name });
const pages = (page: Page) => page.getByTestId('doctor-page');

test('Reports page, doctor options, preview and what stays out of storage', async ({ page }) => {
	await page.addInitScript(() => {
		(window as unknown as { printed: number }).printed = 0;
		window.print = () => {
			(window as unknown as { printed: number }).printed++;
		};
	});
	await optionsOf(page);

	// Defaults: 30 days; every section with data ticked except Notes and the headache pages.
	await expect(page.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute('aria-pressed', 'true');
	await expect(box(page, /^Medicines/)).toBeChecked();
	await expect(box(page, /^Pain and heat map/)).toBeChecked();
	await expect(box(page, /^Sleep/)).toBeChecked();
	await expect(box(page, /^Notes/)).not.toBeChecked();
	await expect(box(page, /^Notes/)).toBeEnabled();
	await expect(box(page, /^Add the Headache diary pages/)).not.toBeChecked();
	// No pain episode was made: shown, disabled, with the reason.
	await expect(box(page, /^Pain episodes/)).toBeDisabled();
	await expect(page.getByText('Nothing in this period').first()).toBeVisible();

	// The name is prefilled (the login name) and editable; the questions are typed in.
	await expect(page.getByLabel('Name on the report')).not.toHaveValue('');
	await page.getByLabel('Name on the report').fill('Sam Example');
	await page.getByLabel(/^Questions for your doctor/).fill(QUESTION);
	await page.getByRole('button', { name: 'Preview report' }).click();

	await expect(page).toHaveURL(/\/reports\/doctor\/print$/);
	expect(page.url()).not.toContain('Sam');
	await expect(pages(page).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('doctor-name')).toHaveText('Sam Example');
	await expect(page.getByRole('heading', { name: 'Doctor visit summary', level: 1 }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'My questions' })).toBeVisible();
	await expect(pages(page).first()).toContainText(QUESTION);
	await expect(page.getByRole('heading', { name: 'Medicines' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Pain', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: "How you've been" })).toBeVisible();

	// Magnesium: 3 taken, 1 skipped, 1 late. Paracetamol was taken twice when needed.
	const med = page.locator('tbody tr').filter({ hasText: 'Magnesium' });
	await expect(med.locator('td').nth(0)).toHaveText('Magnesium');
	await expect(med.locator('td').nth(1)).toHaveText('250 mg');
	await expect(med.locator('td').nth(4)).toHaveText('3');
	await expect(med.locator('td').nth(5)).toHaveText('1');
	await expect(med.locator('td').nth(6)).toHaveText('1');
	await expect(page.locator('tbody tr').filter({ hasText: 'Paracetamol' })).toContainText('2 times');
	// Notes and the headache pages were not ticked.
	await expect(page.getByText('Walked to the shop and back')).toHaveCount(0);
	await expect(page.getByText('see the Headache diary pages')).toHaveCount(0);
	await expect(page.locator('.report-sheet')).toHaveCount(0);

	// Every sheet has the footer and its page number.
	const count = await pages(page).count();
	await expect(page.getByText(`Page 1 of ${count}`)).toBeVisible();
	await expect(page.getByText('Not a medical assessment.').first()).toBeVisible();

	// The question and the name live in memory only.
	const stored = await page.evaluate(() =>
		JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })
	);
	expect(stored).not.toContain('evening tablet');
	expect(stored).not.toContain('Sam Example');
	expect(page.url()).not.toContain('evening');

	// Back keeps the choices made a moment ago; Notes and the diary pages can be added.
	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page.getByLabel(/^Questions for your doctor/)).toHaveValue(QUESTION);
	await expect(page.getByLabel('Name on the report')).toHaveValue('Sam Example');
	await box(page, /^Notes/).check();
	await box(page, /^Add the Headache diary pages/).check();
	await page.getByRole('button', { name: 'Preview report' }).click();
	await expect(pages(page).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
	await expect(page.getByText('Walked to the shop and back')).toBeVisible();
	await expect(page.getByText('see the Headache diary pages')).toBeVisible();
	await expect(page.locator('.report-sheet').first()).toBeVisible();
	await expect(page.locator('.report-sheet').first()).toContainText('Sam Example');

	// The toolbar prints.
	await page.getByRole('button', { name: 'Print or save as PDF' }).click();
	expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});

test('the report language is separate from the app language', async ({ page }) => {
	await optionsOf(page);
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await page.getByRole('button', { name: 'Preview report' }).click();
	await expect(pages(page).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole('heading', { name: 'Overblik til lægebesøg', level: 1 }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Medicin' })).toBeVisible();
	await expect(page.getByText('Ikke en lægelig vurdering.').first()).toBeVisible();
	// The app itself stays in English.
	await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
});

test('a reload of the report goes back to the options (nothing was kept)', async ({ page }) => {
	const account = await optionsOf(page);
	await page.getByLabel(/^Questions for your doctor/).fill(QUESTION);
	await page.getByRole('button', { name: 'Preview report' }).click();
	await expect(pages(page).first()).toBeVisible({ timeout: 15_000 });
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await expect(page.getByRole('heading', { name: 'Doctor visit', level: 1 })).toBeVisible({
		timeout: 15_000
	});
	await expect(page.getByLabel(/^Questions for your doctor/)).toHaveValue('');
});
