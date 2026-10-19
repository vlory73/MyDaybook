import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Each test uses its own account.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const sheet = (page: Page) => page.getByRole('dialog');
const save = (page: Page) => sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
const live = (page: Page) => sheet(page).getByTestId('drink-total');
const entry = (page: Page, title: string) =>
	timeline(page)
		.getByRole('button')
		.filter({ has: page.getByText(title, { exact: true }) });

async function openDrink(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Drink', exact: true }).click();
}
const chip = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
// A size chip also carries its volume in its name ("Mug 30 cl").
const sizeChip = (page: Page, name: string) =>
	sheet(page).getByRole('button', { name: new RegExp(`^${name} [\\d.]+ cl$`) });

test('fluids: water with the defaults takes two taps and shows the day total', async ({ page }) => {
	await signUpAndSignIn(page);
	await openDrink(page);
	// Water and its usual size (a glass, 25 cl) are preselected.
	await expect(live(page)).toHaveText('Water · Glass 25 cl · × 1 = 25 cl');
	await expect(sheet(page).getByText('Only you can see this. Not even the server can.')).toBeVisible();
	await save(page);

	await expect(toast(page, 'Saved')).toBeVisible();
	const water = entry(page, 'Water');
	await expect(water).toBeVisible();
	await expect(water.getByText('Glass · 25 cl', { exact: true })).toBeVisible();
	await expect(page.locator('#main').getByText('Drinks today: 25 cl', { exact: true })).toBeVisible();
	// Records only: nothing reacts to the amount.
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('fluids: wine times two is 30 cl; each drink starts with its usual size', async ({ page }) => {
	await signUpAndSignIn(page);
	await openDrink(page);
	await chip(page, 'Coffee').click();
	await expect(live(page)).toHaveText('Coffee · Cup 20 cl · × 1 = 20 cl');
	await chip(page, 'Beer').click();
	await expect(live(page)).toHaveText('Beer · Bottle 50 cl · × 1 = 50 cl');
	await chip(page, 'Spirits').click();
	await expect(live(page)).toHaveText('Spirits · Shot 4 cl · × 1 = 4 cl');
	await chip(page, 'Wine').click();
	await expect(live(page)).toHaveText('Wine · Wine glass 15 cl · × 1 = 15 cl');

	const less = sheet(page).getByRole('button', { name: 'One fewer' });
	const more = sheet(page).getByRole('button', { name: 'One more' });
	await expect(less).toBeDisabled();
	await more.click();
	await expect(live(page)).toHaveText('Wine · Wine glass 15 cl · × 2 = 30 cl');
	await save(page);

	const wine = entry(page, 'Wine');
	await expect(wine.getByText('2 × Wine glass · 30 cl', { exact: true })).toBeVisible();
	await expect(page.locator('#main').getByText('Drinks today: 30 cl', { exact: true })).toBeVisible();
});

test('fluids: the count stops at 10; a typed amount replaces the size', async ({ page }) => {
	await signUpAndSignIn(page);
	await openDrink(page);
	const more = sheet(page).getByRole('button', { name: 'One more' });
	for (let i = 0; i < 12; i++) if (await more.isEnabled()) await more.click();
	await expect(more).toBeDisabled();
	await expect(live(page)).toHaveText('Water · Glass 25 cl · × 10 = 250 cl');

	await chip(page, 'Own amount').click();
	await expect(sheet(page).getByRole('button', { name: 'One more' })).toBeHidden();
	const amount = sheet(page).getByLabel('Amount in cl', { exact: true });
	const saveButton = sheet(page).getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeDisabled();
	for (const bad of ['0', '2.5', '501', 'lots']) {
		await amount.fill(bad);
		await expect(saveButton).toBeDisabled();
	}
	await amount.fill('12');
	await expect(live(page)).toHaveText('Water · 12 cl');
	await save(page);

	const water = entry(page, 'Water');
	await expect(water.getByText('12 cl', { exact: true })).toBeVisible();
	await expect(page.locator('#main').getByText('Drinks today: 12 cl', { exact: true })).toBeVisible();
});

test('fluids: Same again repeats the last drink with one tap', async ({ page }) => {
	await signUpAndSignIn(page);
	await openDrink(page);
	await expect(sheet(page).getByRole('button', { name: /^Same again/ })).toBeHidden();
	await chip(page, 'Wine').click();
	await sheet(page).getByRole('button', { name: 'One more' }).click();
	await save(page);
	await expect(entry(page, 'Wine')).toHaveCount(1);

	await openDrink(page);
	const again = sheet(page).getByRole('button', { name: /^Same again/ });
	await expect(again).toContainText('Wine · 2 × Wine glass · 30 cl');
	await again.click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(entry(page, 'Wine')).toHaveCount(2);
	await expect(page.locator('#main').getByText('Drinks today: 60 cl', { exact: true })).toBeVisible();
	// Undo takes the repeat away again.
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(entry(page, 'Wine')).toHaveCount(1);
});

test('fluids: Other saves your own drink for next time', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	await openDrink(page);
	const saveButton = sheet(page).getByRole('button', { name: 'Save', exact: true });
	await chip(page, 'Other').click();
	await expect(saveButton).toBeDisabled();
	await sheet(page).getByLabel('Name of the drink', { exact: true }).fill('Kombucha');
	await sizeChip(page, 'Mug').click();
	await expect(live(page)).toHaveText('Kombucha · Mug 30 cl · × 1 = 30 cl');
	await save(page);
	await expect(entry(page, 'Kombucha').getByText('Mug · 30 cl', { exact: true })).toBeVisible();

	await openDrink(page);
	await chip(page, 'Kombucha').click();
	// Its usual size is the one it was first logged with.
	await expect(live(page)).toHaveText('Kombucha · Mug 30 cl · × 1 = 30 cl');
	await save(page);
	await expect(entry(page, 'Kombucha')).toHaveCount(2);

	// The presets are one encrypted record: after a reload and unlock the drink is still there.
	await page.reload();
	await unlockWith(page, user.passphrase);
	await openDrink(page);
	await expect(chip(page, 'Kombucha')).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Close' }).click();
});

test('fluids: editing a size changes new entries only', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	await openDrink(page);
	await save(page);
	const old = entry(page, 'Water').getByText('Glass · 25 cl', { exact: true });
	await expect(old).toBeVisible();

	await openDrink(page);
	await sheet(page).getByRole('button', { name: 'Edit', exact: true }).click();
	const editor = page.getByRole('dialog', { name: 'Drinks and sizes' });
	await expect(editor).toBeVisible();
	await editor.getByLabel('Amount of Glass in cl').fill('20');
	await editor.getByLabel('Name of Glass').fill('Tall glass');
	await editor.getByLabel('Name of Water').fill('Tap water');
	// Hide a drink, add a size and an own drink, and move Tea to the top.
	await editor.getByRole('button', { name: 'Hide Beer' }).click();
	await editor.getByLabel('Add a size').fill('Pint');
	await editor.getByLabel('cl', { exact: true }).fill('56.8');
	await editor.getByRole('button', { name: 'Add' }).nth(1).click();
	await editor.getByLabel('Add a drink').fill('Cider');
	await editor.getByRole('button', { name: 'Add' }).nth(0).click();
	await editor.getByLabel('Usual size of new drink').selectOption({ label: 'Pint' });
	await editor.getByRole('button', { name: 'Move Tea up' }).click();
	await editor.getByRole('button', { name: 'Move Tea up' }).click();
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Drinks and sizes saved')).toBeVisible();

	await expect(chip(page, 'Beer')).toBeHidden();
	await expect(chip(page, 'Tap water')).toBeVisible();
	await expect(live(page)).toHaveText('Tap water · Tall glass 20 cl · × 1 = 20 cl');
	await chip(page, 'Cider').click();
	await expect(live(page)).toHaveText('Cider · Pint 56.8 cl · × 1 = 56.8 cl');
	await chip(page, 'Cider').click();
	await save(page);
	await expect(entry(page, 'Cider').getByText('Pint · 56.8 cl', { exact: true })).toBeVisible();
	// The first entry is exactly as it was logged.
	await expect(old).toBeVisible();
	await expect(entry(page, 'Water')).toHaveCount(1);
	await expect(page.locator('#main').getByText('Drinks today: 81.8 cl', { exact: true })).toBeVisible();

	// The presets sync as one record: still there after a reload, in the new order.
	await page.reload();
	await unlockWith(page, user.passphrase);
	await openDrink(page);
	const names = await sheet(page)
		.getByRole('group', { name: 'What did you drink?' })
		.getByRole('button')
		.allTextContents();
	expect(names.slice(0, 2)).toEqual(['Tea', 'Tap water']);
	expect(names).not.toContain('Beer');
	expect(names.at(-2)).toBe('Cider');
});

