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
	await expect(sheet(page)).toBeHidden();
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
	await expect(sheet(page)).toBeHidden();
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
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Sole of your right foot 2', { exact: true })).toBeVisible();
});

test('foot close-up: five toes, top of foot and ankles on the top, sole parts on the sole', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Feet, close-up').click();
	const part = (name: string) => figure(page).getByRole('button', { name, exact: true });
	for (const toe of ['big', 'second', 'third', 'fourth', 'little'])
		await expect(part(`Your right ${toe} toe`)).toHaveCount(1);
	await expect(part('Inner ankle of your right foot')).toBeVisible();
	await expect(part('Outer ankle of your right foot')).toBeVisible();
	await expect(part('Top of your right foot')).toHaveCount(2); // ball and midfoot are one region
	await expect(part('Sole of your right foot')).toHaveCount(0);
	await part('Top of your right foot').last().click();
	await expect(sheet(page).getByRole('heading', { name: 'Top of your right foot' })).toBeVisible();
	await intensity(page, 2).click();
	// The same toes are on the sole, with the sole's own parts.
	await radio(page, 'Sole').click();
	for (const name of [
		'Your right second toe',
		'Sole of your right foot',
		'Arch of your right foot',
		'Your right heel'
	])
		await expect(part(name)).toHaveCount(1);
	await expect(part('Inner ankle of your right foot')).toHaveCount(0);
	await part('Your right fourth toe').click();
	await intensity(page, 5).click();
	await saveButton(page, 'Save 2 points').click();
	await expect(sheet(page)).toBeHidden();
	await expect(
		timeline(page).getByText('Top of your right foot 2 · Your right fourth toe 5', { exact: true })
	).toBeVisible();
});

test('the close-up buttons show how many points of the entry are in them', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await expect(sheet(page).getByRole('button', { name: 'Hands, close-up', exact: true })).toBeVisible();
	await button(page, 'Hands, close-up').click();
	await tap(page, 'Your right thumb');
	await intensity(page, 3).click();
	await tap(page, 'Your right palm');
	await intensity(page, 4).click();
	await button(page, 'Back to the body').click();
	const hands = sheet(page).getByRole('button', { name: 'Hands, close-up, 2 points', exact: true });
	await expect(hands).toBeVisible();
	await expect(hands).toContainText('2');
	// Hidden at zero.
	await expect(sheet(page).getByRole('button', { name: 'Head, close-up', exact: true })).toBeVisible();
	await button(page, 'Feet, close-up').click();
	await tap(page, 'Your right little toe');
	await intensity(page, 1).click();
	await button(page, 'Back to the body').click();
	await expect(
		sheet(page).getByRole('button', { name: 'Feet, close-up, 1 point', exact: true })
	).toBeVisible();
	await expect(sheet(page).getByRole('button', { name: 'Head, close-up', exact: true })).not.toContainText(
		/\d/
	);
});

test('the whole hand on the main map is still a valid choice', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await tap(page, 'Your right hand');
	await intensity(page, 3).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Your right hand 3', { exact: true })).toBeVisible();
});

test('a belly quarter can be widened to the whole belly', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await tap(page, 'Your left upper belly');
	const group = sheet(page).getByRole('group', { name: 'How wide an area' });
	for (const label of ['This quarter', 'Upper belly', 'Whole belly'])
		await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();
	await expect(group.getByRole('button', { name: 'This quarter' })).toHaveAttribute('aria-pressed', 'true');
	// Only the half that contains the quarter.
	await expect(group.getByRole('button', { name: 'Lower belly', exact: true })).toHaveCount(0);
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
	await expect(sheet(page)).toBeHidden();
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
	await expect(sheet(page)).toBeHidden();
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
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Your right thumb 6 · Whole back 2', { exact: true })).toBeVisible();
});

