import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DATA_DIR, signUpAndSignIn, unlockWith } from './helpers';

// Headache details on the Pain entry (M5, branch 1). Synthetic data only. Each test uses its own account.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Where do you feel it?' });
const figure = (page: Page) => sheet(page).locator('svg[role=group]');
const intensity = (page: Page, n: number) =>
	sheet(page)
		.getByRole('radiogroup', { name: /^Intensity/ })
		.getByRole('radio', { name: String(n), exact: true });
const button = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
const group = (page: Page, name: string) => sheet(page).getByRole('group', { name });
const details = (page: Page) => button(page, 'Headache details');

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Pain', exact: true }).click();
	await expect(sheet(page)).toBeVisible();
}

/** A pain point on the left temple (head close-up) with intensity `n`. */
async function templePoint(page: Page, n: number) {
	await button(page, 'Head, close-up').click();
	await figure(page).getByRole('button', { name: 'Your left temple', exact: true }).click();
	await intensity(page, n).click();
}

const nextDay = (day: string) => {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
};

test('a head point shows the section; every field is saved and shown again', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await expect(details(page)).toBeHidden();
	await templePoint(page, 6);
	await expect(details(page)).toHaveAttribute('aria-expanded', 'true');
	await button(page, 'Constant').click();
	await expect(button(page, 'Constant')).toHaveAttribute('aria-pressed', 'true');

	await sheet(page).getByLabel('Hour Started').selectOption('22');
	const stopDay = sheet(page).getByLabel('Day Stopped');
	await stopDay.fill(nextDay(await stopDay.inputValue()));
	await sheet(page).getByLabel('Hour Stopped').selectOption('02');
	await button(page, 'Vision').click();
	await button(page, 'Speech').click();
	await group(page, 'Worse with physical activity, e.g. stairs?')
		.getByRole('button', { name: 'Yes' })
		.click();
	await group(page, 'Sensitive to light?').getByRole('button', { name: 'Yes' }).click();
	await group(page, 'Sensitive to sound?').getByRole('button', { name: 'No' }).click();
	await sheet(page).getByLabel('Possible trigger').fill('skipped lunch');
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Your left temple 6', { exact: true })).toBeVisible();

	await timeline(page).getByText('Your left temple 6', { exact: true }).click();
	await expect(details(page)).toHaveAttribute('aria-expanded', 'true');
	await expect(button(page, 'Constant')).toHaveAttribute('aria-pressed', 'true');
	await expect(sheet(page).getByLabel('Hour Started')).toHaveValue('22');
	await expect(sheet(page).getByLabel('Hour Stopped')).toHaveValue('02');
	await expect(sheet(page).getByLabel('Day Stopped')).toHaveValue(
		nextDay(await sheet(page).getByLabel('Day Started').inputValue())
	);
	await expect(button(page, 'Vision')).toHaveAttribute('aria-pressed', 'true');
	await expect(button(page, 'Speech')).toHaveAttribute('aria-pressed', 'true');
	await expect(button(page, 'Feeling (e.g. tingling, numbness)')).toHaveAttribute('aria-pressed', 'false');
	const yes = (name: string, label: string) => group(page, name).getByRole('button', { name: label });
	await expect(yes('Worse with physical activity, e.g. stairs?', 'Yes')).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(yes('Sensitive to light?', 'Yes')).toHaveAttribute('aria-pressed', 'true');
	await expect(yes('Sensitive to sound?', 'No')).toHaveAttribute('aria-pressed', 'true');
	await expect(sheet(page).getByLabel('Possible trigger')).toHaveValue('skipped lunch');
});

test('an empty Stopped means still going (with a hint); an entry with no details opens collapsed', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await templePoint(page, 3);
	await sheet(page).getByLabel('Hour Started').selectOption('07');
	// There is no "Still going" chip any more: an empty Stopped says it.
	await expect(button(page, 'Still going')).toHaveCount(0);
	await expect(
		sheet(page).getByText("Leave empty while it's still going. Today will ask you later.")
	).toBeVisible();
	await expect(sheet(page).getByLabel('Hour Stopped')).toBeEnabled();
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await timeline(page).getByText('Your left temple 3', { exact: true }).click();
	await expect(sheet(page).getByLabel('Hour Stopped')).toHaveValue('');
	await sheet(page).getByLabel('Hour Stopped').selectOption('09');
	await expect(sheet(page).getByText(/^Leave empty while/)).toBeHidden();
	await sheet(page).getByLabel('Hour Stopped').selectOption('');
	await expect(sheet(page).getByText(/^Leave empty while/)).toBeVisible();

	// A second entry without any answer is saved without details and reopens collapsed.
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await openSheet(page);
	await templePoint(page, 2);
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await timeline(page).getByText('Your left temple 2', { exact: true }).click();
	await expect(details(page)).toHaveAttribute('aria-expanded', 'false');
	await expect(sheet(page).getByLabel('Hour Started')).toBeHidden();
});