test('fluids: a preset without a name or with a bad amount cannot be saved', async ({ page }) => {
	await signUpAndSignIn(page);
	await openDrink(page);
	await sheet(page).getByRole('button', { name: 'Edit', exact: true }).click();
	const editor = page.getByRole('dialog', { name: 'Drinks and sizes' });
	const saveButton = editor.getByRole('button', { name: 'Save', exact: true });
	await expect(saveButton).toBeEnabled();
	await editor.getByLabel('Amount of Cup in cl').fill('lots');
	await expect(saveButton).toBeDisabled();
	await expect(editor.getByText(/Give every drink and size a name/)).toBeVisible();
	await editor.getByLabel('Amount of Cup in cl').fill('20');
	await editor.getByLabel('Name of Tea').fill('');
	await expect(saveButton).toBeDisabled();
	await editor.getByRole('button', { name: 'Cancel' }).click();
	await expect(editor).toBeHidden();
	await expect(chip(page, 'Tea')).toBeVisible();
});

test('fluids: edit an entry and delete it with undo; the day total follows', async ({ page }) => {
	await signUpAndSignIn(page);
	await openDrink(page);
	await chip(page, 'Juice').click();
	await sheet(page).getByLabel('Note', { exact: true }).fill('synthetic note');
	await save(page);
	const juice = entry(page, 'Juice');
	await expect(juice.getByText('Glass · 25 cl · synthetic note', { exact: true })).toBeVisible();

	await juice.click();
	await expect(live(page)).toHaveText('Juice · Glass 25 cl · × 1 = 25 cl');
	// Editing an entry does not offer "Same again".
	await expect(sheet(page).getByRole('button', { name: /^Same again/ })).toBeHidden();
	await sheet(page).getByRole('button', { name: 'One more' }).click();
	await sheet(page).getByRole('button', { name: 'One more' }).click();
	await save(page);
	await expect(juice.getByText('3 × Glass · 75 cl · synthetic note', { exact: true })).toBeVisible();
	await expect(page.locator('#main').getByText('Drinks today: 75 cl', { exact: true })).toBeVisible();

	await juice.click();
	await sheet(page).getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(toast(page, 'Entry deleted')).toBeVisible();
	await expect(entry(page, 'Juice')).toBeHidden();
	await expect(page.locator('#main').getByText(/Drinks today/)).toBeHidden();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(juice).toBeVisible();
	await expect(page.locator('#main').getByText('Drinks today: 75 cl', { exact: true })).toBeVisible();
});