test('a close-up can be used with the keyboard alone', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Feet, close-up').focus();
	await page.keyboard.press('Enter');
	await expect(button(page, 'Back to the body')).toBeVisible();
	await figure(page).getByRole('button', { name: 'Your right big toe', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(sheet(page).getByRole('heading', { name: 'Your right big toe' })).toBeVisible();
	await expect(intensity(page, 0)).toBeFocused();
	for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
	await expect(intensity(page, 3)).toBeChecked();
	await saveButton(page, 'Save 1 point').focus();
	await page.keyboard.press('Enter');
	await expect(timeline(page).getByText('Your right big toe 3', { exact: true })).toBeVisible();
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

// Head zones (feature/head-zones): front and back drawings, behind the eye, wider areas, Find, keyboard, Danish.
const wide = (page: Page) => sheet(page).getByRole('group', { name: 'How wide an area' });

test('head zones: tap the right temple, widen to "This side", save, see it on the timeline', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await expect(radio(page, 'Front')).toBeChecked();
	await tap(page, 'Your right temple');
	await expect(sheet(page).getByRole('heading', { name: 'Your right temple' })).toBeVisible();
	for (const label of ['This spot', 'Front of this side', 'This side', 'Whole head', 'Band around the head'])
		await expect(wide(page).getByRole('button', { name: label, exact: true })).toBeVisible();
	await expect(wide(page).getByRole('button', { name: 'This spot' })).toHaveAttribute('aria-pressed', 'true');
	await wide(page).getByRole('button', { name: 'Front of this side', exact: true }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Front of the right side' })).toBeVisible();
	// Forehead, temple, around the eye and behind the eye of that side are highlighted.
	await expect(figure(page).locator('.wide.sel')).toHaveCount(4);
	await wide(page).getByRole('button', { name: 'This side', exact: true }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Right side of your head' })).toBeVisible();
	await expect(figure(page).locator('.wide.sel')).toHaveCount(6);
	// "This spot" puts the original tap back.
	await wide(page).getByRole('button', { name: 'This spot', exact: true }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Your right temple' })).toBeVisible();
	await expect(figure(page).locator('.wide')).toHaveCount(0);
	await wide(page).getByRole('button', { name: 'This side', exact: true }).click();
	await intensity(page, 5).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Right side of your head 5', { exact: true })).toBeVisible();
});

test('head zones: the back view has the top, back and neck, and a band around the head', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await radio(page, 'Back').click();
	await expect(figure(page)).toHaveAccessibleName('Head, back view. Choose a part of the head.');
	// The back view does not mirror the person.
	await expect(sheet(page).getByText('Your left', { exact: true })).toBeVisible();
	for (const name of [
		'Top of your head',
		'Back of the right side of your head',
		'Back of the left side of your head',
		'Right side of your neck',
		'Left side of your neck'
	])
		await expect(figure(page).getByRole('button', { name, exact: true })).toBeVisible();
	await tap(page, 'Back of the right side of your head');
	for (const label of ['This spot', 'Back of this side', 'This side', 'Whole head', 'Band around the head'])
		await expect(wide(page).getByRole('button', { name: label, exact: true })).toBeVisible();
	await wide(page).getByRole('button', { name: 'Band around the head', exact: true }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Band around the head' })).toBeVisible();
	await expect(figure(page).locator('.wide.sel')).toHaveCount(1);
	await intensity(page, 3).click();
	// The top of the head is one zone with no sides.
	await tap(page, 'Top of your head');
	await expect(wide(page).getByRole('button')).toHaveCount(3);
	await intensity(page, 2).click();
	// The badge on the Head button counts points on both drawings.
	await button(page, 'Back to the body').click();
	await expect(button(page, 'Head, close-up, 2 points')).toBeVisible();
	await saveButton(page, 'Save 2 points').click();
	await expect(sheet(page)).toBeHidden();
	await expect(
		timeline(page).getByText('Band around the head 3 · Top of your head 2', { exact: true })
	).toBeVisible();
});

test('head zones: behind the eye is its own zone inside the eye area', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await expect(
		figure(page).getByRole('button', { name: 'Around your right eye', exact: true })
	).toBeVisible();
	await tap(page, 'Behind your right eye');
	await expect(sheet(page).getByRole('heading', { name: 'Behind your right eye' })).toBeVisible();
	await intensity(page, 6).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Behind your right eye 6', { exact: true })).toBeVisible();
	// No separate nose, mouth, chin or ear zones.
	await timeline(page).getByText('Behind your right eye 6', { exact: true }).click();
	for (const gone of ['Nose', 'Mouth', 'Chin', 'Your right ear'])
		await expect(figure(page).getByRole('button', { name: gone })).toHaveCount(0);
});

test('head zones: Find lists the zones and opens the right drawing', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Find').click();
	await sheet(page).getByLabel('Find a body part').fill('temple');
	await expect(sheet(page).getByRole('button', { name: 'Your left temple', exact: true })).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Your right temple', exact: true }).click();
	await expect(radio(page, 'Front')).toBeChecked();
	await expect(sheet(page).getByRole('heading', { name: 'Your right temple' })).toBeVisible();
	await intensity(page, 4).click();

	await button(page, 'Find').click();
	await sheet(page).getByLabel('Find a body part').fill('top of your');
	await sheet(page).getByRole('button', { name: 'Top of your head', exact: true }).click();
	await expect(radio(page, 'Back')).toBeChecked();
	await intensity(page, 1).click();

	await button(page, 'Find').click();
	await sheet(page).getByLabel('Find a body part').fill('band');
	await sheet(page).getByRole('button', { name: 'Band around the head', exact: true }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Band around the head' })).toBeVisible();
	await expect(figure(page).locator('.wide.sel')).toHaveCount(1);
});

test('head zones: keyboard alone, with the Front and Back choice', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').focus();
	await page.keyboard.press('Enter');
	await figure(page).getByRole('button', { name: 'Left side of your forehead', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(sheet(page).getByRole('heading', { name: 'Left side of your forehead' })).toBeVisible();
	await expect(intensity(page, 0)).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(intensity(page, 2)).toBeChecked();
	// Switch to the back with the keyboard (arrow keys on the radio group).
	await radio(page, 'Front').focus();
	await page.keyboard.press('ArrowRight');
	await expect(radio(page, 'Back')).toBeChecked();
	await figure(page).getByRole('button', { name: 'Right side of your neck', exact: true }).focus();
	await page.keyboard.press('Space');
	await expect(sheet(page).getByRole('heading', { name: 'Right side of your neck' })).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(sheet(page).getByRole('heading', { name: 'Right side of your neck' })).toBeVisible();
});

test('head zones: the names are in Danish', async ({ page }) => {
	await signUpAndSignIn(page, '/me');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await page.getByRole('link', { name: 'I dag' }).click();
	await page.getByRole('button', { name: 'Registrér noget' }).click();
	await page.getByRole('button', { name: 'Smerter', exact: true }).click();
	const dlg = page.getByRole('dialog', { name: 'Hvor mærker du det?' });
	await dlg.getByRole('button', { name: 'Hoved, tæt på', exact: true }).click();
	const fig = dlg.locator('svg[role=group]');
	await expect(fig).toHaveAccessibleName('Hovedet set forfra. Vælg en del af hovedet.');
	await fig.getByRole('button', { name: 'Bag dit højre øje', exact: true }).click();
	await expect(dlg.getByRole('heading', { name: 'Bag dit højre øje' })).toBeVisible();
	const group = dlg.getByRole('group', { name: 'Hvor stort et område' });
	for (const label of [
		'Dette sted',
		'Forreste del af denne side',
		'Denne side',
		'Hele hovedet',
		'Bånd rundt om hovedet'
	])
		await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();
	await group.getByRole('button', { name: 'Denne side', exact: true }).click();
	await expect(dlg.getByRole('heading', { name: 'Højre side af hovedet' })).toBeVisible();
	await group.getByRole('button', { name: 'Bånd rundt om hovedet', exact: true }).click();
	await expect(dlg.getByRole('heading', { name: 'Bånd rundt om hovedet' })).toBeVisible();
});

test('head zones: a band chosen on the back is drawn on the front too, and the chips follow the view', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await radio(page, 'Back').click();
	await tap(page, 'Back of the right side of your head');
	await wide(page).getByRole('button', { name: 'Band around the head', exact: true }).click();
	await expect(figure(page).locator('.wide.sel')).toHaveCount(1);
	await radio(page, 'Front').click();
	// The band is drawn on the front view as well, selected, with the point's dot on it.
	await expect(figure(page).locator('.wide.sel[data-region="head_band"]')).toHaveCount(1);
	await expect(figure(page).locator('.dot')).toHaveCount(1);
	await expect(sheet(page).getByRole('heading', { name: 'Band around the head' })).toBeVisible();
	await expect(wide(page).getByRole('button', { name: 'Front of this side', exact: true })).toBeVisible();
	await expect(wide(page).getByRole('button', { name: 'Back of this side' })).toHaveCount(0);
	// Choosing the front of the side moves the point to the front drawing; "This spot" goes back to the back one.
	await wide(page).getByRole('button', { name: 'Front of this side', exact: true }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Front of the right side' })).toBeVisible();
	await expect(figure(page).locator('.wide.sel')).toHaveCount(4);
	await wide(page).getByRole('button', { name: 'This spot', exact: true }).click();
	await expect(radio(page, 'Back')).toBeChecked();
	await expect(
		sheet(page).getByRole('heading', { name: 'Back of the right side of your head' })
	).toBeVisible();
	await intensity(page, 2).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(
		timeline(page).getByText('Back of the right side of your head 2', { exact: true })
	).toBeVisible();
});
