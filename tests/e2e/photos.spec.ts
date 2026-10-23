import type { Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from './fixtures';
import { DATA_DIR, signUpAndSignIn, unlockWith } from './helpers';

// Synthetic images only: a PNG painted on a canvas at test time. Nothing is committed.
const PHOTO_ALT = 'Photo attached to this entry';

async function syntheticPng(page: Page, width = 2000, height = 1500) {
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
			ctx.fillStyle = '#a94e2e';
			ctx.fillRect(w! / 8, h! / 8, w! / 5, h! / 6);
			const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
			return Array.from(new Uint8Array(await blob.arrayBuffer()));
		},
		[width, height]
	);
	return Buffer.from(bytes);
}

async function logMealWithPhoto(page: Page, text: string) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal', exact: true }).click();
	await page.getByLabel('What did you have?').fill(text);
	await page
		.getByRole('dialog')
		.locator('input[type=file]')
		.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: await syntheticPng(page) });
	await expect(page.getByRole('dialog').getByRole('img', { name: PHOTO_ALT })).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
}

const blobFiles = (userId: string) => {
	try {
		return readdirSync(resolve(DATA_DIR, 'blobs', userId)).filter((f) => !f.endsWith('.tmp'));
	} catch {
		return [];
	}
};

const thumb = (page: Page) => page.getByRole('button', { name: 'Open photo' }).getByRole('img');
const loaded = (page: Page) =>
	expect
		.poll(() => thumb(page).evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
		.toBeGreaterThan(0);

test('attach a photo to a meal: thumbnail, viewer, reload, opaque on disk, delete removes it', async ({
	page
}) => {
	const user = await signUpAndSignIn(page);
	await logMealWithPhoto(page, 'Synthetic soup');

	// Thumbnail in the timeline, decrypted from the server's ciphertext
	await expect(thumb(page)).toBeVisible();
	await loaded(page);

	// Viewer: the full image, resized to at most 1280 px on its longest side
	await page.getByRole('button', { name: 'Open photo' }).click();
	const viewer = page.getByRole('dialog', { name: 'Photo' });
	const full = viewer.getByRole('img', { name: PHOTO_ALT });
	await expect(full).toBeVisible();
	await expect
		.poll(() => full.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
		.toBe(1280);
	expect(await full.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(960);
	await viewer.getByRole('button', { name: 'Close' }).click();
	await expect(viewer).toBeHidden();

	// Reload and unlock: still there
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(thumb(page)).toBeVisible();
	await loaded(page);

	// Privacy: two blobs (full + thumbnail), neither shows an image header or metadata marker
	const ids = blobFiles(user.userId);
	expect(ids).toHaveLength(2);
	for (const id of ids) {
		const bytes = readFileSync(resolve(DATA_DIR, 'blobs', user.userId, id));
		expect(bytes.length).toBeGreaterThan(64 * 1024);
		expect(bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false); // JPEG
		expect(bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false); // PNG
		for (const marker of ['JFIF', 'Exif', 'IHDR', 'IDAT']) expect(bytes.includes(marker)).toBe(false);
		expect((await page.request.get(`/api/attachments/${id}`)).status()).toBe(200);
	}

	// Deleting the entry deletes its photos after the Undo window
	await page.locator('button.entry').click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByRole('status').getByText('Entry deleted')).toBeVisible();
	for (const id of ids) {
		await expect
			.poll(async () => (await page.request.get(`/api/attachments/${id}`)).status(), {
				timeout: 25_000,
				intervals: [1000]
			})
			.toBe(404);
	}
	expect(blobFiles(user.userId)).toEqual([]);
});

test('Undo of a delete keeps the photo', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	await logMealWithPhoto(page, 'Synthetic toast');
	await loaded(page);
	const ids = blobFiles(user.userId);
	expect(ids).toHaveLength(2);

	await page.locator('button.entry').click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('status').getByText('Entry restored')).toBeVisible();

	// Past the deferred-delete window the blobs are still there and the thumbnail still loads
	await page.waitForTimeout(12_000);
	for (const id of ids) expect((await page.request.get(`/api/attachments/${id}`)).status()).toBe(200);
	await expect(thumb(page)).toBeVisible();
	await loaded(page);
});

test('note photos, remove before saving, limit of four, friendly errors', async ({ page }) => {
	await signUpAndSignIn(page);
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Note', exact: true }).click();
	await page.getByLabel('Note text').fill('Synthetic note with pictures');
	const input = page.getByRole('dialog').locator('input[type=file]');
	const png = await syntheticPng(page, 400, 300);

	// Not an image: friendly message, nothing added
	await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
	await expect(page.getByText('That file is not a picture.')).toBeVisible();

	for (let i = 0; i < 4; i++) {
		await input.setInputFiles({ name: `p${i}.png`, mimeType: 'image/png', buffer: png });
		await expect(page.getByRole('dialog').getByRole('img', { name: PHOTO_ALT })).toHaveCount(i + 1);
	}
	// The add button is gone at four
	await expect(page.getByRole('dialog').locator('input[type=file]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Remove photo 4' }).click();
	await page.getByRole('button', { name: 'Remove photo 3' }).click();
	await expect(page.getByRole('dialog').getByRole('img', { name: PHOTO_ALT })).toHaveCount(2);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status').getByText('Note saved')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole('button', { name: 'Open photo' })).toHaveCount(2);
});
