import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { seedRecords, signUpApiAccount, unlockWith } from './helpers';
import { at } from './trends-data';
import { addDays, todayKey } from '../../src/lib/records/time';

// Synthetic data only (#90): opening an existing entry must show its own date and time, so saving an edit
// does not move it to "now". The service worker is blocked like in the other specs that reload (WebKit lessons).
test.use({ serviceWorkers: 'block' });

const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog');
const WHEN = `${addDays(todayKey(), -1)}T08:15`;

/** Selects yesterday on the week strip (the previous week when today is the first day shown). */
async function goToYesterday(page: Page) {
	const days = page.getByRole('group', { name: 'Choose a day' }).locator('button[aria-pressed]');
	const marks = await Promise.all((await days.all()).map((b) => b.getAttribute('aria-current')));
	const idx = marks.indexOf('date');
	if (idx > 0) await days.nth(idx - 1).click();
	else {
		await page.getByRole('button', { name: 'Previous week' }).click();
		await days.last().click();
	}
}

async function save(page: Page, label: string | RegExp = 'Save') {
	await sheet(page)
		.getByRole('button', { name: label, exact: typeof label === 'string' })
		.click();
	await expect(sheet(page)).toBeHidden();
}

test('editing an old entry keeps its own date and time', async ({ page }) => {
	const account = await signUpApiAccount(page.request);
	await seedRecords(page.request, account, [
		{ v: 1, type: 'feeling', at: at(1, 8, 15), mood: 3, energy: 3, stress: 2, symptoms: [] },
		{
			v: 1,
			type: 'food',
			at: at(1, 8, 15),
			meal: 'breakfast',
			text: 'Synthetic porridge',
			tags: [],
			exposures: []
		},
		{ v: 1, type: 'bowel', at: at(1, 8, 15), bristol: 4, flags: [] },
		{
			v: 1,
			type: 'pain',
			at: at(1, 8, 15),
			points: [
				{ region: 'knee', side: 'right', space: '2d-front-v1', u: 0.5, v: 0.5, intensity: 6, qualities: [] }
			]
		}
	]);
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await goToYesterday(page);
	const time = () => sheet(page).getByLabel('Time of the entry');

	// Feeling
	const feeling = timeline(page).getByText(/Mood 3 · Energy 3 · Stress 2/);
	await expect(feeling).toBeVisible({ timeout: 15_000 });
	await feeling.click();
	await expect(time()).toHaveValue(WHEN);
	await sheet(page).getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: '4/5' }).click();
	await save(page);
	await expect(timeline(page).getByText(/Mood 3 · Energy 4 · Stress 2/)).toBeVisible();

	// Meal
	await timeline(page).getByText('Synthetic porridge').click();
	await expect(time()).toHaveValue(WHEN);
	await sheet(page).getByLabel('What did you have?').fill('Synthetic porridge with berries');
	await save(page);
	await expect(timeline(page).getByText('Synthetic porridge with berries')).toBeVisible();

	// Bowel movement
	await timeline(page).getByText('Type 4, Smooth', { exact: true }).click();
	await expect(time()).toHaveValue(WHEN);
	await sheet(page)
		.getByRole('radio', { name: /^Type 5/ })
		.click();
	await save(page);

	// Pain
	await timeline(page).getByText('Your right knee 6', { exact: true }).click();
	await expect(time()).toHaveValue(WHEN);
	await sheet(page)
		.getByRole('radiogroup', { name: /^Intensity/ })
		.getByRole('radio', { name: '7' })
		.first()
		.click();
	await save(page, /^Save/);
	await expect(timeline(page).getByText('Your right knee 7', { exact: true })).toBeVisible();

	// After a reload everything is still on yesterday at 08:15 (and nothing moved to today).
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await goToYesterday(page);
	await expect(timeline(page).getByText('Your right knee 7', { exact: true })).toBeVisible({
		timeout: 15_000
	});
	for (const text of [/Mood 3 · Energy 4/, 'Synthetic porridge with berries', 'Your right knee 7']) {
		await timeline(page).getByText(text).click();
		await expect(time()).toHaveValue(WHEN);
		await sheet(page).getByRole('button', { name: 'Close', exact: true }).click();
		await expect(sheet(page)).toBeHidden();
	}
});
