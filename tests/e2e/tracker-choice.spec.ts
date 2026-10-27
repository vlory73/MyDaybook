import type { Page, Request } from '@playwright/test';
import { test, expect } from './fixtures';
import {
	createInvite,
	newPassphrase,
	newUsername,
	seedRecords,
	signUpAndSignIn,
	signUpApiAccount,
	unlockWith
} from './helpers';
import { addMedWithReminder, endpointOf, stubPush } from './push-stub';
import { at, heatSet, smallSet } from './trends-data';

// Synthetic data only. The service worker is blocked like in the other specs that reload (WebKit lessons).
test.use({ serviceWorkers: 'block' });

const NAMES = [
	'Meal',
	'Drink',
	'Feeling',
	'Sleep',
	'Pain',
	'Medicine',
	'Bowel',
	'Nausea / heartburn',
	'Weight',
	'Measure',
	'Note'
];
const sw = (page: Page, name: string) => page.getByRole('switch', { name, exact: true });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const tile = (page: Page, name: string) =>
	page.getByRole('dialog').getByRole('button', { name, exact: true });

/** An account made through the API, optionally with records, opened on `path` and unlocked. */
async function open(page: Page, path: string, payloads: object[] = []) {
	const account = await signUpApiAccount(page.request);
	if (payloads.length > 0) await seedRecords(page.request, account, payloads);
	await page.goto(path);
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	return account;
}

