import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { test, expect } from './fixtures';
import { signUpAndSignIn } from './helpers';

// Synthetic data only. The file is saved through an <a download> link: the share sheet is switched off so every
// browser takes the same path (WebKit lessons in CLAUDE.md: no page.route, no reloads needed here).
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
	});
});

const sheet = (page: Page) => page.getByRole('dialog');
const NOTE = 'Synthetic note, with a comma and "quotes"';

async function logNoteAndWeight(page: Page) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Note', exact: true }).click();
	await page.getByLabel('Note text').fill(NOTE);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(sheet(page)).toBeHidden();

	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Weight', exact: true }).click();
	await page.getByLabel('Value', { exact: true }).fill('72.4');
	await sheet(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
}

async function openExport(page: Page) {
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible();
	await page.getByTestId('export-link').click();
	await expect(page.getByRole('heading', { name: 'Download my data', level: 1 })).toBeVisible();
}

async function prepare(page: Page, passphrase: string) {
	await page.getByRole('button', { name: 'Prepare download' }).click();
	await sheet(page).getByLabel('Passphrase').fill(passphrase);
	await sheet(page).getByRole('button', { name: 'Continue' }).click();
}

test('Your data: asks for the passphrase again, builds the zip on the device and saves it', async ({
	page
}) => {
	const user = await signUpAndSignIn(page);
	await logNoteAndWeight(page);
	await openExport(page);

	// No photos in this diary: the photo choice is off and says why.
	await expect(page.getByRole('switch', { name: 'Include photos' })).toBeDisabled();
	await expect(page.getByText('You have no photos in your diary.')).toBeVisible();
	await expect(page.getByText('The file is not encrypted.')).toBeVisible();

	// A wrong passphrase is refused on the spot; nothing is prepared.
	await prepare(page, 'not the passphrase');
	await expect(sheet(page).getByText("That passphrase doesn't match.")).toBeVisible();
	await expect(page.getByText('Your file is ready')).toHaveCount(0);

	await sheet(page).getByLabel('Passphrase').fill(user.passphrase);
	await sheet(page).getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('export-file')).toContainText(/mydaybook-\d{4}-\d{2}-\d{2}\.zip/);
	await expect(page.getByText('On iPhone, choose Save to Files.')).toBeVisible();

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Save or share' }).click()
	]);
	expect(download.suggestedFilename()).toMatch(/^mydaybook-\d{4}-\d{2}-\d{2}\.zip$/);
	const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
	expect(Object.keys(files).sort()).toEqual([
		'README.txt',
		'measurements.csv',
		'mydaybook.json',
		'notes.csv'
	]);

	const json = JSON.parse(strFromU8(files['mydaybook.json']!));
	expect(json.format).toBe('mydaybook-export');
	expect(json.version).toBe(1);
	expect(json.records).toHaveLength(2);
	const note = json.records.find((r: { payload: { type: string } }) => r.payload.type === 'note');
	expect(note.payload.text).toBe(NOTE);
	expect(note.payload.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

	const notes = strFromU8(files['notes.csv']!);
	// UTF-8 byte order mark (the text decoder drops it, so look at the bytes).
	expect([...files['notes.csv']!.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
	expect(notes).toContain('id,at,text,tags,photos\r\n');
	expect(notes).toContain('"Synthetic note, with a comma and ""quotes"""');
	expect(strFromU8(files['measurements.csv']!)).toContain('Weight,72.4,kg');
	expect(strFromU8(files['README.txt']!)).toContain('NOT encrypted');

	// Done drops the file and goes back to the start.
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByRole('button', { name: 'Prepare download' })).toBeVisible();
});

test('the Delete account card points to the export, and the export can include photos', async ({ page }) => {
	const user = await signUpAndSignIn(page);
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: 'Meal', exact: true }).click();
	await page.getByLabel('What did you have?').fill('Synthetic porridge');
	const png = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 400;
		canvas.height = 300;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#e8c9a8';
		ctx.fillRect(0, 0, 400, 300);
		const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
		return Array.from(new Uint8Array(await blob.arrayBuffer()));
	});
	await sheet(page)
		.locator('input[type=file]')
		.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png) });
	await expect(sheet(page).getByRole('img', { name: 'Photo attached to this entry' })).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(sheet(page)).toBeHidden();

	await page.getByRole('link', { name: 'Me', exact: true }).click();
	const danger = page.locator('.danger');
	await expect(danger.getByText('Download a copy of your diary first.')).toBeVisible();
	await danger.getByRole('link', { name: 'Download my data' }).click();
	await expect(page.getByRole('heading', { name: 'Download my data', level: 1 })).toBeVisible();

	await expect(page.getByText(/Your photo \(about/)).toBeVisible();
	const toggle = page.getByRole('switch', { name: 'Include photos' });
	await expect(toggle).toHaveAttribute('aria-checked', 'true');

	await prepare(page, user.passphrase);
	await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible({ timeout: 30_000 });
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Save or share' }).click()
	]);
	const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
	const photos = Object.keys(files).filter((f) => f.startsWith('photos/'));
	expect(photos).toHaveLength(1);
	expect(photos[0]).toMatch(/^photos\/\d{4}-\d{2}-\d{2}_\d{4}_[0-9a-f]{8}\.jpg$/);
	// A real JPEG came out of the encrypted blob.
	expect([...files[photos[0]!]!.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
	expect(strFromU8(files['meals.csv']!)).toContain(photos[0]!);
	expect(JSON.stringify(JSON.parse(strFromU8(files['mydaybook.json']!)))).toContain(photos[0]!);
});
