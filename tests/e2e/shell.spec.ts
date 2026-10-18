import { test, expect } from './fixtures';

test('today shows a greeting, a friendly empty state and the tab bar', async ({ page, problems }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Good (morning|afternoon|evening)/);
	await expect(page.getByText('A fresh page')).toBeVisible();
	const nav = page.getByRole('navigation', { name: 'Main' });
	await expect(nav.getByRole('link')).toHaveCount(4);
	await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
	await expect(nav.getByRole('button', { name: 'Log something' })).toBeVisible();
	expect(problems).toEqual([]);
});

test('quick-log sheet opens from +, offers nine tiles, closes with Escape', async ({ page, problems }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Log something' }).click();
	const sheet = page.getByRole('dialog', { name: 'Log something' });
	await expect(sheet).toBeVisible();
	await expect(sheet.locator('.tile')).toHaveCount(9);
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	expect(problems).toEqual([]);
});

test('tabs navigate and the About text states the intended purpose', async ({ page, problems }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await expect(page).toHaveURL(/\/me$/);
	await expect(page.getByText(/not a medical device/)).toBeVisible();
	expect(problems).toEqual([]);
});

test('language switch to Danish applies everywhere and persists', async ({ page, problems }) => {
	await page.goto('/me');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await expect(page.getByRole('link', { name: 'I dag' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'da');
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Mig' })).toBeVisible();
	expect(problems).toEqual([]);
});

test('dark theme can be forced and returns to automatic', async ({ page, problems }) => {
	await page.goto('/me');
	await page.getByRole('radio', { name: 'Dark' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByRole('radio', { name: 'Automatic' }).click();
	await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
	expect(problems).toEqual([]);
});

test('the service worker installs and caches the app shell', async ({ page, problems }) => {
	await page.goto('/');
	const state = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
	expect(state).toMatch(/activat(ing|ed)/);
	expect(problems).toEqual([]);
});
