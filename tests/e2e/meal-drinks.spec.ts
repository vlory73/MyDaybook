import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn } from './helpers';

// Synthetic data only. Drinks added from the meal sheet (#119).
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Meal' });
const drinkSheet = (page: Page) => page.getByRole('dialog', { name: 'Drink' });
const entry = (page: Page, title: string) =>
	timeline(page)
		.getByRole('button')
		.filter({ has: page.getByText(title, { exact: true }) });

async function openMeal(page: Page, text: string) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal', exact: true }).click();
	await page.getByLabel('What did you have?').fill(text);
}

/** Opens the drink form on top of the meal, picks a drink and a "how many", and adds it. */
async function addDrink(page: Page, drink: string, more = 0) {
	await sheet(page).getByRole('button', { name: 'Add a drink', exact: true }).click();
	const d = drinkSheet(page);
	await expect(d).toBeVisible();
	await d.getByRole('button', { name: drink, exact: true }).click();
	for (let i = 0; i < more; i++) await d.getByRole('button', { name: 'One more' }).click();
	await d.getByRole('button', { name: 'Add to meal', exact: true }).click();
	await expect(d).toBeHidden();
}

test('a meal with two drinks saves three entries at one time; Undo removes all three', async ({ page }) => {
	await signUpAndSignIn(page);
	await openMeal(page, 'Oatmeal with berries');
	await addDrink(page, 'Coffee');
	await addDrink(page, 'Water', 1);
	const pills = sheet(page).getByRole('group', { name: 'Drinks with this meal' });
	await expect(pills.getByText('Coffee · 20 cl', { exact: true })).toBeVisible();
	await expect(pills.getByText('2 × Water · 25 cl', { exact: true })).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();

	await expect(page.getByRole('status').getByText('Meal and 2 drinks saved')).toBeVisible();
	await expect(timeline(page).getByText('Oatmeal with berries')).toBeVisible({ timeout: 15_000 });
	await expect(entry(page, 'Coffee')).toBeVisible();
	await expect(entry(page, 'Water')).toBeVisible();
	await expect(entry(page, 'Water').getByText('2 × Glass · 50 cl', { exact: true })).toBeVisible();
	// 20 cl + 50 cl, in the day total.
	await expect(page.locator('#main').getByText('Drinks today: 70 cl', { exact: true })).toBeVisible();
	// The meal and its drinks share one time.
	const times = await timeline(page).locator('time').allTextContents();
	expect(new Set(times).size).toBe(1);
	expect(times).toHaveLength(3);

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(timeline(page).getByText('Oatmeal with berries')).toHaveCount(0);
	await expect(timeline(page).locator('time')).toHaveCount(0);
	await expect(page.locator('#main').getByText(/Drinks today/)).toHaveCount(0);
});

test('a drink can be removed or changed before saving; Back adds nothing', async ({ page }) => {
	await signUpAndSignIn(page);
	await openMeal(page, 'Toast');
	await addDrink(page, 'Coffee');
	await addDrink(page, 'Tea');
	const pills = sheet(page).getByRole('group', { name: 'Drinks with this meal' });
	await pills.getByRole('button', { name: /^Remove Coffee/ }).click();
	await expect(pills.getByText(/^Coffee/)).toHaveCount(0);

	// Closing the form without "Add to meal" adds nothing.
	await sheet(page).getByRole('button', { name: 'Add a drink', exact: true }).click();
	await drinkSheet(page).getByRole('button', { name: 'Milk', exact: true }).click();
	await drinkSheet(page).getByRole('button', { name: 'Close' }).click();
	await expect(drinkSheet(page)).toBeHidden();
	await expect(pills.getByText(/^Milk/)).toHaveCount(0);

	// Tapping the pill reopens the form with that drink.
	await pills.getByRole('button', { name: /^Change Tea/ }).click();
	await expect(drinkSheet(page).getByRole('button', { name: 'Tea', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await drinkSheet(page).getByRole('button', { name: 'One more' }).click();
	await drinkSheet(page).getByRole('button', { name: 'Add to meal', exact: true }).click();
	await expect(pills.getByText(/^2 × Tea/)).toBeVisible();

	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(page.getByRole('status').getByText('Meal and 1 drink saved')).toBeVisible();
	await expect(entry(page, 'Tea')).toBeVisible({ timeout: 15_000 });
	await expect(entry(page, 'Coffee')).toHaveCount(0);
});

test('a meal without drinks saves as before; editing a saved meal shows no drinks section', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openMeal(page, 'Plain rice');
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
	await expect(timeline(page).getByText('Plain rice')).toBeVisible({ timeout: 15_000 });

	await timeline(page).getByText('Plain rice').click();
	await expect(sheet(page).getByLabel('What did you have?')).toHaveValue('Plain rice');
	await expect(sheet(page).getByText('Drinks with this meal')).toHaveCount(0);
	await expect(sheet(page).getByRole('button', { name: 'Add a drink' })).toHaveCount(0);
});
