import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DATA_DIR, signUpAndSignIn, unlockWith } from './helpers';

// Body map entries (M4, branch 2). Synthetic data only. Each test uses its own account.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Where do you feel it?' });
const figure = (page: Page) => sheet(page).locator('svg[role=group]');
const intensity = (page: Page, n: number) =>
	sheet(page)
		.getByRole('radiogroup', { name: /^Intensity/ })
		.getByRole('radio', { name: String(n), exact: true });
const quality = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
const saveButton = (page: Page, label: string | RegExp = /^Save/) =>
	sheet(page).getByRole('button', { name: label });

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Body map', exact: true }).click();
	await expect(sheet(page)).toBeVisible();
}

async function tap(page: Page, region: string) {
	await figure(page).getByRole('button', { name: region, exact: true }).click();
}

/** Knee 6 (aching), then the back view: calf 3. Saves "Your right knee 6 · Your right calf 3". */
async function logKneeAndCalf(page: Page) {
	await openSheet(page);
	await tap(page, 'Your right knee');
	await intensity(page, 6).click();
	await quality(page, 'Aching').click();
	await sheet(page).getByRole('radio', { name: 'Back', exact: true }).click();
	await tap(page, 'Your right calf');
	await intensity(page, 3).click();
	await saveButton(page, 'Save 2 points').click();
	await expect(toast(page, 'Saved')).toBeVisible();
}

