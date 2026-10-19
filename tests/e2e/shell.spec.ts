import { test, expect } from './fixtures';
import { signUpAndSignIn, unlockWith } from './helpers';

// The app needs an account: each test starts signed in and unlocked (see helpers.ts).

test('today shows a greeting, a friendly empty state and the tab bar', async ({ page, problems }) => {
	await signUpAndSignIn(page);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Good (morning|afternoon|evening)/);
	await expect(page.getByText('A fresh page')).toBeVisible();
	const nav = page.getByRole('navigation', { name: 'Main' });
	await expect(nav.getByRole('link')).toHaveCount(4);
	await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
	await expect(nav.getByRole('button', { name: 'Log something' })).toBeVisible();
	expect(problems).toEqual([]);
});

test('quick-log sheet opens from +, offers eleven tiles, closes with Escape', async ({ page, problems }) => {
	await signUpAndSignIn(page);
	await page.getByRole('button', { name: 'Log something' }).click();
	const sheet = page.getByRole('dialog', { name: 'Log something' });
	await expect(sheet).toBeVisible();
	await expect(sheet.locator('.tile')).toHaveCount(11);
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	expect(problems).toEqual([]);
});

test('tabs navigate and the About text states the intended purpose', async ({ page, problems }) => {
	await signUpAndSignIn(page);
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await expect(page).toHaveURL(/\/me$/);
	await expect(page.getByText(/not a medical device/)).toBeVisible();
	expect(problems).toEqual([]);
});

test('language switch to Danish applies everywhere and persists', async ({ page, problems }) => {
	const user = await signUpAndSignIn(page, '/me');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await expect(page.getByRole('link', { name: 'I dag' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'da');
	await page.reload();
	// The diary is locked after a reload; the Unlock view is already in Danish.
	await expect(page.getByRole('heading', { name: 'Din dagbog er låst' })).toBeVisible();
	await page.getByLabel('Adgangssætning', { exact: true }).fill(user.passphrase);
	await page.getByRole('button', { name: 'Lås op' }).click();
	await expect(page.getByRole('heading', { name: 'Mig' })).toBeVisible({ timeout: 30_000 });
	expect(problems).toEqual([]);
});

test('dark theme can be forced and returns to automatic', async ({ page, problems }) => {
	await signUpAndSignIn(page, '/me');
	await page.getByRole('radio', { name: 'Dark' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByRole('radio', { name: 'Automatic' }).click();
	await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
	expect(problems).toEqual([]);
});

test('the service worker installs and caches the app shell', async ({ page, problems }) => {
	const user = await signUpAndSignIn(page);
	const state = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
	expect(state).toMatch(/activat(ing|ed)/);
	// Reloading with the worker active still lands on the Unlock view (keys never survive a reload).
	await page.reload();
	await unlockWith(page, user.passphrase);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Good (morning|afternoon|evening)/);
	expect(problems).toEqual([]);
});
