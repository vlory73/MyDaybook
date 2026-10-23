import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn, unlockWith } from './helpers';

// Pain episodes (M5): entries linked over several days. Synthetic data only. Each test uses its own account.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Where do you feel it?' });
const figure = (page: Page) => sheet(page).locator('svg[role=group]');
const intensity = (page: Page, n: number) =>
	sheet(page)
		.getByRole('radiogroup', { name: /^Intensity/ })
		.getByRole('radio', { name: String(n), exact: true });
const episodeSheet = (page: Page) => page.getByRole('dialog', { name: 'Your right knee' });
const chip = (page: Page, n: number) =>
	timeline(page).getByRole('button', { name: `Open episode Your right knee, day ${n}` });

function yesterday(): string {
	const d = new Date();
	d.setHours(12);
	d.setDate(d.getDate() - 1);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Pain', exact: true }).click();
	await expect(sheet(page)).toBeVisible();
}

/** Right knee, logged yesterday at 09:00, the normal way (so it is not in an episode). */
async function logKneeYesterday(page: Page, level = 6) {
	await openSheet(page);
	await sheet(page).getByLabel('Time of the entry').fill(`${yesterday()}T09:00`);
	await figure(page).getByRole('button', { name: 'Your right knee', exact: true }).click();
	await intensity(page, level).click();
	await sheet(page).getByRole('button', { name: 'Save 1 point' }).click();
	await expect(toast(page, 'Saved')).toBeVisible();
}