test('"This is a headache" shows the section without a point on the head', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	// A neck-only point in the head close-up: the tick is there, the section is not.
	await button(page, 'Head, close-up').click();
	await sheet(page).getByRole('radio', { name: 'Back', exact: true }).click();
	await figure(page).getByRole('button', { name: 'Right side of your neck', exact: true }).click();
	await intensity(page, 4).click();
	await expect(details(page)).toBeHidden();
	await sheet(page).getByLabel('This is a headache').check();
	await expect(details(page)).toBeVisible();
	await sheet(page).getByLabel('Hour Started').selectOption('09');
	// Back on the body the tick is gone but what was entered stays.
	await button(page, 'Back to the body').click();
	await expect(sheet(page).getByLabel('This is a headache')).toBeHidden();
	await expect(details(page)).toBeVisible();
	await expect(sheet(page).getByLabel('Hour Started')).toHaveValue('09');
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await timeline(page).getByText('Right side of your neck 4', { exact: true }).click();
	await expect(details(page)).toBeVisible();
	await expect(sheet(page).getByLabel('Hour Started')).toHaveValue('09');
});

test('"Log nausea" returns to the Pain sheet with the draft, which then shows the nausea', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await templePoint(page, 5);
	await button(page, 'Throbbing').click();
	await sheet(page).getByLabel('Hour Started').selectOption('10');
	await sheet(page).getByLabel('Possible trigger').fill('bright screen');
	await expect(sheet(page).getByText('Nausea: none')).toBeVisible();
	await button(page, 'Log nausea').click();

	const gut = page.getByRole('dialog', { name: 'Nausea / heartburn' });
	await expect(gut).toBeVisible();
	await gut.getByRole('button', { name: 'Nausea', exact: true }).click();
	await gut
		.getByRole('radiogroup', { name: 'Nausea, how strong' })
		.getByRole('radio', { name: '3/5' })
		.click();
	await gut.getByRole('button', { name: 'Save', exact: true }).click();

	await expect(sheet(page)).toBeVisible();
	await expect(sheet(page).getByText('Nausea: moderate')).toBeVisible();
	await expect(sheet(page).getByRole('heading', { name: 'Your left temple' })).toBeVisible();
	await expect(intensity(page, 5)).toBeChecked();
	await expect(button(page, 'Throbbing')).toHaveAttribute('aria-pressed', 'true');
	await expect(sheet(page).getByLabel('Hour Started')).toHaveValue('10');
	await expect(sheet(page).getByLabel('Possible trigger')).toHaveValue('bright screen');

	// Closing the nausea sheet without saving also comes back.
	await button(page, 'Log nausea').click();
	await expect(gut).toBeVisible();
	await gut.getByRole('button', { name: 'Close' }).click();
	await expect(sheet(page)).toBeVisible();
	await expect(sheet(page).getByLabel('Possible trigger')).toHaveValue('bright screen');
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Your left temple 5', { exact: true })).toBeVisible();
	await expect(timeline(page).getByText('Nausea 3/5', { exact: true })).toBeVisible();
});

test('the zone labels sit under the intensity scale', async ({ page }) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await figure(page).getByRole('button', { name: 'Your right knee', exact: true }).click();
	for (const zone of ['mild', 'moderate', 'severe'])
		await expect(sheet(page).getByText(zone, { exact: true })).toBeVisible();
});

