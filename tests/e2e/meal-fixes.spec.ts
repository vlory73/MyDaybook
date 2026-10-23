import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn } from './helpers';

// Synthetic data only. Meal places Work and School (#61); the watch list opens on top of the meal (#62).
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });

test('Work and School are meal places; old places stay', async ({ page }) => {
	await signUpAndSignIn(page);
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal', exact: true }).click();
	const where = page.getByRole('group', { name: 'Where' });
	await expect(where.getByRole('button')).toHaveText(['Home', 'Eating out', 'Takeaway', 'Work', 'School']);
	await page.getByLabel('What did you have?').fill('Packed lunch');
	await where.getByRole('button', { name: 'School', exact: true }).click();
	await expect(where.getByRole('button', { name: 'School', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(timeline(page).getByText('Packed lunch')).toBeVisible({ timeout: 15_000 });
	// Edit: the place is remembered.
	await timeline(page).getByText('Packed lunch').click();
	await expect(
		page.getByRole('group', { name: 'Where' }).getByRole('button', { name: 'School', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
});

test('the watch list opens on top of the meal and keeps the draft', async ({ page }) => {
	await signUpAndSignIn(page);
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal', exact: true }).click();
	await page.getByLabel('What did you have?').fill('Toast with butter');
	await page.getByRole('group', { name: 'Where' }).getByRole('button', { name: 'Work', exact: true }).click();

	await page.getByRole('button', { name: 'Set up your watch list' }).click();
	const watch = page.getByRole('dialog', { name: 'What I watch in food' });
	await expect(watch).toBeVisible();
	await watch.getByRole('button', { name: 'Gluten', exact: true }).click();
	await expect(watch.locator('ul.list li .name')).toHaveText(['Gluten']);
	await watch.getByRole('button', { name: 'Close' }).click();
	await expect(watch).toBeHidden();

	// Same meal, nothing lost, and the new item is ready to tick.
	await expect(page.getByLabel('What did you have?')).toHaveValue('Toast with butter');
	await expect(
		page.getByRole('group', { name: 'Where' }).getByRole('button', { name: 'Work', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('radiogroup', { name: 'Gluten' }).getByRole('radio', { name: 'Yes' }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(timeline(page).getByText('Toast with butter')).toBeVisible({ timeout: 15_000 });
	await expect(timeline(page).getByText('Contains gluten')).toBeVisible();
});
