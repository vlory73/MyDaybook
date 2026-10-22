import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpApiAccount, signUpAndSignIn, seedRecords, unlockWith } from './helpers';
import { mealsFor, smallSet, watchRecord, watchRecord2 } from './trends-data';

// Synthetic data only. Each test uses its own account.
const trendsTab = (page: Page) => page.getByRole('link', { name: 'Trends', exact: true });
const card = (page: Page, title: string) =>
	page.locator('section.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('a fresh account sees one friendly empty state and no charts', async ({ page }) => {
	await signUpAndSignIn(page);
	await trendsTab(page).click();
	await expect(page.getByRole('heading', { name: 'Trends', level: 1 })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'No charts yet' })).toBeVisible();
	await expect(page.locator('svg.chart')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'After meals with…' })).toHaveCount(0);
});

test('cards appear only for the data there is, and the period picker works', async ({ page }) => {
	const account = await signUpApiAccount(page.request);
	const [gluten] = await seedRecords(page.request, account, [watchRecord, watchRecord2]);
	await seedRecords(page.request, account, [...smallSet(), ...mealsFor(gluten!)]);
	await page.goto('/trends');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);

	await expect(card(page, 'Feeling')).toBeVisible({ timeout: 15_000 });
	for (const title of ['Sleep', 'Weight', 'Fluids', 'Medicine', 'Bowel', 'Nausea and heartburn', 'Pain']) {
		await expect(card(page, title)).toBeVisible();
	}
	// No data of these kinds: no card.
	await expect(page.getByRole('heading', { name: 'Resting heart rate' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'No charts yet' })).toHaveCount(0);
	await expect(card(page, 'Pain')).toContainText('2 entries on 2 days');
	await expect(card(page, 'Medicine')).toContainText('1 taken, 1 taken late, 0 skipped');
	// Charts stay inside the phone width.
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);

	// After meals: watch-list chips, a window and the meal list with what followed.
	const meals = card(page, 'After meals with…');
	await expect(meals.getByRole('button', { name: 'Gluten' })).toHaveAttribute('aria-pressed', 'true');
	await expect(meals.getByText('Pasta salad')).toBeVisible();
	await expect(meals.getByText('Rice and vegetables')).toHaveCount(0); // marked "No"
	await expect(meals.getByText('Nausea 3/5')).toBeVisible();
	await expect(meals.getByText('Nothing logged').first()).toBeVisible();
	await expect(meals.getByText('It does not draw conclusions.', { exact: false })).toBeVisible();
	await meals.getByRole('radio', { name: '6 h' }).click();
	await expect(meals.getByText('Nausea 3/5')).toBeVisible(); // logged 3 h after the meal, inside 6 h
});

test('custom period validates its dates', async ({ page }) => {
	const account = await signUpApiAccount(page.request);
	await seedRecords(page.request, account, smallSet());
	await page.goto('/trends');
	await unlockWith(page, account.passphrase);
	await expect(card(page, 'Feeling')).toBeVisible({ timeout: 15_000 });

	await page.getByRole('radio', { name: '7 days' }).click();
	await expect(page.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
	await page.getByRole('radio', { name: 'Custom' }).click();
	await page.getByLabel('From', { exact: true }).fill('2020-01-10');
	await page.getByLabel('To', { exact: true }).fill('2020-01-01');
	await expect(page.getByRole('alert')).toHaveText('The start date must not be after the end date.');
	await page.getByLabel('To', { exact: true }).fill('2020-01-12');
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'No charts yet' })).toBeVisible();
	await page.getByLabel('From', { exact: true }).fill('2018-01-01');
	await page.getByLabel('To', { exact: true }).fill('2020-01-12');
	await expect(page.getByRole('alert')).toHaveText('Choose at most 366 days.');
});
