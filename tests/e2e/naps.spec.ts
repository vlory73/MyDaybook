import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { seedRecords, signUpAndSignIn, signUpApiAccount, unlockWith } from './helpers';
import { at } from './trends-data';
import { todayKey } from '../../src/lib/records/time';

// Synthetic data only. The service worker is blocked like in the other specs that reload (WebKit lessons).
test.use({ serviceWorkers: 'block' });

const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog');

test('a nap is logged as its own entry and shows on the timeline', async ({ page }) => {
	await signUpAndSignIn(page);
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Sleep', exact: true }).click();

	// Night or nap is picked from the time of day; choose Nap explicitly.
	await sheet(page).getByRole('radio', { name: 'Nap' }).click();
	await expect(sheet(page).getByRole('button', { name: 'Save nap' })).toBeVisible();
	// A nap has no awakenings, and the rating is optional.
	await expect(sheet(page).getByText('Woke up during the night')).toHaveCount(0);
	await expect(sheet(page).getByText('Optional').first()).toBeVisible();

	const day = todayKey();
	await sheet(page).getByLabel('Fell asleep', { exact: true }).fill(`${day}T13:20`);
	await sheet(page).getByLabel('Woke up', { exact: true }).fill(`${day}T14:05`);
	await expect(page.getByTestId('sleep-duration')).toHaveText('45 min');
	await sheet(page).getByRole('button', { name: 'Save nap' }).click();
	await expect(sheet(page)).toBeHidden();

	await expect(timeline(page).getByText('Nap 45 min')).toBeVisible();
	await expect(timeline(page).getByText('13:20 to 14:05')).toBeVisible();

	// Opening it again keeps it a nap.
	await timeline(page).getByText('Nap 45 min').click();
	await expect(sheet(page).getByRole('radio', { name: 'Nap' })).toHaveAttribute('aria-checked', 'true');
	await expect(sheet(page).getByRole('button', { name: 'Save nap' })).toBeVisible();
});

test('naps inside an old night become separate entries, once', async ({ page }) => {
	const account = await signUpApiAccount(page.request);
	const [nightId] = await seedRecords(page.request, account, [
		{
			v: 1,
			type: 'sleep',
			asleepAt: at(1, 23, 50),
			at: at(0, 7, 10),
			quality: 4,
			naps: [{ from: at(0, 13, 20), to: at(0, 14, 5) }]
		}
	]);
	expect(nightId).toBeTruthy();

	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);

	// The conversion runs quietly after the first sync: no notice, a separate nap entry appears.
	await expect(timeline(page).getByText('Nap 45 min')).toBeVisible({ timeout: 15_000 });
	await expect(timeline(page).getByText('Slept 7 h 20 min')).toBeVisible();
	await expect(timeline(page).getByText('1 nap')).toHaveCount(0);

	// It is saved on the server: after a reload there is still exactly one nap and the night has no nap list.
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	await expect(timeline(page).getByText('Nap 45 min')).toHaveCount(1, { timeout: 15_000 });
	await expect(timeline(page).getByText('Slept 7 h 20 min')).toBeVisible();
	await expect(timeline(page).getByText('1 nap')).toHaveCount(0);
});
