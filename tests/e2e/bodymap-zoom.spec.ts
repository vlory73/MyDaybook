import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn } from './helpers';

// Body map close-ups (head, hands, feet) and wider areas (whole belly, whole back), M4 branch 3. Synthetic data only.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Where do you feel it?' });
const figure = (page: Page) => sheet(page).locator('svg[role=group]');
const intensity = (page: Page, n: number) =>
	sheet(page)
		.getByRole('radiogroup', { name: /^Intensity/ })
		.getByRole('radio', { name: String(n), exact: true });
const saveButton = (page: Page, label: string | RegExp = /^Save/) =>
	sheet(page).getByRole('button', { name: label });
const button = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
const radio = (page: Page, name: string) => sheet(page).getByRole('radio', { name, exact: true });

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Pain', exact: true }).click();
	await expect(sheet(page)).toBeVisible();
}

async function tap(page: Page, region: string) {
	await figure(page).getByRole('button', { name: region, exact: true }).click();
}

test('head close-up: tap a temple, save, and see it on the timeline', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await expect(figure(page)).toHaveAccessibleName('Head, front view. Choose a part of the head.');
	await expect(button(page, 'Back to the body')).toBeVisible();
	// Like the front view, the head mirrors the person.
	await expect(sheet(page).getByText('Your right', { exact: true })).toBeVisible();
	await tap(page, 'Your left temple');
	await expect(sheet(page).getByRole('heading', { name: 'Your left temple' })).toBeVisible();
	await intensity(page, 4).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(timeline(page).getByText('Your left temple 4', { exact: true })).toBeVisible();
});

test('hands: switch hand and palm or back, tap a finger', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Hands, close-up').click();
	await expect(radio(page, 'Right')).toBeChecked();
	await expect(radio(page, 'Palm')).toBeChecked();
	await expect(figure(page).getByRole('button', { name: 'Your right palm', exact: true })).toBeVisible();
	await expect(figure(page).getByRole('button', { name: 'Back of your right hand' })).toHaveCount(0);
	await radio(page, 'Left').click();
	await expect(figure(page).getByRole('button', { name: 'Your left palm', exact: true })).toBeVisible();
	await expect(figure(page).getByRole('button', { name: 'Your right thumb' })).toHaveCount(0);
	await radio(page, 'Back').click();
	await expect(
		figure(page).getByRole('button', { name: 'Back of your left hand', exact: true })
	).toBeVisible();
	await expect(figure(page).getByRole('button', { name: 'Your left palm', exact: true })).toHaveCount(0);
	// Fingers are on both faces.
	await tap(page, 'Your left index finger');
	await expect(sheet(page).getByRole('heading', { name: 'Your left index finger' })).toBeVisible();
	await intensity(page, 5).click();
	await radio(page, 'Palm').click();
	await expect(figure(page).getByRole('button', { name: 'Your left index finger' })).toBeVisible();
	await saveButton(page, 'Save 1 point').click();
	await expect(timeline(page).getByText('Your left index finger 5', { exact: true })).toBeVisible();
});

test('feet: tap the sole, and Back returns to the body', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Feet, close-up').click();
	await expect(radio(page, 'Top')).toBeChecked();
	await expect(figure(page).getByRole('button', { name: 'Sole of your right foot' })).toHaveCount(0);
	await radio(page, 'Sole').click();
	await tap(page, 'Sole of your right foot');
	await intensity(page, 2).click();
	await button(page, 'Back to the body').click();
	await expect(figure(page).getByRole('button', { name: 'Your right knee', exact: true })).toBeVisible();
	await saveButton(page, 'Save 1 point').click();
	await expect(timeline(page).getByText('Sole of your right foot 2', { exact: true })).toBeVisible();
});

test('the whole hand on the main map is still a valid choice', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await tap(page, 'Your right hand');
	await intensity(page, 3).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(timeline(page).getByText('Your right hand 3', { exact: true })).toBeVisible();
});

