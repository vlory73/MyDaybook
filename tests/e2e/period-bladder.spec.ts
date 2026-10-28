import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { seedRecords, signUpApiAccount, unlockWith } from './helpers';
import { at } from './trends-data';

// Synthetic data only. The service worker is blocked like in the other specs that reload (WebKit lessons).
test.use({ serviceWorkers: 'block' });

const ON = { v: 1, type: 'trackers', choices: { period: true, bladder: true }, introSeen: true };
const sheet = (page: Page) => page.getByRole('dialog');
const entries = (page: Page) => page.locator('ol.tl .entry');

/** An API account with records, opened on `path` and unlocked. */
async function open(page: Page, path: string, payloads: object[] = []) {
	const account = await signUpApiAccount(page.request);
	if (payloads.length > 0) await seedRecords(page.request, account, payloads);
	await page.goto(path);
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	return account;
}
async function openTile(page: Page, name: string) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
}
const period = (daysAgo: number, flow: string, extras?: string[]) => ({
	v: 1,
	type: 'period',
	at: at(daysAgo, 8),
	flow,
	...(extras ? { extras } : {})
});

test('both trackers are off by default and appear after switching them on in Me', async ({ page }) => {
	await open(page, '/me');
	await expect(page.getByRole('heading', { name: 'What you track' })).toBeVisible();
	const periodSwitch = page.getByRole('switch', { name: 'Period', exact: true });
	const bladderSwitch = page.getByRole('switch', { name: 'Bladder', exact: true });
	await expect(periodSwitch).not.toBeChecked();
	await expect(bladderSwitch).not.toBeChecked();
	await expect(page.getByText('Days and flow. Record only.')).toBeVisible();
	await expect(page.getByText('Visits, urgency, discomfort')).toBeVisible();

	await page.getByRole('button', { name: 'Log something' }).click();
	await expect(sheet(page).getByRole('button', { name: 'Meal', exact: true })).toBeVisible();
	await expect(sheet(page).getByRole('button', { name: 'Period', exact: true })).toBeHidden();
	await expect(sheet(page).getByRole('button', { name: 'Bladder', exact: true })).toBeHidden();
	await expect(sheet(page).locator('.tile')).toHaveCount(11);
	await page.keyboard.press('Escape');
	await expect(sheet(page)).toBeHidden();

	await periodSwitch.click();
	await bladderSwitch.click();
	await expect(periodSwitch).toBeChecked();
	await expect(bladderSwitch).toBeChecked();
	await page.getByRole('button', { name: 'Log something' }).click();
	await expect(sheet(page).getByRole('button', { name: 'Period', exact: true })).toBeVisible();
	await expect(sheet(page).getByRole('button', { name: 'Bladder', exact: true })).toBeVisible();
	await expect(sheet(page).locator('.tile')).toHaveCount(13);
});