test('Me: switching off Bowel and Medicine hides them, but old entries stay', async ({ page }) => {
	await open(page, '/me', [{ v: 1, type: 'bowel', at: at(0, 0, 5), bristol: 4, flags: [] }]);
	await expect(page.getByRole('heading', { name: 'What you track' })).toBeVisible();
	for (const name of NAMES) await expect(sw(page, name)).toBeChecked();
	await expect(nav(page).getByRole('link', { name: 'Meds' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Reminders on this device' })).toBeVisible();

	await sw(page, 'Bowel').click();
	await sw(page, 'Medicine').click();
	await expect(sw(page, 'Bowel')).not.toBeChecked();
	await expect(sw(page, 'Medicine')).not.toBeChecked();
	await expect(page.getByText('The Meds tab and reminders are hidden too.')).toBeVisible();
	await expect(nav(page).getByRole('link', { name: 'Meds' })).toBeHidden();
	await expect(page.getByRole('heading', { name: 'Reminders on this device' })).toBeHidden();

	// The quick-log sheet has nine tiles, no Bowel or Medicine.
	await page.getByRole('button', { name: 'Log something' }).click();
	await expect(tile(page, 'Meal')).toBeVisible();
	await expect(tile(page, 'Bowel')).toBeHidden();
	await expect(tile(page, 'Medicine')).toBeHidden();
	await expect(page.getByRole('dialog').locator('.tile')).toHaveCount(9);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();

	// The earlier bowel entry is still on the timeline and still opens.
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	const entry = page.getByRole('button', { name: /Bowel movement/ });
	await expect(entry).toBeVisible({ timeout: 15_000 });
	await entry.click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

test('Me: switching off Meal hides the food watch list card', async ({ page }) => {
	await open(page, '/me');
	await expect(page.getByRole('heading', { name: 'What I watch in food' })).toBeVisible();
	await sw(page, 'Meal').click();
	await expect(sw(page, 'Meal')).not.toBeChecked();
	await expect(page.getByRole('heading', { name: 'What I watch in food' })).toBeHidden();
});

test('the choice is saved with the account and survives a reload', async ({ page }) => {
	const account = await open(page, '/me');
	await sw(page, 'Drink').click();
	await expect(sw(page, 'Drink')).not.toBeChecked();
	// Wait for the save to reach the server before reloading.
	await expect(page.getByTestId('sync-pill')).toBeHidden();

	await page.goto('/me');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await expect(sw(page, 'Drink')).not.toBeChecked({ timeout: 15_000 });
	await expect(sw(page, 'Meal')).toBeChecked();
});

test('the last tracker that is on cannot be switched off', async ({ page }) => {
	await open(page, '/me');
	for (const name of NAMES.filter((n) => n !== 'Note')) await sw(page, name).click();
	await expect(sw(page, 'Note')).toBeChecked();
	await expect(sw(page, 'Note')).toBeDisabled();
	await expect(page.getByText('Keep at least one on.')).toBeVisible();
	// Switching another one back on frees it again.
	await sw(page, 'Sleep').click();
	await expect(sw(page, 'Note')).toBeEnabled();
	await expect(page.getByText('Keep at least one on.')).toBeHidden();
});

test('Today: the one-time card, "Not now" hides it for good', async ({ page }) => {
	const account = await open(page, '/');
	const card = page.getByTestId('trackers-intro');
	await expect(card).toBeVisible({ timeout: 15_000 });
	await expect(card).toContainText('New: choose what you track');
	await expect(card).toContainText("Hide what you don't use. Nothing is deleted.");
	await card.getByRole('button', { name: 'Not now' }).click();
	await expect(card).toBeHidden();

	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByText('How are you feeling?')).toBeVisible({ timeout: 15_000 });
	await expect(card).toBeHidden();
});

test('Today: "Choose" opens the section on Me and the card is gone', async ({ page }) => {
	await open(page, '/');
	const card = page.getByTestId('trackers-intro');
	await expect(card).toBeVisible({ timeout: 15_000 });
	await card.getByRole('button', { name: 'Choose' }).click();
	await expect(page).toHaveURL(/\/me#what-you-track$/);
	await expect(page.getByRole('heading', { name: 'What you track' })).toBeVisible();
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(page.getByText('How are you feeling?')).toBeVisible();
	await expect(card).toBeHidden();
});

test('Today: cards of a switched-off tracker disappear', async ({ page }) => {
	await open(page, '/', [{ v: 1, type: 'trackers', choices: { feel: false, meds: false }, introSeen: true }]);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByText('How are you feeling?')).toBeHidden();
	await expect(nav(page).getByRole('link', { name: 'Meds' })).toBeHidden();
	await expect(nav(page).getByRole('link', { name: 'Me' })).toBeVisible();
	await expect(page.getByTestId('trackers-intro')).toBeHidden();
});

test('first run: new accounts choose what to track during sign-up', async ({ page }) => {
	test.setTimeout(120_000);
	const token = createInvite();
	const username = newUsername('first');
	const passphrase = newPassphrase();

	await page.goto(`/join#t=${token}`);
	await page.getByRole('button', { name: 'Get started' }).click();
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	await page.getByLabel('Repeat passphrase').fill(passphrase);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible({ timeout: 30_000 });
	const groups = await page.getByTestId('recovery-key').locator('span').allTextContents();
	await page.getByRole('button', { name: "I've stored it. Check me" }).click();
	const lead = (await page.getByText(/Type group \d+ and group \d+/).textContent()) ?? '';
	const [a, b] = [...lead.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
	await page.getByLabel(`Group ${a} (4 characters)`).fill(groups[a! - 1]!);
	await page.getByLabel(`Group ${b} (4 characters)`).fill(groups[b! - 1]!);
	await page.getByRole('button', { name: 'Confirm' }).click();

	// The new step: everything ticked, tap to untick, at least one stays ticked.
	await expect(page.getByRole('heading', { name: 'What do you want to track?' })).toBeVisible();
	await expect(page.getByText('You can change this any time on Me.')).toBeVisible();
	const tiles = page.getByRole('checkbox');
	await expect(tiles).toHaveCount(13);
	// Period and Bladder come last and start unticked; the other eleven are ticked.
	for (const t of (await tiles.all()).slice(0, 11)) await expect(t).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Period', exact: true })).not.toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Bladder', exact: true })).not.toBeChecked();
	await page.getByRole('checkbox', { name: 'Weight', exact: true }).click();
	await expect(page.getByRole('checkbox', { name: 'Weight', exact: true })).not.toBeChecked();
	await page.getByTestId('tracker-continue').click();

	await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
	await page.getByRole('checkbox', { name: /I understand, and I agree/ }).check();
	await page.getByRole('button', { name: 'Create my diary' }).click();
	await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

	// No "New:" card for this account; the choice is in effect.
	await expect(page.getByText('How are you feeling?')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('trackers-intro')).toBeHidden();
	await page.getByRole('button', { name: 'Log something' }).click();
	await expect(tile(page, 'Meal')).toBeVisible();
	await expect(tile(page, 'Weight')).toBeHidden();
	await expect(page.getByRole('dialog').locator('.tile')).toHaveCount(10);
	await page.keyboard.press('Escape');
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await expect(sw(page, 'Weight')).not.toBeChecked({ timeout: 15_000 });
	await expect(sw(page, 'Meal')).toBeChecked();
});

test('first run: the last ticked tracker cannot be unticked', async ({ page }) => {
	test.setTimeout(120_000);
	const token = createInvite();
	const passphrase = newPassphrase();
	await page.goto(`/join#t=${token}`);
	await page.getByRole('button', { name: 'Get started' }).click();
	await page.getByLabel('Username').fill(newUsername('last'));
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	await page.getByLabel('Repeat passphrase').fill(passphrase);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your recovery key' })).toBeVisible({ timeout: 30_000 });
	const groups = await page.getByTestId('recovery-key').locator('span').allTextContents();
	await page.getByRole('button', { name: "I've stored it. Check me" }).click();
	const lead = (await page.getByText(/Type group \d+ and group \d+/).textContent()) ?? '';
	const [a, b] = [...lead.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
	await page.getByLabel(`Group ${a} (4 characters)`).fill(groups[a! - 1]!);
	await page.getByLabel(`Group ${b} (4 characters)`).fill(groups[b! - 1]!);
	await page.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByRole('heading', { name: 'What do you want to track?' })).toBeVisible();
	for (const name of NAMES.filter((n) => n !== 'Note')) {
		await page.getByRole('checkbox', { name, exact: true }).click();
	}
	await page.getByRole('checkbox', { name: 'Note', exact: true }).click();
	await expect(page.getByRole('checkbox', { name: 'Note', exact: true })).toBeChecked();
});

test('reports: switched-off trackers leave the doctor report and the Reports page', async ({ page }) => {
	await open(page, '/trends', [
		...smallSet(),
		...heatSet(),
		{ v: 1, type: 'trackers', choices: { pain: false, meds: false, drink: false }, introSeen: true }
	]);
	await page.getByRole('link', { name: 'Reports' }).click();
	await expect(page.getByTestId('report-doctor')).toBeVisible();
	await expect(page.getByTestId('report-headache')).toBeHidden();

	await page.getByTestId('report-doctor').click();
	const include = page.getByTestId('include');
	await expect(include.getByRole('checkbox', { name: /^Sleep/ })).toBeChecked();
	for (const name of [
		/^Medicines/,
		/^Pain and heat map/,
		/^Pain episodes/,
		/^Headache days/,
		/^Fluids/,
		/^Add the Headache diary pages/
	]) {
		await expect(include.getByRole('checkbox', { name })).toHaveCount(0);
	}
	await page.getByRole('button', { name: 'Preview report' }).click();
	await expect(page.getByTestId('doctor-page').first()).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole('heading', { name: 'Sleep' }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Medicines' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Pain', exact: true })).toHaveCount(0);
});