test('a belly quarter can be widened to the whole belly', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await tap(page, 'Your left upper belly');
	const group = sheet(page).getByRole('group', { name: 'How wide an area' });
	for (const label of ['This quarter', 'Upper belly', 'Lower belly', 'Whole belly'])
		await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();
	await expect(group.getByRole('button', { name: 'This quarter' })).toHaveAttribute('aria-pressed', 'true');
	await group.getByRole('button', { name: 'Whole belly', exact: true }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Whole belly' })).toBeVisible();
	await expect(figure(page).locator('.wide.sel')).toHaveCount(1);
	// Back to the quarter, and on to the whole belly again.
	await group.getByRole('button', { name: 'This quarter' }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Your left upper belly' })).toBeVisible();
	await expect(figure(page).locator('.wide')).toHaveCount(0);
	await group.getByRole('button', { name: 'Whole belly', exact: true }).click();
	await intensity(page, 5).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(timeline(page).getByText('Whole belly 5', { exact: true })).toBeVisible();
});

test('a back part can be widened to the whole back', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await radio(page, 'Back').click();
	await tap(page, 'Lower back');
	const group = sheet(page).getByRole('group', { name: 'How wide an area' });
	await expect(group.getByRole('button')).toHaveCount(2);
	await group.getByRole('button', { name: 'Whole back', exact: true }).click();
	await intensity(page, 3).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(timeline(page).getByText('Whole back 3', { exact: true })).toBeVisible();
});

test('Find lists the close-up parts and the wider areas', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Find').click();
	await sheet(page).getByLabel('Find a body part').fill('thumb');
	await expect(sheet(page).getByRole('button', { name: 'Your left thumb', exact: true })).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Your right thumb', exact: true }).click();
	// The sheet opens that close-up with the point chosen.
	await expect(sheet(page).getByRole('heading', { name: 'Your right thumb' })).toBeVisible();
	await expect(radio(page, 'Right')).toBeChecked();
	await expect(figure(page).getByRole('button', { name: 'Your right thumb' })).toBeVisible();
	await intensity(page, 6).click();

	await button(page, 'Find').click();
	await sheet(page).getByLabel('Find a body part').fill('whole');
	await expect(sheet(page).getByRole('button', { name: 'Whole belly', exact: true })).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Whole back', exact: true }).click();
	// The wider area is drawn on the back view.
	await expect(radio(page, 'Back')).toBeChecked();
	await expect(sheet(page).getByRole('heading', { name: 'Whole back' })).toBeVisible();
	await intensity(page, 2).click();
	await saveButton(page, 'Save 2 points').click();
	await expect(timeline(page).getByText('Your right thumb 6 · Whole back 2', { exact: true })).toBeVisible();
});

test('a close-up can be used with the keyboard alone', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Feet, close-up').focus();
	await page.keyboard.press('Enter');
	await expect(button(page, 'Back to the body')).toBeVisible();
	await figure(page).getByRole('button', { name: 'Big toe of your right foot', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(sheet(page).getByRole('heading', { name: 'Big toe of your right foot' })).toBeVisible();
	await expect(intensity(page, 0)).toBeFocused();
	for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
	await expect(intensity(page, 3)).toBeChecked();
	await saveButton(page, 'Save 1 point').focus();
	await page.keyboard.press('Enter');
	await expect(timeline(page).getByText('Big toe of your right foot 3', { exact: true })).toBeVisible();
});

test('the close-up and wider-area names are in Danish', async ({ page }) => {
	await signUpAndSignIn(page, '/me');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await page.getByRole('link', { name: 'I dag' }).click();
	await page.getByRole('button', { name: 'Registrér noget' }).click();
	await page.getByRole('button', { name: 'Smerter', exact: true }).click();
	const dlg = page.getByRole('dialog', { name: 'Hvor mærker du det?' });
	await dlg.getByRole('button', { name: 'Hænder, tæt på', exact: true }).click();
	await dlg
		.locator('svg[role=group]')
		.getByRole('button', { name: 'Din højre tommelfinger', exact: true })
		.click();
	await expect(dlg.getByRole('heading', { name: 'Din højre tommelfinger' })).toBeVisible();
	await dlg.getByRole('button', { name: 'Tilbage til kroppen' }).click();
	await dlg.locator('svg[role=group]').getByRole('button', { name: 'Din venstre øvre mave' }).click();
	await dlg
		.getByRole('group', { name: 'Hvor stort et område' })
		.getByRole('button', { name: 'Hele maven', exact: true })
		.click();
	await expect(dlg.getByRole('heading', { name: 'Hele maven' })).toBeVisible();
});