test('headache details survive reload and unlock, and the server only sees ciphertext', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	const trigger = `synthetic trigger ${randomBytes(5).toString('hex')}`;
	await openSheet(page);
	await templePoint(page, 7);
	await sheet(page).getByLabel('Hour Started').selectOption('20');
	await button(page, 'Vision').click();
	await sheet(page).getByLabel('Possible trigger').fill(trigger);
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	const line = timeline(page).getByText('Your left temple 7', { exact: true });
	await expect(line).toBeVisible();

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(line).toBeVisible({ timeout: 15_000 });
	await line.click();
	await expect(sheet(page).getByLabel('Hour Started')).toHaveValue('20');
	await expect(button(page, 'Vision')).toHaveAttribute('aria-pressed', 'true');
	await expect(sheet(page).getByLabel('Possible trigger')).toHaveValue(trigger);

	const files = ['app.db', 'app.db-wal'].map((f) => resolve(DATA_DIR, f)).filter((f) => existsSync(f));
	expect(files.length).toBeGreaterThan(0);
	const needles = [
		trigger,
		'headache',
		'worseWithActivity',
		'stillGoing',
		'lastSeen',
		Buffer.from(trigger).toString('base64')
	];
	for (const file of files) {
		const bytes = readFileSync(file);
		for (const needle of needles) {
			expect(bytes.includes(Buffer.from(needle, 'utf8')), `${file} contains "${needle}"`).toBe(false);
		}
	}
});

test('the headache section and zone labels are in Danish', async ({ page }) => {
	await signUpAndSignIn(page, '/me');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await page.getByRole('link', { name: 'I dag' }).click();
	await page.getByRole('button', { name: 'Registrér noget' }).click();
	await page.getByRole('button', { name: 'Smerter', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Hvor mærker du det?' });
	await dialog.getByRole('button', { name: 'Hoved, tæt på' }).click();
	await expect(dialog.getByLabel('Det er hovedpine')).toBeVisible();
	await dialog
		.locator('svg[role=group]')
		.getByRole('button', { name: 'Din venstre tinding', exact: true })
		.click();
	await dialog
		.getByRole('radiogroup', { name: /^Intensitet/ })
		.getByRole('radio', { name: '4', exact: true })
		.click();
	for (const zone of ['let', 'middel', 'svær'])
		await expect(dialog.getByText(zone, { exact: true })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Konstant', exact: true })).toBeVisible();
	await expect(dialog.getByLabel('Det er hovedpine')).toBeHidden();
	await expect(dialog.getByRole('button', { name: 'Detaljer om hovedpinen' })).toBeVisible();
	await expect(dialog.getByText('Lige før den startede, mærkede du ændringer i:')).toBeVisible();
	await expect(dialog.getByRole('group', { name: 'Lysfølsom?' })).toBeVisible();
	await expect(dialog.getByRole('group', { name: 'Lydfølsom?' })).toBeVisible();
	await expect(dialog.getByText('Kvalme: ingen')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Registrér kvalme' })).toBeVisible();
});

test('an earlier stop hour defaults to the next day, and a stop before the start cannot be saved', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await templePoint(page, 4);
	await sheet(page).getByLabel('Hour Started').selectOption('22');
	await sheet(page).getByLabel('Hour Stopped').selectOption('02');
	const start = await sheet(page).getByLabel('Day Started').inputValue();
	await expect(sheet(page).getByLabel('Day Stopped')).toHaveValue(nextDay(start));
	await expect(button(page, 'Save 1 point')).toBeEnabled();
	await sheet(page).getByLabel('Day Stopped').fill(start);
	await expect(sheet(page).getByRole('alert')).toHaveText('Stopped is before it started.');
	await expect(button(page, 'Save 1 point')).toBeDisabled();
});

test('every head zone and wider head area shows the section, and it goes with the point', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await sheet(page).getByRole('radio', { name: 'Back', exact: true }).click();
	await figure(page).getByRole('button', { name: 'Top of your head', exact: true }).click();
	await expect(details(page)).toBeVisible();
	await intensity(page, 4).click();
	// A wider area is still a head point.
	await group(page, 'How wide an area').getByRole('button', { name: 'Whole head', exact: true }).click();
	await expect(details(page)).toBeVisible();
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(timeline(page).getByText('Whole head 4', { exact: true })).toBeVisible();
});

test('a point on the neck alone does not open the headache section (owner decision on #50)', async ({
	page
}) => {
	await signUpAndSignIn(page);
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await sheet(page).getByRole('radio', { name: 'Back', exact: true }).click();
	await figure(page).getByRole('button', { name: 'Right side of your neck', exact: true }).click();
	await expect(details(page)).toBeHidden();
	await expect(sheet(page).getByRole('checkbox', { name: 'This is a headache' })).not.toBeChecked();
	// A wider area that includes the neck still counts as the head.
	await group(page, 'How wide an area').getByRole('button', { name: 'This side', exact: true }).click();
	await expect(details(page)).toBeVisible();
});
