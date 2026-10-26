import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { endpointOf, stubPush } from './push-stub';
import { signUpAndSignIn, unlockWith } from './helpers';

// Synthetic images only: a PNG painted on a canvas at test time. Offline photos (M8 branch 3): a photo added without
// a connection is encrypted and kept on the device, shows "Waiting to upload", and is uploaded before its entry.
// The service worker is blocked so the same code runs in WebKit, where `page.route` and offline mode only work then.
test.use({ serviceWorkers: 'block' });

const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const sheet = (page: Page) => page.getByRole('dialog');
const entry = (page: Page, text: string) => timeline(page).locator('li').filter({ hasText: text });
const QUEUED = "Saved on this device. It will sync when you're back online.";

async function setOffline(page: Page, offline: boolean) {
	await page.context().setOffline(offline);
	await page.evaluate((o) => window.dispatchEvent(new Event(o ? 'offline' : 'online')), offline);
}

async function syntheticPng(page: Page, width = 800, height = 600) {
	const bytes = await page.evaluate(
		async ([w, h]) => {
			const canvas = document.createElement('canvas');
			canvas.width = w!;
			canvas.height = h!;
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = '#e8c9a8';
			ctx.fillRect(0, 0, w!, h!);
			ctx.fillStyle = '#6b8f71';
			ctx.beginPath();
			ctx.arc(w! / 2, h! / 2, h! / 3, 0, Math.PI * 2);
			ctx.fill();
			const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
			return Array.from(new Uint8Array(await blob.arrayBuffer()));
		},
		[width, height]
	);
	return Buffer.from(bytes);
}

/** Opens the meal sheet, types the text and picks a synthetic photo. Does not save. */
async function mealWithPhoto(page: Page, text: string, png?: Buffer) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal', exact: true }).click();
	await page.getByLabel('What did you have?').fill(text);
	await sheet(page)
		.locator('input[type=file]')
		.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png ?? (await syntheticPng(page)) });
	await expect(sheet(page).getByRole('img', { name: 'Photo attached to this entry' })).toBeVisible();
}

async function save(page: Page, toast: string) {
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(toast, { exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(sheet(page)).toBeHidden();
}

const thumb = (page: Page) => page.getByRole('button', { name: 'Open photo' }).getByRole('img');
const loaded = (page: Page) =>
	expect
		.poll(() => thumb(page).evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
		.toBeGreaterThan(0);

async function reopen(page: Page, passphrase: string) {
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, passphrase);
}

test('a photo added offline waits encrypted on the device and is uploaded with its entry', async ({
	page
}) => {
	await stubPush(page, endpointOf());
	const user = await signUpAndSignIn(page);
	// Painted before going offline: WebKit can't read a canvas blob without a connection.
	const png = await syntheticPng(page);
	await setOffline(page, true);

	await mealWithPhoto(page, 'Porridge with a photo', png);
	// In the sheet the picked photo already says it will wait.
	await expect(sheet(page).getByTestId('photo-queued')).toHaveText('Waiting to upload');
	await save(page, QUEUED);

	const row = entry(page, 'Porridge with a photo');
	await expect(row.getByTestId('unsynced')).toHaveText('Not synced yet');
	await expect(row.getByTestId('photo-queued')).toHaveText('Waiting to upload');
	await expect(row.getByRole('button', { name: 'Open photo' }).getByRole('img')).toBeVisible();
	await loaded(page);

	// The full photo opens from the local ciphertext, too.
	await row.getByRole('button', { name: 'Open photo' }).click();
	const viewer = page.getByRole('dialog', { name: 'Photo' });
	await expect
		.poll(() => viewer.getByRole('img').evaluate((el) => (el as HTMLImageElement).naturalWidth), {
			timeout: 15_000
		})
		.toBeGreaterThan(0);
	await viewer.getByRole('button', { name: 'Close' }).click();

	const uploads: string[] = [];
	page.on('request', (req) => {
		if (req.method() === 'PUT' && req.url().includes('/api/'))
			uploads.push(req.url().includes('/api/attachments/') ? 'blob' : 'row');
	});
	await setOffline(page, false);
	await expect(page.getByText('All synced', { exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('photo-queued')).toHaveCount(0);
	await expect(page.getByTestId('unsynced')).toHaveCount(0);
	// Both blobs (image, thumbnail) went before the entry.
	expect(uploads.indexOf('row')).toBe(2);
	expect(uploads.slice(0, 2)).toEqual(['blob', 'blob']);

	// After a reload the photo comes from the server.
	await reopen(page, user.passphrase);
	await expect(entry(page, 'Porridge with a photo')).toBeVisible({ timeout: 15_000 });
	await loaded(page);
	await expect(page.getByTestId('photo-queued')).toHaveCount(0);
});

test('an entry whose photo is on the server shows a calm placeholder offline', async ({ page }) => {
	await stubPush(page, endpointOf());
	const user = await signUpAndSignIn(page);
	await mealWithPhoto(page, 'Soup with a saved photo');
	await save(page, 'Saved');
	await loaded(page);

	// Reload with the photo downloads failing, as they do without a connection.
	await page.route('**/api/attachments/*', (route) => route.abort());
	await reopen(page, user.passphrase);
	const row = entry(page, 'Soup with a saved photo');
	await expect(row.getByTestId('photo-offline-tile')).toBeVisible({ timeout: 15_000 });
	await expect(row.getByTestId('photo-offline-tile')).toHaveAttribute(
		'aria-label',
		"Photo shows when you're online"
	);
	await expect(row.getByText("Saved photos show when you're online.")).toBeVisible();
	await expect(page.getByText("Couldn't load the photo.")).toHaveCount(0);

	// The connection is back: the photo loads by itself.
	await page.unroute('**/api/attachments/*');
	await setOffline(page, false);
	await loaded(page);
	await expect(row.getByTestId('photo-offline-tile')).toHaveCount(0);
});

test('a photo the server refuses is shown on the Sync card and can be tried again', async ({ page }) => {
	await stubPush(page, endpointOf());
	await signUpAndSignIn(page);
	const png = await syntheticPng(page);
	await setOffline(page, true);
	await mealWithPhoto(page, 'Toast with a refused photo', png);
	await save(page, QUEUED);

	await page.route('**/api/attachments/*', (route) =>
		route.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"too_large"}' })
	);
	await setOffline(page, false);
	// The entry itself is not held back.
	await expect(page.getByTestId('unsynced')).toHaveCount(0, { timeout: 15_000 });
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	const card = page.getByTestId('sync-card');
	await expect(card).toContainText("1 photo couldn't be uploaded");

	await page.unroute('**/api/attachments/*');
	await card.getByRole('button', { name: 'Try again' }).click();
	await expect(card).toBeHidden({ timeout: 15_000 });
});
