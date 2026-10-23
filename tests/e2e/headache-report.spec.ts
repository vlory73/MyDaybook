import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpApiAccount, signUpAndSignIn, seedRecords, unlockWith } from './helpers';
import { at } from './trends-data';
import { addDays, todayKey } from '../../src/lib/records/time';

// Synthetic data only. The service worker is blocked like in the other specs that reload or stub (WebKit lessons).
test.use({ serviceWorkers: 'block' });

const head = (side: string, intensity: number, qualities: string[] = []) => ({
	region: 'temple',
	side,
	space: '2d-head-front-v2',
	u: 0.5,
	v: 0.5,
	intensity,
	qualities
});
const dm = (daysAgo: number) => {
	const [, m, d] = addDays(todayKey(), -daysAgo).split('-').map(Number) as [number, number, number];
	return `${d}/${m}`;
};

async function seed(page: Page) {
	const account = await signUpApiAccount(page.request);
	const [prn, daily] = await seedRecords(page.request, account, [
		{
			v: 1,
			type: 'medication',
			name: 'Paracetamol',
			strength: 500,
			unit: 'mg',
			form: 'tablet',
			schedule: { kind: 'as_needed' },
			times: [],
			start: addDays(todayKey(), -30),
			reminders: false,
			archived: false
		},
		{
			v: 1,
			type: 'medication',
			name: 'Daily vitamin',
			form: 'tablet',
			schedule: { kind: 'daily' },
			times: [{ time: '08:00', amount: '1 tablet' }],
			start: addDays(todayKey(), -30),
			reminders: false,
			archived: false
		}
	]);
	await seedRecords(page.request, account, [
		{
			v: 1,
			type: 'pain',
			at: at(2, 9),
			points: [head('right', 5, ['throbbing'])],
			headache: {
				started: at(2, 8),
				stopped: at(2, 14),
				before: ['vision'],
				worseWithActivity: true,
				light: true,
				sound: false,
				trigger: 'Poor sleep'
			}
		},
		{
			v: 1,
			type: 'pain',
			at: at(4, 22),
			points: [head('right', 8, ['throbbing']), head('left', 8)],
			headache: { started: at(4, 21), stopped: at(3, 2) }
		},
		{ v: 1, type: 'gut', at: at(4, 22, 30), symptoms: [{ kind: 'nausea', intensity: 4 }], flags: [] },
		{ v: 1, type: 'dose', at: at(2, 9, 10), medicationId: prn!, status: 'taken' },
		// Regular, scheduled medicine is not part of the report.
		{
			v: 1,
			type: 'dose',
			at: at(2, 8, 5),
			medicationId: daily!,
			status: 'taken',
			amount: '1 tablet',
			slot: { date: addDays(todayKey(), -2), time: '08:00' }
		}
	]);
	return account;
}

const openReports = async (page: Page) => {
	await page.getByRole('link', { name: 'Reports' }).click();
	await page.getByTestId('report-headache').click();
	await expect(page.getByRole('heading', { name: 'Headache diary', level: 1 })).toBeVisible();
};
const makeReport = async (page: Page) => {
	await page.getByRole('button', { name: 'Make report' }).click();
	await expect(page.getByTestId('report')).toBeVisible();
};
const row = (page: Page, label: string) =>
	page.locator('tbody tr').filter({
		has: page.getByRole('rowheader', {
			name: new RegExp(`^\\d*\\s*${label.replace(/[*]/g, '\\$&')}$`)
		})
	});