test('Period: "Same as yesterday", one entry per day, and the Again? row', async ({ page }) => {
	await open(page, '/', [ON, period(1, 'light', ['cramps'])]);
	await expect(page.getByTestId('period-ask')).toBeVisible({ timeout: 15_000 });

	// The Again? row offers it too.
	await page.getByRole('button', { name: 'Log something' }).click();
	await expect(sheet(page).getByRole('button', { name: /Period as yesterday/ })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(sheet(page)).toBeHidden();

	await openTile(page, 'Period');
	await expect(sheet(page).getByRole('heading', { name: 'Period' })).toBeVisible();
	const same = sheet(page).getByTestId('period-same');
	await expect(same).toContainText('Light flow · Cramps');
	await same.click();
	await expect(sheet(page).getByRole('radio', { name: 'Light' })).toBeChecked();
	await expect(sheet(page).getByRole('button', { name: 'Cramps', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await sheet(page).getByRole('radio', { name: 'Heavy' }).click();
	await sheet(page).getByRole('button', { name: 'Clots', exact: true }).click();
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(page.getByText('Period · Heavy flow')).toBeVisible();
	await expect(page.getByTestId('period-ask')).toBeHidden();

	// Opening the sheet again for today edits that entry: no second one, no "Same as yesterday".
	await openTile(page, 'Period');
	await expect(sheet(page).getByRole('radio', { name: 'Heavy' })).toBeChecked();
	await expect(sheet(page).getByTestId('period-same')).toBeHidden();
	await sheet(page).getByRole('radio', { name: 'Medium' }).click();
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(page.getByText('Period · Medium flow')).toBeVisible();
	await expect(page.getByText('Period · Heavy flow')).toBeHidden();
	await expect(entries(page).filter({ hasText: 'Period ·' })).toHaveCount(1);
});

test('Today: the "Period yesterday" card copies yesterday, with Undo, and can be hidden', async ({
	page
}) => {
	await open(page, '/', [ON, period(1, 'light', ['cramps'])]);
	const card = page.getByTestId('period-ask');
	await expect(card).toContainText('Period yesterday. Log today?', { timeout: 15_000 });
	await card.getByRole('button', { name: 'Log', exact: true }).click();
	await expect(page.getByText('Period logged')).toBeVisible();
	await expect(card).toBeHidden();
	await expect(entries(page).filter({ hasText: 'Period · Light flow' })).toHaveCount(1);
	await expect(entries(page).filter({ hasText: 'Cramps' })).toHaveCount(1);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(entries(page).filter({ hasText: 'Period ·' })).toHaveCount(0);
	await expect(card).toBeVisible();

	await card.getByRole('button', { name: 'Hide for today' }).click();
	await expect(card).toBeHidden();
});

test('Today: "Period as yesterday" in the quick-log row saves at once', async ({ page }) => {
	await open(page, '/', [ON, period(1, 'spotting')]);
	await page.getByRole('button', { name: 'Log something' }).click();
	await sheet(page)
		.getByRole('button', { name: /Period as yesterday/ })
		.click();
	await expect(sheet(page)).toBeHidden();
	await expect(entries(page).filter({ hasText: 'Period · Spotting' })).toHaveCount(1, { timeout: 15_000 });
});

test('Bladder: one-tap visits, "+ 1 again", details and a leak on its own', async ({ page }) => {
	await open(page, '/', [ON]);
	const day = page.getByTestId('bladder-day');
	await expect(day).toBeHidden();

	// One tap: "Log a visit" saves at once.
	await openTile(page, 'Bladder');
	await expect(sheet(page).getByTestId('bladder-last')).toBeHidden();
	await expect(sheet(page).getByTestId('bladder-leak-only')).toBeDisabled();
	await sheet(page).getByTestId('bladder-visit').click();
	await expect(sheet(page)).toBeHidden();
	await expect(day).toHaveText(/Bladder today: 1 time$/, { timeout: 15_000 });
	await expect(entries(page)).toHaveCount(1);

	// "+ 1 again" repeats the last visit.
	await openTile(page, 'Bladder');
	await expect(sheet(page).getByTestId('bladder-last')).toContainText('Last visit');
	await expect(sheet(page).getByTestId('bladder-last')).toContainText('Bladder today: 1 time');
	await sheet(page).getByRole('button', { name: 'Log the same visit again now' }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(day).toHaveText(/Bladder today: 2 times$/);

	// A visit with details: urgency, a leak and when. "When" shows only once an amount is picked.
	await openTile(page, 'Bladder');
	await expect(sheet(page).getByTestId('bladder-when')).toBeHidden();
	await sheet(page).getByRole('radio', { name: 'Some' }).click();
	await sheet(page).getByRole('switch', { name: 'Discomfort or burning' }).click();
	await sheet(page).getByRole('button', { name: 'A little', exact: true }).click();
	await expect(sheet(page).getByTestId('bladder-when')).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Afterwards', exact: true }).click();
	// After the details, the usual Save at the bottom saves the visit, like on every other sheet.
	const save = sheet(page).getByRole('button', { name: 'Save', exact: true });
	await save.scrollIntoViewIfNeeded();
	await save.click();
	await expect(sheet(page)).toBeHidden();
	await expect(day).toHaveText(/Bladder today: 3 times$/);
	const detailed = entries(page).filter({ hasText: 'Bladder · urgency: some' });
	await expect(detailed).toHaveCount(1);
	await expect(detailed).toContainText('Discomfort · leak afterwards');
	await expect(detailed.getByRole('img', { name: 'Leak: a little' })).toBeVisible();

	// A leak on its own is not a visit: the count stays.
	await openTile(page, 'Bladder');
	await sheet(page).getByRole('button', { name: 'Some', exact: true }).click();
	await sheet(page).getByRole('button', { name: 'When coughing, sneezing, lifting or moving' }).click();
	await expect(sheet(page).getByTestId('bladder-leak-only')).toBeEnabled();
	await sheet(page).getByTestId('bladder-leak-only').click();
	await expect(sheet(page)).toBeHidden();
	const leak = entries(page).filter({ hasText: 'Leak · when moving' });
	await expect(leak).toHaveCount(1);
	await expect(leak.getByRole('img', { name: 'Leak: some' })).toBeVisible();
	await expect(day).toHaveText(/Bladder today: 3 times$/);

	// Tapping an entry edits it with a normal Save (no one-tap buttons).
	await leak.click();
	await expect(sheet(page).getByTestId('bladder-visit')).toBeHidden();
	await sheet(page).getByRole('button', { name: 'A lot', exact: true }).click();
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(leak.getByRole('img', { name: 'Leak: a lot' })).toBeVisible();
});

test('Bladder: an open sheet scrolls on its own and the page behind it stays put', async ({ page }) => {
	await open(page, '/', [
		ON,
		{
			v: 1,
			type: 'bladder',
			at: at(0, 7),
			visit: true,
			urgency: 'some',
			leak: { amount: 2, when: 'afterwards' },
			note: 'Synthetic note'
		}
	]);
	const entry = page.getByRole('button', { name: /Bladder ·/ }).first();
	await expect(entry).toBeVisible({ timeout: 15_000 });
	await entry.click();
	await expect(sheet(page)).toBeVisible();
	const styles = await page.evaluate(() => {
		const d = document.querySelector('dialog[open]') as HTMLElement;
		return {
			page: getComputedStyle(document.documentElement).overflow,
			sheet: getComputedStyle(d).overflowY,
			chain: getComputedStyle(d).overscrollBehaviorY
		};
	});
	expect(styles).toEqual({ page: 'hidden', sheet: 'auto', chain: 'contain' });
	const save = sheet(page).getByRole('button', { name: 'Save', exact: true });
	await save.scrollIntoViewIfNeeded();
	await expect(save).toBeInViewport();
	await page.keyboard.press('Escape');
	await expect(sheet(page)).toBeHidden();
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
});

test('Period: an open sheet scrolls on its own and the page behind it stays put', async ({ page }) => {
	await open(page, '/', [ON, { ...period(0, 'medium', ['cramps']), note: 'Synthetic note' }]);
	const entry = page.getByRole('button', { name: /Period ·/ }).first();
	await expect(entry).toBeVisible({ timeout: 15_000 });
	await entry.click();
	await expect(sheet(page)).toBeVisible();
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
	const save = sheet(page).getByRole('button', { name: 'Save', exact: true });
	await save.scrollIntoViewIfNeeded();
	await expect(save).toBeInViewport();
});

test('Trends: Period and Bladder cards for the chosen days, and hidden when switched off', async ({
	page
}) => {
	const records = [
		ON,
		period(5, 'light'),
		period(3, 'heavy', ['cramps']),
		period(2, 'spotting'),
		{ v: 1, type: 'bladder', at: at(4, 8), visit: true },
		{ v: 1, type: 'bladder', at: at(4, 13), visit: true, discomfort: true },
		{ v: 1, type: 'bladder', at: at(2, 9), visit: true, leak: { amount: 1, when: 'afterwards' } },
		{ v: 1, type: 'bladder', at: at(1, 9), visit: false, leak: { amount: 2, when: 'moving' } },
		{
			v: 1,
			type: 'drink',
			at: at(4, 9),
			drink: 'def:water',
			size: 'def:glass',
			sizeMl: 250,
			count: 2,
			totalMl: 500
		}
	];
	await open(page, '/trends', records);
	const period$ = page.getByRole('heading', { name: 'Period', exact: true });
	await expect(period$).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('period-calendar')).toBeVisible();
	await expect(page.getByText('Days logged')).toBeVisible();

	const bladder$ = page.getByRole('heading', { name: 'Bladder', exact: true });
	await expect(bladder$).toBeVisible();
	await expect(page.getByText('visits a day')).toBeVisible();
	await expect(page.getByText('Drinks a day, cl (from Drink)')).toBeVisible();
	await expect(page.getByText('Days with discomfort')).toBeVisible();
	await expect(page.getByText('Days with a leak', { exact: true })).toBeVisible();
	await expect(page.getByText('Afterwards', { exact: true })).toBeVisible();
	await expect(page.getByText('When coughing, sneezing, lifting or moving')).toBeVisible();
	await expect(page.getByRole('img', { name: /Bladder visits a day/ })).toBeVisible();
});

test('Trends: no Period or Bladder card when the trackers are off or there is no data', async ({ page }) => {
	await open(page, '/trends', [
		{ v: 1, type: 'trackers', choices: { period: false, bladder: false }, introSeen: true },
		period(2, 'light'),
		{ v: 1, type: 'bladder', at: at(2, 8), visit: true },
		{ v: 1, type: 'note', at: at(1, 8), text: 'Synthetic note', tags: [] }
	]);
	await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Period', exact: true })).toBeHidden();
	await expect(page.getByRole('heading', { name: 'Bladder', exact: true })).toBeHidden();
});

test('Trends: the drink bars show only when Drink is on', async ({ page }) => {
	await open(page, '/trends', [
		{ v: 1, type: 'trackers', choices: { period: true, bladder: true, drink: false }, introSeen: true },
		{ v: 1, type: 'bladder', at: at(2, 8), visit: true },
		{
			v: 1,
			type: 'drink',
			at: at(2, 9),
			drink: 'def:water',
			size: 'def:glass',
			sizeMl: 250,
			count: 1,
			totalMl: 250
		}
	]);
	await expect(page.getByRole('heading', { name: 'Bladder', exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText('Drinks a day, cl (from Drink)')).toBeHidden();
});

test('export: period.csv and bladder.csv are in the zip even when the trackers are off', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
	});
	const account = await open(page, '/me/export', [
		period(1, 'medium', ['clots']),
		{ v: 1, type: 'bladder', at: at(1, 9), visit: true, urgency: 'strong' }
	]);
	await expect(page.getByRole('heading', { name: 'Download my data', level: 1 })).toBeVisible({
		timeout: 15_000
	});
	await page.getByRole('button', { name: 'Prepare download' }).click();
	await sheet(page).getByLabel('Passphrase').fill(account.passphrase);
	await sheet(page).getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible({ timeout: 30_000 });
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Save or share' }).click()
	]);
	const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
	expect(Object.keys(files)).toEqual(expect.arrayContaining(['period.csv', 'bladder.csv', 'mydaybook.json']));
	expect(strFromU8(files['period.csv']!)).toContain('medium,clots');
	expect(strFromU8(files['bladder.csv']!)).toContain('strong');
	const json = JSON.parse(strFromU8(files['mydaybook.json']!));
	expect(json.records.map((r: { payload: { type: string } }) => r.payload.type).sort()).toEqual([
		'bladder',
		'period'
	]);
});