test('logs two points with intensities and qualities, on the front and the back', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await expect(saveButton(page, 'Save')).toBeDisabled();
	await expect(sheet(page).getByText('Tap the body, or use Find, to place a point.')).toBeVisible();
	await expect(sheet(page).getByText('Your right', { exact: true })).toBeVisible();
	await expect(sheet(page).getByText('Your left', { exact: true })).toBeVisible();

	// Front: the right knee. The person's right is drawn on the left of the screen.
	await tap(page, 'Your right knee');
	await expect(sheet(page).getByRole('heading', { name: 'Your right knee' })).toBeVisible();
	await expect(sheet(page).getByText('Point 1 of 1')).toBeVisible();
	await expect(
		sheet(page)
			.getByRole('radiogroup', { name: /^Intensity/ })
			.getByRole('radio')
	).toHaveCount(11);
	// A point needs an intensity before it can be saved; 0 is a choice like any other.
	await expect(saveButton(page, 'Save 1 point')).toBeDisabled();
	await intensity(page, 0).click();
	await expect(saveButton(page, 'Save 1 point')).toBeEnabled();
	await intensity(page, 6).click();
	await expect(intensity(page, 6)).toBeChecked();
	await expect(intensity(page, 0)).not.toBeChecked();
	await quality(page, 'Aching').click();
	await expect(quality(page, 'Aching')).toHaveAttribute('aria-pressed', 'true');

	// Back: the right calf, with numb and itchy, and at most three qualities.
	await sheet(page).getByRole('radio', { name: 'Back', exact: true }).click();
	await expect(figure(page).getByRole('button', { name: 'Your right knee' })).toBeVisible();
	await tap(page, 'Your right calf');
	await expect(sheet(page).getByRole('heading', { name: 'Your right calf' })).toBeVisible();
	await expect(sheet(page).getByText('Point 2 of 2')).toBeVisible();
	await intensity(page, 3).click();
	await quality(page, 'Numb').click();
	await quality(page, 'Itchy').click();
	await quality(page, 'Sharp').click();
	for (const name of ['Dull', 'Burning', 'Throbbing', 'Aching', 'Tingling']) {
		await expect(quality(page, name)).toBeDisabled();
	}
	await quality(page, 'Sharp').click();
	await expect(quality(page, 'Dull')).toBeEnabled();
	await sheet(page).getByLabel('Note for this point').fill('synthetic calf note');

	// The panel is pinned at the bottom of the phone and the chosen region stays above it.
	const box = await figure(page).getByRole('button', { name: 'Your right calf' }).boundingBox();
	const panel = await sheet(page).getByRole('heading', { name: 'Your right calf' }).boundingBox();
	expect(box!.y + box!.height).toBeLessThan(panel!.y);

	await expect(saveButton(page, 'Save 2 points')).toBeEnabled();
	await saveButton(page, 'Save 2 points').click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(sheet(page)).toBeHidden();
	await expect(
		timeline(page).getByText('Your right knee 6 · Your right calf 3', { exact: true })
	).toBeVisible();
	await expect(timeline(page).getByText('Body map', { exact: true })).toBeVisible();
	// Records only: nothing reacts to the numbers.
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('edit a body map entry, then delete it with undo', async ({ page }) => {
	await signUpAndSignIn(page);
	await logKneeAndCalf(page);
	const line = timeline(page).getByText('Your right knee 6 · Your right calf 3', { exact: true });
	await line.click();
	// The entry reopens with its points and their values.
	await expect(sheet(page).getByText('Point 1 of 2')).toBeVisible();
	await expect(sheet(page).getByRole('heading', { name: 'Your right knee' })).toBeVisible();
	await expect(intensity(page, 6)).toBeChecked();
	await expect(quality(page, 'Aching')).toHaveAttribute('aria-pressed', 'true');
	await intensity(page, 8).click();
	// Next point: the calf (the view follows it).
	await sheet(page).getByRole('button', { name: 'Next point' }).click();
	await expect(sheet(page).getByRole('heading', { name: 'Your right calf' })).toBeVisible();
	await expect(intensity(page, 3)).toBeChecked();
	// Remove the calf; the entry has one point left.
	await sheet(page).getByRole('button', { name: 'Remove point' }).click();
	await expect(saveButton(page, 'Save 1 point')).toBeVisible();
	await saveButton(page, 'Save 1 point').click();
	const edited = timeline(page).getByText('Your right knee 8', { exact: true });
	await expect(edited).toBeVisible();

	await edited.click();
	await sheet(page).getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(toast(page, 'Entry deleted')).toBeVisible();
	await expect(edited).toBeHidden();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(toast(page, 'Entry restored')).toBeVisible();
	await expect(edited).toBeVisible();
});

test('Find adds a point without tapping the outline', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await sheet(page).getByRole('button', { name: 'Find', exact: true }).click();
	await expect(figure(page)).toHaveCount(0);
	await sheet(page).getByLabel('Find a body part').fill('knee');
	await expect(sheet(page).getByRole('button', { name: 'Your right knee', exact: true })).toBeVisible();
	await expect(sheet(page).getByRole('button', { name: 'Your left shoulder' })).toHaveCount(0);
	await sheet(page).getByRole('button', { name: 'Your left knee', exact: true }).click();
	// Back on the map with the point placed and chosen.
	await expect(figure(page)).toBeVisible();
	await expect(sheet(page).getByRole('heading', { name: 'Your left knee' })).toBeVisible();
	await intensity(page, 4).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(timeline(page).getByText('Your left knee 4', { exact: true })).toBeVisible();

	// A region only drawn on the back is found too, and the map switches to the back view.
	await openSheet(page);
	await sheet(page).getByRole('button', { name: 'Find', exact: true }).click();
	await sheet(page).getByLabel('Find a body part').fill('lower back');
	await sheet(page).getByRole('button', { name: 'Lower back', exact: true }).first().click();
	await expect(sheet(page).getByRole('radio', { name: 'Back', exact: true })).toBeChecked();
	await expect(sheet(page).getByRole('heading', { name: 'Lower back' })).toBeVisible();
});