test('the report shows the right columns and values in both layouts and in Danish', async ({ page }) => {
	await page.addInitScript(() => {
		(window as unknown as { printed: number }).printed = 0;
		window.print = () => {
			(window as unknown as { printed: number }).printed++;
		};
	});
	const account = await seed(page);
	await page.goto('/trends');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await openReports(page);

	// Clean table: every day of the last 7 days, 12 rows in the form's order.
	await page.getByLabel('Name on the report').fill('Sam Example');
	await makeReport(page);
	await expect(page).toHaveURL(/\/reports\/headache\/print$/);
	expect(page.url()).not.toContain('Sam');
	await expect(page.getByRole('heading', { name: 'Headache diary', level: 1 })).toBeVisible();
	await expect(page.getByText('Sam Example')).toBeVisible();
	await expect(page.locator('.report-sheet')).toHaveCount(1);
	await expect(page.locator('thead th[scope=col]')).toHaveCount(7);
	await expect(page.locator('tbody tr')).toHaveCount(12);
	// The night that ran past midnight also marks the next day ("continued from"), so one fewer empty day.
	await expect(page.locator('td.none')).toHaveCount(4);
	await expect(page.getByText(/^continued from /)).toHaveCount(1);
	await expect(row(page, 'Started')).toContainText('21:00');
	await expect(row(page, 'Started')).toContainText('08:00');
	await expect(row(page, 'Stopped')).toContainText('02:00');
	await expect(row(page, 'Stopped')).toContainText('+1 day');
	await expect(row(page, 'Stopped')).toContainText('14:00');
	await expect(row(page, 'Side')).toContainText('both');
	await expect(row(page, 'Severity *')).toContainText('severe');
	await expect(row(page, 'Severity *')).toContainText('moderate');
	await expect(row(page, 'Nausea **')).toContainText('severe');
	await expect(row(page, 'Nausea **')).toContainText('none');
	await expect(row(page, 'Sensitive to sound')).toContainText('No');
	await expect(row(page, 'Possible trigger')).toContainText('Poor sleep');
	await expect(row(page, 'Medicine taken')).toContainText('Paracetamol');
	await expect(row(page, 'Medicine taken')).toContainText('500 mg · 09:10');
	await expect(page.locator('.report-sheet')).not.toContainText('Daily vitamin');
	await expect(page.getByText('regular scheduled medicines are not listed')).toBeVisible();
	await expect(page.getByText('Each column is the day the headache started.')).toBeVisible();

	// The toolbar prints; on paper the app chrome is gone.
	await page.getByRole('button', { name: 'Print or save as PDF' }).click();
	expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('nav.tabbar')).toBeHidden();
	await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden();
	await page.emulateMedia({ media: 'screen' });

	// Form layout: headache days only, boxes ticked, the layout is remembered.
	await page.getByRole('button', { name: 'Back' }).click();
	await page.getByRole('radio', { name: /Like the paper form/ }).click();
	await makeReport(page);
	await expect(page.getByRole('heading', { name: 'Headache diary — form layout', level: 1 })).toBeVisible();
	await expect(page.locator('td.empty')).toHaveCount(13 * 4); // 3 columns: two headache days and the day the night continued into
	await expect(row(page, 'Date')).toContainText(dm(4));
	await expect(row(page, 'Date')).toContainText(dm(3));
	await expect(row(page, 'Date')).toContainText(dm(2));
	await expect(page.locator('.bx.x')).toHaveCount(13); // +1: nausea "none" on the continued day
	await expect(page.locator('.report-sheet')).not.toContainText('Daily vitamin');
	await expect(page.locator('.report-sheet')).toContainText('Paracetamol');

	// Danish report with the app still in English.
	await page.getByRole('button', { name: 'Back' }).click();
	await expect(page.getByRole('radio', { name: /Like the paper form/ })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await makeReport(page);
	await expect(page.getByRole('heading', { name: 'Hovedpinedagbog — skemaform', level: 1 })).toBeVisible();
	await expect(page.getByText('Begyndt (nærmeste time)')).toBeVisible();
	await expect(page.getByText('Lavet med MyDaybook')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
	await page.getByRole('button', { name: 'Back' }).click();
	await page.getByRole('radio', { name: /Overskuelig tabel|Clean table/ }).click();
	await makeReport(page);
	await expect(page.getByText('Ingen hovedpine').first()).toBeVisible();
	await expect(page.getByText('Side 1 af 1')).toBeVisible();

	// A reload loses the choices (the name is never stored): back to the choices.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await expect(page).toHaveURL(/\/reports\/headache$/);
	await expect(page.getByRole('button', { name: 'Make report' })).toBeVisible();
});

test('a custom period works, and an empty diary still gives a report', async ({ page }) => {
	await signUpAndSignIn(page);
	await page.getByRole('link', { name: 'Trends', exact: true }).click();
	await openReports(page);
	await page.getByRole('button', { name: 'Custom from–to' }).click();
	await expect(page.locator('.custom input').first()).toBeVisible();
	await page.locator('.custom input').first().fill('2026-01-10');
	await page.locator('.custom input').last().fill('2026-01-01');
	await expect(page.getByRole('alert')).toContainText('must not be after');
	await expect(page.getByRole('button', { name: 'Make report' })).toBeDisabled();
	await page.locator('.custom input').first().fill('2026-01-01');
	await page.locator('.custom input').last().fill('2026-01-10');
	await makeReport(page);
	await expect(page.getByText('No headaches logged in this period.')).toBeVisible();
	await expect(page.getByText('Page 1 of 1')).toBeVisible();
	await expect(page.locator('table')).toHaveCount(0);
});
