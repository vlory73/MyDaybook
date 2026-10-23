import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn, unlockWith } from './helpers';

// The headache card on Today (#89). Synthetic data only. Each test uses its own account. Times are relative to now:
// the headache starts at the beginning of the previous hour (or this hour just after midnight).
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
const startHour = () => Math.max(0, new Date().getHours() - 1);

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Pain', exact: true }).click();
	await expect(sheet(page)).toBeVisible();
}

/** A left temple headache (intensity 6) that started `startHour()` o'clock today. */
async function logHeadache(page: Page) {
	await openSheet(page);
	await button(page, 'Head, close-up').click();
	await figure(page).getByRole('button', { name: 'Your left temple', exact: true }).click();
	await intensity(page, 6).click();
	await sheet(page).getByLabel('Hour Started').selectOption(pad(startHour()));
	await button(page, 'Save 1 point').click();
	await expect(sheet(page)).toBeHidden();
	await expect(toast(page, 'Saved')).toBeVisible();
}

test('Still there notes the hour on the same entry, hides the card and shows a toast', async ({ page }) => {
	await signUpAndSignIn(page);
	await logHeadache(page);

	await expect(card(page)).toBeVisible();
	await expect(card(page)).toContainText(`Since ${pad(startHour())}:00 today · strongest 6`);
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
	const now = card(page).getByRole('button', { name: /^Now \(\d\d:00\)$/ });
	await expect(now).toHaveAttribute('aria-pressed', 'true');
	const stopHour = /\((\d\d):00\)/.exec((await now.textContent()) ?? '')![1]!;
	await expect(card(page).getByRole('button', { name: 'Earlier…' })).toBeVisible();

	// Cancel collapses; the card keeps asking.
	await card(page).getByRole('button', { name: 'Cancel' }).click();
	await expect(card(page).getByText('When did it stop?')).toBeHidden();
	await card(page).getByRole('button', { name: "It's gone", exact: true }).click();
	await card(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Marked as gone')).toBeVisible();
	await expect(card(page)).toBeHidden();

	await timeline(page).getByText('Your left temple 6', { exact: true }).click();
	await expect(sheet(page).getByLabel('Hour Started')).toHaveValue(pad(startHour()));
	await expect(sheet(page).getByLabel('Hour Stopped')).toHaveValue(stopHour);
	await expect(sheet(page).getByLabel('Day Stopped')).toHaveValue(/^\d{4}-\d\d-\d\d$/);
});

test('Earlier… shows the day and hour pickers', async ({ page }) => {
	await signUpAndSignIn(page);
	await logHeadache(page);
	await card(page).getByRole('button', { name: "It's gone", exact: true }).click();
	await card(page).getByRole('button', { name: 'Earlier…' }).click();
	await expect(card(page).getByLabel('Day it stopped')).toBeVisible();
	await card(page).getByLabel('Hour it stopped').selectOption(pad(startHour()));
	await card(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(toast(page, 'Marked as gone')).toBeVisible();
	await timeline(page).getByText('Your left temple 6', { exact: true }).click();
	await expect(sheet(page).getByLabel('Hour Stopped')).toHaveValue(pad(startHour()));
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
