import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn } from './helpers';

// Synthetic data only. Each test uses its own account.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const names = (page: Page) => page.locator('ul.list li .name').allTextContents();

async function openMeal(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal', exact: true }).click();
}

test('set up a watch list in Me: suggestions, your own item, reorder, remove with undo', async ({ page }) => {
	await signUpAndSignIn(page, '/me');
	await expect(page.getByRole('heading', { name: 'What I watch in food' })).toBeVisible();
	await expect(page.getByText('Nothing on your list yet.')).toBeVisible();

	await page.getByRole('button', { name: 'Gluten', exact: true }).click();
	await page.getByRole('button', { name: 'Lactose', exact: true }).click();
	await page.getByLabel('Something else you watch').fill('Oat drink');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect.poll(() => names(page)).toEqual(['Gluten', 'Lactose', 'Oat drink']);
	// Added items leave the suggestions.
	await expect(page.getByRole('button', { name: 'Gluten', exact: true })).toBeHidden();

	await page.getByRole('button', { name: 'Move Oat drink up' }).click();
	await expect.poll(() => names(page)).toEqual(['Gluten', 'Oat drink', 'Lactose']);

	await page.getByRole('button', { name: 'Remove Oat drink' }).click();
	await expect(toast(page, 'Oat drink removed from your list')).toBeVisible();
	await expect.poll(() => names(page)).toEqual(['Gluten', 'Lactose']);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => names(page)).toEqual(['Gluten', 'Oat drink', 'Lactose']);

	// Not sure on a free-text item reads "Maybe ...".
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await openMeal(page);
	await page.getByLabel('What did you have?').fill('Porridge with oat drink');
	await page.getByRole('radiogroup', { name: 'Oat drink' }).getByRole('radio', { name: 'Not sure' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(timeline(page).getByText('Maybe oat drink')).toBeVisible();
});

test('meals with exposures, saved meals, Again? and edit; delete with undo', async ({ page }) => {
	await signUpAndSignIn(page);

	// With no watch list the sheet points to Me.
	await openMeal(page);
	await expect(page.getByText('You are not watching anything in food yet.')).toBeVisible();
	await page.getByRole('button', { name: 'Set up your watch list' }).click();
	await expect(page.getByRole('heading', { name: 'What I watch in food' })).toBeVisible();
	await page.getByRole('button', { name: 'Gluten', exact: true }).click();
	await page.getByRole('button', { name: 'Lactose', exact: true }).click();
	await expect.poll(() => names(page)).toEqual(['Gluten', 'Lactose']);
	await page.getByRole('link', { name: 'Today', exact: true }).click();

	// Log a meal with exposures and keep it as a meal eaten often.
	await openMeal(page);
	await page.getByRole('button', { name: 'Breakfast', exact: true }).click();
	await page.getByLabel('What did you have?').fill('Oatmeal with berries and yoghurt');
	await page
		.getByRole('radiogroup', { name: 'Gluten' })
		.getByRole('radio', { name: 'No', exact: true })
		.click();
	await page.getByRole('radiogroup', { name: 'Lactose' }).getByRole('radio', { name: 'Yes' }).click();
	await page.getByRole('button', { name: 'Home', exact: true }).click();
	await page.getByRole('switch', { name: 'Save as a meal I eat often' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Saved')).toBeVisible();
	const entries = timeline(page).getByText('Oatmeal with berries and yoghurt');
	await expect(entries).toHaveCount(1);
	await expect(timeline(page).getByText('Breakfast', { exact: true })).toBeVisible();
	await expect(timeline(page).getByText('Gluten-free')).toBeVisible();
	await expect(timeline(page).getByText('Contains lactose')).toBeVisible();

	// Again?: the saved meal repeats in one tap.
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Oatmeal with berries and yoghurt saved meal' }).click();
	await expect(entries).toHaveCount(2);
	await expect(timeline(page).getByText('Contains lactose')).toHaveCount(2);

	// A saved meal fills the sheet in one tap.
	await openMeal(page);
	await page.getByRole('dialog').getByRole('button', { name: 'Oatmeal with berries and yoghurt' }).click();
	await expect(page.getByLabel('What did you have?')).toHaveValue('Oatmeal with berries and yoghurt');
	await expect(
		page.getByRole('radiogroup', { name: 'Lactose' }).getByRole('radio', { name: 'Yes' })
	).toBeChecked();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(entries).toHaveCount(3);

	// Edit one: new description, gluten now Yes.
	await entries.first().click();
	await page.getByLabel('What did you have?').fill('Rye bread and cheese');
	await page.getByRole('radiogroup', { name: 'Gluten' }).getByRole('radio', { name: 'Yes' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(timeline(page).getByText('Rye bread and cheese')).toBeVisible();
	await expect(timeline(page).getByText('Contains gluten')).toBeVisible();
	await expect(entries).toHaveCount(2);

	// Delete with undo.
	await timeline(page).getByText('Rye bread and cheese').click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(toast(page, 'Entry deleted')).toBeVisible();
	await expect(timeline(page).getByText('Rye bread and cheese')).toBeHidden();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(timeline(page).getByText('Rye bread and cheese')).toBeVisible();
});