test('Trends: cards of switched-off trackers are hidden', async ({ page }) => {
	await open(page, '/trends', [
		...smallSet(),
		...heatSet(),
		{ v: 1, type: 'trackers', choices: { pain: false, sleep: false }, introSeen: true }
	]);
	await expect(page.getByRole('heading', { name: 'Weight', exact: true }).first()).toBeVisible({
		timeout: 15_000
	});
	await expect(page.getByRole('heading', { name: 'Sleep', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Pain', exact: true })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Where it hurt' })).toHaveCount(0);
});

test('Medicine off pauses this device’s reminders, and on restores them', async ({ page }) => {
	await stubPush(page, endpointOf());
	await signUpAndSignIn(page, '/meds');
	await addMedWithReminder(page, 'Synthol', '08:00');
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	const card = page.getByTestId('reminders-card');
	await card.getByRole('switch', { name: 'Remind me on this device' }).click();
	await expect(card).toHaveAttribute('data-status', 'on');

	const puts: Request[] = [];
	page.on('request', (r) => {
		if (r.url().endsWith('/api/push/subscription') && r.method() === 'PUT') puts.push(r);
	});
	const slots = (r: Request) => (r.postDataJSON() as { schedule: { slots: unknown[] } }).schedule.slots;
	await sw(page, 'Medicine').click();
	await expect.poll(() => puts.length).toBe(1);
	expect(slots(puts[0]!)).toEqual([]);
	await expect(card).toBeHidden();

	await sw(page, 'Medicine').click();
	await expect.poll(() => puts.length).toBe(2);
	expect(slots(puts[1]!)).toEqual([{ time: '08:00', days: [0, 1, 2, 3, 4, 5, 6] }]);
	await expect(card).toHaveAttribute('data-status', 'on');
});