test('a body map entry can be made with the keyboard alone', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await figure(page).getByRole('button', { name: 'Your left shoulder', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(sheet(page).getByRole('heading', { name: 'Your left shoulder' })).toBeVisible();
	// Focus moves to the intensity row; the arrow keys choose, nothing is chosen until then.
	await expect(intensity(page, 0)).toBeFocused();
	await expect(intensity(page, 0)).not.toBeChecked();
	for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
	await expect(intensity(page, 4)).toBeChecked();
	await expect(intensity(page, 4)).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(quality(page, 'Sharp')).toBeFocused();
	await page.keyboard.press('Space');
	await expect(quality(page, 'Sharp')).toHaveAttribute('aria-pressed', 'true');
	// Choosing the same region again picks its point (it does not add a second one).
	await figure(page).getByRole('button', { name: 'Your left shoulder', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(sheet(page).getByText('Point 1 of 1')).toBeVisible();
	await saveButton(page, 'Save 1 point').focus();
	await page.keyboard.press('Enter');
	await expect(timeline(page).getByText('Your left shoulder 4', { exact: true })).toBeVisible();
});

test('"+ Point" places a second point in the same region', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await tap(page, 'Your right knee');
	await intensity(page, 2).click();
	await sheet(page).getByRole('button', { name: 'Add a point' }).click();
	await expect(sheet(page).getByText('Tap the body, or use Find, to place the next point.')).toBeVisible();
	await tap(page, 'Your right knee');
	await expect(sheet(page).getByText('Point 2 of 2')).toBeVisible();
	await intensity(page, 7).click();
	await saveButton(page, 'Save 2 points').click();
	await expect(
		timeline(page).getByText('Your right knee 2 · Your right knee 7', { exact: true })
	).toBeVisible();
});

test('Same as last time copies the points; the person adjusts and saves', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	// No earlier entry: nothing to repeat.
	await expect(sheet(page).getByRole('button', { name: /Same as last time/ })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await logKneeAndCalf(page);

	await openSheet(page);
	await expect(saveButton(page, 'Save')).toBeDisabled();
	const same = sheet(page).getByRole('button', { name: /Same as last time/ });
	await expect(same).toContainText('Your right knee 6 · Your right calf 3');
	await same.click();
	await expect(same).toHaveCount(0);
	await expect(sheet(page).getByText('Point 1 of 2')).toBeVisible();
	await expect(sheet(page).getByRole('heading', { name: 'Your right knee' })).toBeVisible();
	await expect(intensity(page, 6)).toBeChecked();
	await expect(quality(page, 'Aching')).toHaveAttribute('aria-pressed', 'true');
	await intensity(page, 2).click();
	await saveButton(page, 'Save 2 points').click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(
		timeline(page).getByText('Your right knee 2 · Your right calf 3', { exact: true })
	).toBeVisible();
	// The first entry is untouched.
	await expect(
		timeline(page).getByText('Your right knee 6 · Your right calf 3', { exact: true })
	).toBeVisible();
});

test('"Still there?" appears for a recent entry, and Dismiss hides it until a newer one exists', async ({
	page
}) => {
	const user = await signUpAndSignIn(page);
	const card = page.getByRole('region', { name: 'Still there?' });
	await expect(card).toHaveCount(0);

	await openSheet(page);
	await tap(page, 'Your right knee');
	await intensity(page, 6).click();
	await tap(page, 'Your left shoulder');
	await intensity(page, 8).click();
	await tap(page, 'Head');
	await intensity(page, 2).click();
	await saveButton(page, 'Save 3 points').click();
	await expect(toast(page, 'Saved')).toBeVisible();

	// The highest point, and how many others there are. Neutral: no alert, no advice.
	await expect(card).toContainText('Your left shoulder · last logged today: 8 · +2 more');
	await expect(page.getByRole('alert')).toHaveCount(0);

	// Log today: the sheet opens with the last entry's points applied.
	await card.getByRole('button', { name: 'Log today' }).click();
	await expect(sheet(page).getByText('Point 1 of 3')).toBeVisible();
	await expect(intensity(page, 6)).toBeChecked();
	await expect(saveButton(page, 'Save 3 points')).toBeEnabled();
	await page.keyboard.press('Escape');
	await expect(sheet(page)).toBeHidden();

	await card.getByRole('button', { name: 'Dismiss' }).click();
	await expect(card).toHaveCount(0);
	// Remembered on this device: still hidden after a reload and unlock.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(timeline(page).getByText(/Your right knee 6/)).toBeVisible({ timeout: 15_000 });
	await expect(card).toHaveCount(0);
	// Only the entry id is stored, no health data.
	const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
	expect(stored).not.toMatch(/knee|shoulder|head/i);

	// A newer entry brings the card back, with its own highest point.
	await openSheet(page);
	await tap(page, 'Your right knee');
	await intensity(page, 3).click();
	await saveButton(page, 'Save 1 point').click();
	await expect(card).toContainText('Your right knee · last logged today: 3');
	await expect(card).not.toContainText('more');
});

test('a body map entry survives reload and unlock, and the server only sees ciphertext', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	const note = `synthetic body note ${randomBytes(5).toString('hex')}`;
	await openSheet(page);
	await tap(page, 'Your right knee');
	await intensity(page, 5).click();
	await quality(page, 'Throbbing').click();
	await sheet(page).getByLabel('Note for this point').fill(note);
	await saveButton(page, 'Save 1 point').click();
	const line = timeline(page).getByText('Your right knee 5', { exact: true });
	await expect(line).toBeVisible();

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(line).toBeVisible({ timeout: 15_000 });
	await line.click();
	await expect(intensity(page, 5)).toBeChecked();
	await expect(quality(page, 'Throbbing')).toHaveAttribute('aria-pressed', 'true');
	await expect(sheet(page).getByLabel('Note for this point')).toHaveValue(note);

	const files = ['app.db', 'app.db-wal'].map((f) => resolve(DATA_DIR, f)).filter((f) => existsSync(f));
	expect(files.length).toBeGreaterThan(0);
	const needles = [note, 'throbbing', 'knee', 'region', 'intensity', Buffer.from(note).toString('base64')];
	for (const file of files) {
		const bytes = readFileSync(file);
		for (const needle of needles) {
			expect(bytes.includes(Buffer.from(needle, 'utf8')), `${file} contains "${needle}"`).toBe(false);
		}
	}
});

test('the body map entry screen and the card are in Danish', async ({ page }) => {
	await signUpAndSignIn(page, '/me');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await page.getByRole('link', { name: 'I dag' }).click();
	await page.getByRole('button', { name: 'Registrér noget' }).click();
	await page.getByRole('button', { name: 'Kropskort', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Hvor mærker du det?' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('Din højre', { exact: true })).toBeVisible();
	await dialog.locator('svg[role=group]').getByRole('button', { name: 'Dit højre knæ', exact: true }).click();
	await expect(dialog.getByRole('heading', { name: 'Dit højre knæ' })).toBeVisible();
	await expect(dialog.getByText('Punkt 1 af 1')).toBeVisible();
	await expect(dialog.getByRole('radiogroup', { name: /^Intensitet/ })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Følelsesløs', exact: true })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Kløende', exact: true })).toBeVisible();
	await dialog
		.getByRole('radiogroup', { name: /^Intensitet/ })
		.getByRole('radio', { name: '6', exact: true })
		.click();
	await dialog.getByRole('button', { name: 'Gem 1 punkt' }).click();
	await expect(timeline(page).getByText('Dit højre knæ 6', { exact: true })).toBeVisible();
	const card = page.getByRole('region', { name: 'Stadig der?' });
	await expect(card).toContainText('Dit højre knæ · senest noteret i dag: 6');
	await expect(card.getByRole('button', { name: 'Notér i dag' })).toBeVisible();
	await expect(card.getByRole('button', { name: 'Afvis' })).toBeVisible();
});
