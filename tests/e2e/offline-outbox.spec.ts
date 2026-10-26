import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { endpointOf, stubPush } from './push-stub';
import { signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. Offline outbox (M8 branch 2): entries made, edited or deleted without a connection are kept
// encrypted on the device, shown at once with "Not synced yet", and sent when the connection is back.
// The service worker is blocked so the same code runs in WebKit, where `page.route` and offline mode only work then.
test.use({ serviceWorkers: 'block' });

const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog');
const QUEUED = "Saved on this device. It will sync when you're back online.";

/** Playwright's offline switch also fires the page's online/offline event in Chromium; WebKit may not, so say it too. */
async function setOffline(page: Page, offline: boolean) {
	await page.context().setOffline(offline);
	await page.evaluate((o) => window.dispatchEvent(new Event(o ? 'offline' : 'online')), offline);
}

async function addNote(page: Page, text: string, toast = 'Note saved') {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Note', exact: true }).click();
	await page.getByLabel('Note text').fill(text);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText(toast, { exact: true })).toBeVisible();
	await expect(sheet(page)).toBeHidden();
}

async function reopen(page: Page, passphrase: string) {
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, passphrase);
}

const entry = (page: Page, text: string) => timeline(page).locator('li').filter({ hasText: text });

test('an entry made offline shows "Not synced yet", then syncs when the connection is back', async ({
	page
}) => {
	await stubPush(page, endpointOf());
	const user = await signUpAndSignIn(page);
	await addNote(page, 'synced before going offline');
	await expect(page.getByTestId('sync-pill')).toBeHidden();

	await setOffline(page, true);
	await addNote(page, 'written without a connection', QUEUED);
	await expect(entry(page, 'written without a connection').getByTestId('unsynced')).toHaveText(
		'Not synced yet'
	);
	await expect(entry(page, 'synced before going offline').getByTestId('unsynced')).toHaveCount(0);
	await expect(page.getByTestId('sync-pill')).toHaveText('Offline · 1 not synced yet');

	await setOffline(page, false);
	await expect(page.getByText('All synced', { exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('unsynced')).toHaveCount(0);
	await expect(page.getByTestId('sync-pill')).toBeHidden();

	// It is on the server: a fresh load of the diary shows it.
	await reopen(page, user.passphrase);
	await expect(entry(page, 'written without a connection')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('unsynced')).toHaveCount(0);
});

test('an edit and a delete made offline are sent when the connection is back', async ({ page }) => {
	await stubPush(page, endpointOf());
	const user = await signUpAndSignIn(page);
	await addNote(page, 'first note to edit');
	await page.getByText('Note saved', { exact: true }).waitFor({ state: 'hidden', timeout: 15_000 });
	await addNote(page, 'second note to delete');
	await page.getByText('Note saved', { exact: true }).waitFor({ state: 'hidden', timeout: 15_000 });

	await setOffline(page, true);
	await entry(page, 'first note to edit').getByRole('button').click();
	await page.getByLabel('Note text').fill('first note, edited offline');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText(QUEUED)).toBeVisible();
	await expect(sheet(page)).toBeHidden();
	await expect(entry(page, 'first note, edited offline').getByTestId('unsynced')).toBeVisible();

	await entry(page, 'second note to delete').getByRole('button').click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText("Deleted on this device. It will sync when you're back online.")).toBeVisible();
	await expect(entry(page, 'second note to delete')).toHaveCount(0);
	await expect(page.getByTestId('sync-pill')).toHaveText('Offline · 2 not synced yet');

	await setOffline(page, false);
	await expect(page.getByTestId('sync-pill')).toBeHidden({ timeout: 15_000 });
	await expect(page.getByTestId('unsynced')).toHaveCount(0);

	await reopen(page, user.passphrase);
	await expect(entry(page, 'first note, edited offline')).toBeVisible({ timeout: 15_000 });
	await expect(entry(page, 'second note to delete')).toHaveCount(0);
});

test('signing out with entries waiting asks first; "Stay signed in" keeps them', async ({ page }) => {
	await stubPush(page, endpointOf());
	await signUpAndSignIn(page);
	// Without the service worker the Me page's code is fetched on first visit, so open it while still online.
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await setOffline(page, true);
	await addNote(page, 'must not be lost', QUEUED);

	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	const warning = page.getByTestId('signout-warning');
	await expect(sheet(page).getByRole('heading', { name: '1 entry is not synced yet' })).toBeVisible();
	await expect(warning).toContainText('If you sign out now, it is lost.');
	await warning.getByRole('button', { name: 'Stay signed in' }).click();
	await expect(sheet(page)).toBeHidden();

	// Still signed in, and the entry still waits.
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(entry(page, 'must not be lost').getByTestId('unsynced')).toBeVisible();

	// "Sign out and lose it" does what it says.
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await sheet(page).getByRole('button', { name: 'Sign out and lose it' }).click();
	await expect(page).toHaveURL(/\/login/);
});

test('without waiting entries, Sign out does not ask', async ({ page }) => {
	await signUpAndSignIn(page);
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);
});

test('the Sync card on Me shows what waits and "Try now" sends it', async ({ page }) => {
	await stubPush(page, endpointOf());
	await signUpAndSignIn(page);
	// The records endpoint is unreachable (the page itself still loads): the same thing the app sees without a connection.
	await page.route('**/api/records/*', (route) => route.abort('connectionfailed'));
	await addNote(page, 'waiting for the card', QUEUED);

	await page.getByRole('link', { name: 'Me', exact: true }).click();
	const card = page.getByTestId('sync-card');
	await expect(card).toContainText('1 entry waiting to sync');
	await card.getByRole('button', { name: 'Try now' }).click();
	await expect(card).toContainText('1 entry waiting to sync'); // still unreachable

	await page.unroute('**/api/records/*');
	await card.getByRole('button', { name: 'Try now' }).click();
	await expect(card).toBeHidden({ timeout: 15_000 });
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(entry(page, 'waiting for the card').getByTestId('unsynced')).toHaveCount(0);
});

test('a change the server refuses stays on the device and is shown on the Sync card', async ({ page }) => {
	await stubPush(page, endpointOf());
	await signUpAndSignIn(page);
	await page.route('**/api/records/*', (route) =>
		route.request().method() === 'PUT'
			? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"bad_request"}' })
			: route.continue()
	);
	await addNote(page, 'refused by the server', "Saved on this device, but the server didn't accept it.");
	await expect(entry(page, 'refused by the server').getByTestId('unsynced')).toHaveText("Couldn't be synced");
	await expect(page.getByTestId('sync-pill')).toHaveText("1 couldn't be synced");

	await page.getByTestId('sync-pill').click();
	const card = page.getByTestId('sync-card');
	await expect(card).toContainText("1 entry couldn't be synced");
	await expect(card).toContainText("The server didn't accept it. It is still saved on this device.");
	await card.getByRole('button', { name: 'Show entry' }).click();
	await expect(page.getByLabel('Note text')).toHaveValue('refused by the server');
	await page.getByRole('button', { name: 'Close' }).click();

	await page.unroute('**/api/records/*');
	await card.getByRole('button', { name: 'Try again' }).click();
	await expect(card).toBeHidden({ timeout: 15_000 });
});