test('Same as last time starts an episode: chip, sheet, It’s gone, reopen, Unlink all', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	await logKneeYesterday(page);
	// Nothing is linked by the normal way.
	await expect(page.getByRole('button', { name: /Open episode/ })).toHaveCount(0);

	await openSheet(page);
	// No episode exists yet, so the row is not shown.
	await expect(sheet(page).getByText('Episode', { exact: true })).toHaveCount(0);
	await sheet(page)
		.getByRole('button', { name: /Same as last time/ })
		.click();
	// The new entry joins an episode made from yesterday's entry.
	await expect(sheet(page).getByText('Episode', { exact: true })).toBeVisible();
	await expect(sheet(page).getByText(/^since .* · day 2$/)).toBeVisible();
	await intensity(page, 4).click();
	await sheet(page).getByRole('button', { name: 'Save 1 point' }).click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(chip(page, 2)).toBeVisible();

	// The link survives a reload and unlock.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(chip(page, 2)).toBeVisible({ timeout: 15_000 });

	// The episode sheet: two entries over two days, day dots, ongoing.
	await chip(page, 2).click();
	await expect(episodeSheet(page)).toBeVisible();
	await expect(episodeSheet(page)).toContainText('→ ongoing · 2 entries over 2 days');
	await expect(episodeSheet(page).getByTestId('episode-days').getByRole('img')).toHaveCount(2);
	await expect(episodeSheet(page).getByRole('img', { name: /: 6$/ })).toBeVisible();
	await expect(episodeSheet(page).getByRole('img', { name: /: 4$/ })).toBeVisible();
	await expect(episodeSheet(page).getByRole('button', { name: /^Remove / })).toHaveCount(2);

	// It's gone, then not gone yet.
	await episodeSheet(page).getByRole('button', { name: "It's gone" }).click();
	await expect(toast(page, 'Marked as gone')).toBeVisible();
	await expect(episodeSheet(page)).not.toContainText('ongoing');
	await expect(episodeSheet(page).getByRole('button', { name: 'Not gone yet (reopen)' })).toBeVisible();
	await episodeSheet(page).getByRole('button', { name: 'Not gone yet (reopen)' }).click();
	await expect(episodeSheet(page)).toContainText('→ ongoing');
	await expect(episodeSheet(page).getByRole('button', { name: "It's gone" })).toBeVisible();

	// Rename stores the name.
	await episodeSheet(page).getByRole('button', { name: 'Rename' }).click();
	await episodeSheet(page).getByLabel('Episode name').fill('My knee');
	await episodeSheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'My knee' })).toBeVisible();
	const named = page.getByRole('dialog', { name: 'My knee' });

	// Unlink all: the entries stay, the chip goes, Undo brings it back.
	await named.getByRole('button', { name: 'Unlink all' }).click();
	await expect(toast(page, 'Episode removed, entries kept')).toBeVisible();
	await expect(page.getByRole('button', { name: /Open episode/ })).toHaveCount(0);
	await expect(timeline(page).getByText('Your right knee 4', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(toast(page, 'Episode restored')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Open episode My knee, day 2' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the normal way never joins; the sheet offers Add to the ongoing episode', async ({ page }) => {
	await signUpAndSignIn(page);
	await logKneeYesterday(page);
	// Log today from the card: an episode is made from yesterday's entry.
	await page.getByRole('region', { name: 'Still there?' }).getByRole('button', { name: 'Log today' }).click();
	await expect(sheet(page).getByText(/^since .* · day 2$/)).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Save 1 point' }).click();
	await expect(chip(page, 2)).toBeVisible();

	// A new entry the normal way is not in the episode, but one tap adds it.
	await openSheet(page);
	await figure(page).getByRole('button', { name: 'Your right knee', exact: true }).click();
	await intensity(page, 2).click();
	await expect(sheet(page).getByRole('button', { name: 'Add to Your right knee (ongoing)' })).toBeVisible();
	await expect(sheet(page).getByRole('button', { name: 'Choose episode…' })).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Save 1 point' }).click();
	await expect(timeline(page).getByText('Your right knee 2', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: /Open episode/ })).toHaveCount(1);

	// Edit that entry: add it, then it shows the episode with Change.
	await timeline(page).getByText('Your right knee 2', { exact: true }).click();
	await sheet(page).getByRole('button', { name: 'Add to Your right knee (ongoing)' }).click();
	await expect(sheet(page).getByText(/^since .* · day 2$/)).toBeVisible();
	await expect(sheet(page).getByRole('button', { name: 'Change' })).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Save 1 point' }).click();
	await expect(page.getByRole('button', { name: /Open episode/ })).toHaveCount(2);

	// Remove one entry from the episode in its sheet (it stays on the timeline).
	await chip(page, 2).first().click();
	await episodeSheet(page)
		.getByRole('button', { name: /^Remove / })
		.first()
		.click();
	await expect(toast(page, 'Removed from the episode')).toBeVisible();
	await expect(page.getByRole('button', { name: /Open episode/ })).toHaveCount(1);
});

test('"It’s gone" on the card ends an entry that has no episode, and the card goes', async ({ page }) => {
	await signUpAndSignIn(page);
	await logKneeYesterday(page);
	const card = page.getByRole('region', { name: 'Still there?' });
	await expect(card).toContainText('Your right knee · last logged yesterday: 6');
	await card.getByRole('button', { name: "It's gone" }).click();
	await expect(toast(page, 'Marked as gone')).toBeVisible();
	await expect(card).toHaveCount(0);
});

test('the episode texts are in Danish', async ({ page }) => {
	await signUpAndSignIn(page, '/me');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await page.getByRole('link', { name: 'I dag' }).click();
	await page.getByRole('button', { name: 'Registrér noget' }).click();
	await page.getByRole('button', { name: 'Smerter', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Hvor mærker du det?' });
	await dialog.getByLabel('Tidspunkt for registreringen').fill(`${yesterday()}T09:00`);
	await dialog.locator('svg[role=group]').getByRole('button', { name: 'Dit højre knæ', exact: true }).click();
	await dialog
		.getByRole('radiogroup', { name: /^Intensitet/ })
		.getByRole('radio', { name: '6', exact: true })
		.click();
	await dialog.getByRole('button', { name: 'Gem 1 punkt' }).click();
	const card = page.getByRole('region', { name: 'Stadig der?' });
	await expect(card.getByRole('button', { name: 'Det er væk' })).toBeVisible();
	await card.getByRole('button', { name: 'Notér i dag' }).click();
	await expect(dialog.getByText('Forløb', { exact: true })).toBeVisible();
	await expect(dialog.getByText(/^siden .* · dag 2$/)).toBeVisible();
});
