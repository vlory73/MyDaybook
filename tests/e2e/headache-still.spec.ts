import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn, unlockWith } from './helpers';

// The headache card on Today (#89). Synthetic data only. Each test uses its own account. Times are relative to now:
// the headache starts 2.5 hours ago, so "1 hour ago" and "2 hours ago" are both on offer.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Where do you feel it?' });
const figure = (page: Page) => sheet(page).locator('svg[role=group]');
const intensity = (page: Page, n: number) =>
	sheet(page)
		.getByRole('radiogroup', { name: /^Intensity/ })
		.getByRole('radio', { name: String(n), exact: true });
const button = (page: Page, name: string) => sheet(page).getByRole('button', { name, exact: true });
const card = (page: Page) => page.getByRole('region', { name: 'Headache · still there?' });
const generalCard = (page: Page) => page.getByRole('region', { name: 'Still there?', exact: true });
const pad = (n: number) => String(n).padStart(2, '0');
/** A date-time field value ("YYYY-MM-DDTHH:mm") for this many minutes ago, on the browser's clock. */
const minutesAgo = (min: number) => {
	const d = new Date(Date.now() - min * 60_000);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const START = minutesAgo(150);

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Pain', exact: true }).click();
	await expect(sheet(page)).toBeVisible();
}

/** A left temple headache (intensity 6) that started 2.5 hours ago. */
async function logHeadache(page: Page) {
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await figure(page).getByRole('button', { name: 'Your left temple', exact: true }).click();
	await intensity(page, 6).click();
	await sheet(page).getByLabel('Started', { exact: true }).fill(START);
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(toast(page, 'Saved')).toBeVisible();
}

test('Still there notes the time on the same entry, hides the card and shows a toast', async ({ page }) => {
	await signUpAndSignIn(page);
	await logHeadache(page);

	await expect(card(page)).toBeVisible();
	await expect(card(page)).toHaveText(/Since .*\d.* · strongest 6/);
	// The general card is for other pain: nothing else was logged, so there is only the headache card.
	await expect(generalCard(page)).toHaveCount(0);

	await card(page).getByRole('button', { name: 'Still there', exact: true }).click();
	await expect(toast(page, "Noted. We'll ask again later.")).toBeVisible();
	await expect(card(page)).toBeHidden();
	// Still one entry on the timeline; no new one was made.
	await expect(timeline(page).getByText('Your left temple 6', { exact: true })).toHaveCount(1);
});

test('It’s gone asks when it stopped, writes it on the entry and removes the card', async ({ page }) => {
	await signUpAndSignIn(page);
	await logHeadache(page);

	await card(page).getByRole('button', { name: "It's gone", exact: true }).click();
	await expect(card(page).getByText('When did it stop?')).toBeVisible();
	const now = card(page).getByRole('button', { name: /^Now \(.+\)$/ });
	await expect(now).toHaveAttribute('aria-pressed', 'true');
	await expect(card(page).getByRole('button', { name: /^1 hour ago \(.+\)$/ })).toBeVisible();
	await expect(card(page).getByRole('button', { name: /^2 hours ago \(.+\)$/ })).toBeVisible();
	await expect(card(page).getByRole('button', { name: 'Earlier…' })).toBeVisible();

	// Cancel collapses; the card keeps asking.
	await card(page).getByRole('button', { name: 'Cancel' }).click();
	await expect(card(page).getByText('When did it stop?')).toBeHidden();
	await card(page).getByRole('button', { name: "It's gone", exact: true }).click();
	await card(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Marked as gone')).toBeVisible();
	await expect(card(page)).toBeHidden();

	await timeline(page).getByText('Your left temple 6', { exact: true }).click();
	await expect(sheet(page).getByLabel('Started', { exact: true })).toHaveValue(START);
	// "Now" was saved to the minute (allow for the minute turning while the test ran).
	const value = await sheet(page).getByLabel('Stopped', { exact: true }).inputValue();
	expect([minutesAgo(0), minutesAgo(-1), minutesAgo(1)]).toContain(value);
});

test('1 hour ago writes a stop one hour before now', async ({ page }) => {
	await signUpAndSignIn(page);
	await logHeadache(page);
	await card(page).getByRole('button', { name: "It's gone", exact: true }).click();
	await card(page)
		.getByRole('button', { name: /^1 hour ago/ })
		.click();
	await card(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Marked as gone')).toBeVisible();
	await timeline(page).getByText('Your left temple 6', { exact: true }).click();
	const value = await sheet(page).getByLabel('Stopped', { exact: true }).inputValue();
	expect([minutesAgo(60), minutesAgo(61), minutesAgo(59)]).toContain(value);
});

test('Earlier… shows one date-time field, limited to the start and now', async ({ page }) => {
	await signUpAndSignIn(page);
	await logHeadache(page);
	await card(page).getByRole('button', { name: "It's gone", exact: true }).click();
	await card(page).getByRole('button', { name: 'Earlier…' }).click();
	const field = card(page).getByLabel('When it stopped');
	await expect(field).toHaveAttribute('min', START);
	const stop = minutesAgo(100);
	await field.fill(stop);
	await card(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Marked as gone')).toBeVisible();
	await timeline(page).getByText('Your left temple 6', { exact: true }).click();
	await expect(sheet(page).getByLabel('Stopped', { exact: true })).toHaveValue(stop);
});

test('a later knee entry gets the general card; Not now hides the headache card until tomorrow', async ({
	page
}) => {
	const user = await signUpAndSignIn(page);
	await logHeadache(page);
	await openSheet(page);
	await figure(page).getByRole('button', { name: 'Your right knee', exact: true }).click();
	await intensity(page, 4).click();
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();

	// Both cards: the headache card (older, still open) and the general one for the knee.
	await expect(card(page)).toBeVisible();
	await expect(generalCard(page)).toBeVisible();
	await expect(generalCard(page)).toContainText('Your right knee');

	await card(page).getByRole('button', { name: 'Not now', exact: true }).click();
	await expect(card(page)).toBeHidden();
	await expect(generalCard(page)).toBeVisible();

	// Remembered on this device across a reload.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(generalCard(page)).toBeVisible({ timeout: 15_000 });
	await expect(card(page)).toBeHidden();
});
