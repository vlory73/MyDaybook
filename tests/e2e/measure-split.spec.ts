import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn } from './helpers';

// Synthetic data only. Weight is weight only; Measure has the built-in Blood pressure and Pulse (issue #74).
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog');

async function openTile(page: Page, name: string) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name, exact: true }).click();
}

async function save(page: Page) {
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
}

test('Weight is weight only; Measure lists Blood pressure and Pulse, and both log to the timeline and Trends', async ({
	page
}) => {
	await signUpAndSignIn(page);

	// The Weight tile has no type list and no "New type".
	await openTile(page, 'Weight');
	await expect(sheet(page).getByRole('heading', { name: 'Weight' })).toBeVisible();
	await expect(sheet(page).getByRole('group', { name: 'Type of measurement' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'New type' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Close' }).click();

	// The Measure tile lists Blood pressure (selected first) and Pulse, but not Weight.
	await openTile(page, 'Measure');
	const types = sheet(page).getByRole('group', { name: 'Type of measurement' });
	await expect(types.getByRole('button', { name: 'Blood pressure', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(types.getByRole('button', { name: 'Pulse', exact: true })).toBeVisible();
	await expect(types.getByRole('button', { name: 'Weight' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'New type' })).toBeVisible();

	await page.getByLabel('Upper', { exact: true }).fill('128');
	await page.getByLabel('Lower', { exact: true }).fill('82');
	await save(page);
	await expect(timeline(page).getByText('Blood pressure 128/82 mmHg')).toBeVisible();

	// Pulse: one value in bpm.
	await openTile(page, 'Measure');
	await sheet(page).getByRole('button', { name: 'Pulse', exact: true }).click();
	await page.getByLabel('Value', { exact: true }).fill('64');
	await expect(sheet(page).getByText('bpm', { exact: true })).toBeVisible();
	await save(page);
	await expect(timeline(page).getByText('Pulse 64 bpm')).toBeVisible();

	// Editing opens the Measure sheet on that type.
	await timeline(page).getByText('Blood pressure 128/82 mmHg').click();
	await expect(page.getByLabel('Upper', { exact: true })).toHaveValue('128');
	await page.getByLabel('Lower', { exact: true }).fill('80');
	await save(page);
	await expect(timeline(page).getByText('Blood pressure 128/80 mmHg')).toBeVisible();

	// Trends: one Blood pressure card (two lines) and a Pulse card.
	await page.getByRole('link', { name: 'Trends', exact: true }).click();
	const bp = page.locator('section.card').filter({
		has: page.getByRole('heading', { name: 'Blood pressure', exact: true })
	});
	await expect(bp).toBeVisible();
	await expect(bp.locator('svg.chart')).toHaveCount(1);
	await expect(bp.getByText('Upper', { exact: true })).toBeVisible();
	await expect(bp.getByText('Lower', { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Pulse', exact: true })).toBeVisible();
});

test('an old weight entry still opens the weight sheet', async ({ page }) => {
	await signUpAndSignIn(page);
	await openTile(page, 'Weight');
	await page.getByLabel('Value', { exact: true }).fill('72.4');
	await save(page);
	await timeline(page).getByText('Weight 72.4 kg').click();
	await expect(sheet(page).getByRole('heading', { name: 'Weight' })).toBeVisible();
	await expect(sheet(page).getByRole('group', { name: 'Type of measurement' })).toHaveCount(0);
	await expect(page.getByLabel('Value', { exact: true })).toHaveValue('72.4');
});
