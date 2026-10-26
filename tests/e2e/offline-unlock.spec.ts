import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { endpointOf, stubPush } from './push-stub';
import { signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Offline unlock (M8 branch 1): a device that was signed in opens its cached diary without a
// connection. Saving offline is the next branch; account actions stay online and say so.

const OFFLINE_NOTICE = "You're offline. You can still open what's saved on this device.";
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });

async function addNote(page: Page, text: string) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Note', exact: true }).click();
	await page.getByLabel('Note text').fill(text);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Note saved')).toBeVisible();
}

/** Playwright's offline switch also fires the page's online/offline event in Chromium; WebKit may not, so say it too. */
async function setOffline(page: Page, offline: boolean) {
	await page.context().setOffline(offline);
	await page.evaluate((o) => window.dispatchEvent(new Event(o ? 'offline' : 'online')), offline);
}

test.describe('in-app lock, then offline (both browsers)', () => {
	test.use({ serviceWorkers: 'block' });

	test('a locked device unlocks offline, shows its cache and says what needs a connection', async ({
		page
	}) => {
		await stubPush(page, endpointOf());
		const user = await signUpAndSignIn(page);
		const text = 'offline synthetic note';
		await addNote(page, text);
		await expect(timeline(page).getByText(text)).toBeVisible();

		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await page.getByRole('button', { name: 'Lock now' }).click();
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		await expect(page.getByText(OFFLINE_NOTICE)).toBeHidden();

		await setOffline(page, true);
		await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();
		await expect(page.getByRole('button', { name: 'Forgot your passphrase?' })).toBeDisabled();
		await unlockWith(page, user.passphrase);
		// Unlocking returns to where the person was (Me); the entry is on Today.
		await page.getByRole('link', { name: 'Today', exact: true }).click();
		await expect(timeline(page).getByText(text)).toBeVisible({ timeout: 15_000 });

		// Account actions that need the server are switched off, with one calm line.
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		const reminders = page.getByTestId('reminders-card');
		await expect(reminders.getByRole('switch', { name: 'Remind me on this device' })).toBeDisabled();
		await expect(reminders.getByTestId('needs-connection')).toHaveText(
			"Needs a connection. Try again when you're online."
		);
		await expect(page.getByRole('button', { name: 'Change passphrase' })).toBeDisabled();

		await setOffline(page, false);
		await expect(reminders.getByTestId('needs-connection')).toBeHidden();
		await expect(reminders.getByRole('switch', { name: 'Remind me on this device' })).toBeEnabled();
	});
});

test.describe('reload while offline (Chromium)', () => {
	test.skip(
		({ browserName }) => browserName === 'webkit',
		'Playwright cannot make WebKit serve the cached app shell for an offline reload; the unlock logic is covered by the in-app test above'
	);

	test('an offline reload opens the locked diary from the device cache', async ({ page }) => {
		const user = await signUpAndSignIn(page);
		// Wait for the service worker to control the page, then reload once so the shell is stored.
		await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
		await page.waitForFunction(() => !!navigator.serviceWorker.controller);
		await unlockWith(page, user.passphrase);
		const text = 'offline reload note';
		await addNote(page, text);

		await page.context().setOffline(true);
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByText(OFFLINE_NOTICE)).toBeVisible();
		await unlockWith(page, user.passphrase);
		await expect(timeline(page).getByText(text)).toBeVisible({ timeout: 15_000 });

		await page.context().setOffline(false);
		await page.evaluate(() => window.dispatchEvent(new Event('online')));
		// Back online: the session refreshes quietly and the diary stays open.
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await expect(page.getByTestId('needs-connection')).toBeHidden();
		await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeHidden();
	});
});
