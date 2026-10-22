import { test, type Page } from '@playwright/test';
import { previousStepCode } from './totp-code';
import { addMedWithReminder, endpointOf, stubPush } from './push-stub';
import {
	ORIGIN,
	createInvite,
	newPassphrase,
	newUsername,
	postJson,
	signUpAndSignIn,
	signUpApiAccount,
	signUpViaApi,
	unlockWith
} from './helpers';

// Phone-width screenshots for PRs (CLAUDE.md "How to work"): 375 x 812 at 2x, light and dark.
// Opt-in: SCREENSHOTS=<folder name> npx playwright test screenshots --project=phone-chromium
const folder = process.env.SCREENSHOTS;
test.skip(!folder, 'set SCREENSHOTS=<name> to capture');
// Only so full-page captures can pin the fixed tab bar to the bottom; never used in functional tests.
test.use({ bypassCSP: true });

type Scheme = 'light' | 'dark';

async function snap(page: Page, name: string, scheme: Scheme, fullPage = false) {
	await page.waitForLoadState('networkidle');
	if (fullPage)
		await page.addStyleTag({
			content: 'nav.tabbar{position:static !important}main.page{padding-bottom:24px !important}'
		});
	await page.screenshot({ path: `docs/screenshots/${folder}/${name}-${scheme}.png`, fullPage });
}

const prepare = (page: Page, scheme: Scheme) =>
	page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });

for (const scheme of ['light', 'dark'] as const) {
	test.describe(scheme, () => {
		test(`today and quick-log ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			await snap(page, 'today', scheme);
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.waitForTimeout(400);
			await snap(page, 'quicklog', scheme);
		});

		test(`today with entries and note sheet ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			const notes = [
				'Slept well, woke up rested',
				'Short walk after lunch, knee felt fine',
				'Remember to book a check-up'
			];
			for (const text of notes) {
				await page.getByRole('button', { name: 'Log something' }).click();
				await page.getByRole('button', { name: 'Note', exact: true }).click();
				await page.getByLabel('Note text').fill(text);
				await page.getByRole('button', { name: 'Save' }).click();
				await page.getByText('Note saved').waitFor();
			}
			await page.getByText(notes[2]!).waitFor();
			await snap(page, 'today-with-entries', scheme);
			await page.getByText(notes[0]!).click();
			await page.waitForTimeout(400);
			await snap(page, 'note-sheet', scheme);
		});

		test(`log body sheets and today ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'log-body', 'log-body screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			const open = async (tile: string) => {
				await page.getByRole('button', { name: 'Log something' }).click();
				await page.getByRole('button', { name: tile, exact: true }).click();
				await page.waitForTimeout(400);
			};
			const sheet = page.getByRole('dialog');
			const save = async () => {
				await sheet.getByRole('button', { name: 'Save', exact: true }).click();
				await page.getByRole('status').getByText('Saved', { exact: true }).waitFor();
			};

			// Sleep (usual times, quality and one awakening)
			await open('Sleep');
			await sheet
				.getByRole('radiogroup', { name: 'How did you sleep?' })
				.getByRole('radio', { name: '4/5' })
				.click();
			await sheet
				.getByRole('radiogroup', { name: 'Woke up during the night' })
				.getByRole('radio', { name: '1' })
				.click();
			await snap(page, 'sheet-sleep', scheme);
			await save();

			// Weight
			await open('Weight');
			await sheet.getByLabel('Value', { exact: true }).fill('72.4');
			await sheet.getByRole('button', { name: 'Morning', exact: true }).click();
			await sheet.getByRole('button', { name: 'Before breakfast' }).click();
			await snap(page, 'sheet-weight', scheme);
			await save();

			// Bowel
			await open('Bowel');
			await sheet.getByRole('radio', { name: 'Type 4, Smooth' }).click();
			await snap(page, 'sheet-bowel', scheme);
			await save();

			// Feeling
			await open('Feeling');
			await sheet.getByRole('radiogroup', { name: 'Mood' }).getByRole('radio', { name: '4/5' }).click();
			await sheet.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: '3/5' }).click();
			await sheet.getByRole('radiogroup', { name: 'Stress' }).getByRole('radio', { name: '2/5' }).click();
			await sheet.getByRole('button', { name: 'New', exact: true }).click();
			await sheet.getByLabel('Name of the new tag').fill('Headache');
			await sheet.getByRole('button', { name: 'Add', exact: true }).click();
			await sheet.getByRole('button', { name: 'Headache: strength 2 of 3' }).click();
			await snap(page, 'sheet-feeling', scheme);
			await save();

			await page.getByText('Mood 4 · Energy 3 · Stress 2 · Headache (2)').waitFor();
			await snap(page, 'today-mixed', scheme);

			// A custom measurement type with two values
			await open('Measure');
			await sheet.getByRole('button', { name: 'New type' }).click();
			await sheet.getByLabel('Name, for example Blood pressure').fill('Blood pressure');
			await sheet.getByLabel('Unit, for example mmHg').fill('mmHg');
			await sheet
				.getByRole('radiogroup', { name: 'Number of values' })
				.getByRole('radio', { name: '2' })
				.click();
			await sheet.getByRole('radiogroup', { name: 'Decimals' }).getByRole('radio', { name: '0' }).click();
			await sheet.getByRole('button', { name: 'Add this type' }).click();
			await sheet.getByLabel('Value 1').fill('120');
			await sheet.getByLabel('Value 2').fill('80');
			await snap(page, 'sheet-measure-two-values', scheme);
		});

		test(`log meals watch list, sheet and today ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'log-meals', 'log-meals screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/me');
			await page.getByRole('heading', { name: 'What I watch in food' }).waitFor();
			for (const name of ['Gluten', 'Lactose', 'FODMAP', 'Peanuts'])
				await page.getByRole('button', { name, exact: true }).click();
			await page.getByRole('button', { name: 'Remove Peanuts' }).click();
			await page.getByText('Peanuts removed from your list').waitFor();
			await page.getByRole('heading', { name: 'What I watch in food' }).scrollIntoViewIfNeeded();
			await snap(page, 'watch-list', scheme);

			await page.getByRole('link', { name: 'Today', exact: true }).click();
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Meal', exact: true }).click();
			await page.waitForTimeout(400);
			const sheet = page.getByRole('dialog');
			await sheet.getByRole('button', { name: 'Breakfast', exact: true }).click();
			await sheet.getByLabel('What did you have?').fill('Oatmeal with berries and yoghurt');
			await sheet
				.getByRole('radiogroup', { name: 'Gluten' })
				.getByRole('radio', { name: 'No', exact: true })
				.click();
			await sheet.getByRole('radiogroup', { name: 'Lactose' }).getByRole('radio', { name: 'Yes' }).click();
			await sheet
				.getByRole('radiogroup', { name: 'FODMAP' })
				.getByRole('radio', { name: 'Not sure' })
				.click();
			await sheet.getByRole('button', { name: 'Home', exact: true }).click();
			await sheet.getByRole('switch', { name: 'Save as a meal I eat often' }).click();
			await snap(page, 'sheet-meal', scheme);
			await sheet.getByRole('button', { name: 'Save', exact: true }).click();
			await page.getByText('Contains lactose').waitFor();

			// A second meal, filled in with one tap from the saved meal row
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Meal', exact: true }).click();
			await page.waitForTimeout(400);
			await snap(page, 'sheet-meal-saved', scheme);
			await sheet.getByRole('button', { name: 'Close' }).click();
			await page.waitForTimeout(300);
			await snap(page, 'today-meal', scheme);
		});

		test(`log gut quick-log, sheet and today ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'log-gut', 'log-gut screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.waitForTimeout(400);
			await snap(page, 'quicklog', scheme);
			await page.getByRole('button', { name: 'Nausea / heartburn', exact: true }).click();
			await page.waitForTimeout(400);
			const sheet = page.getByRole('dialog');
			await sheet.getByRole('button', { name: 'Nausea', exact: true }).click();
			await sheet
				.getByRole('radiogroup', { name: 'Nausea, how strong' })
				.getByRole('radio', { name: '3/5' })
				.click();
			await sheet.getByRole('button', { name: 'Heartburn', exact: true }).click();
			await sheet
				.getByRole('radiogroup', { name: 'Heartburn, how strong' })
				.getByRole('radio', { name: '2/5' })
				.click();
			await sheet.getByRole('button', { name: 'After a meal', exact: true }).click();
			await snap(page, 'sheet-gut', scheme);
			await sheet.getByRole('button', { name: 'Save', exact: true }).click();
			await page.getByText('Nausea 3/5 · Heartburn 2/5').waitFor();
			await page.waitForTimeout(300);
			await snap(page, 'today-gut', scheme);
		});

		test(`fluids sheet, preset editor and today ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'fluids', 'fluids screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			const sheet = page.getByRole('dialog');
			const open = async () => {
				await page.getByRole('button', { name: 'Log something' }).click();
				await page.getByRole('button', { name: 'Drink', exact: true }).click();
				await page.waitForTimeout(400);
			};
			const save = async () => {
				await sheet.getByRole('button', { name: 'Save', exact: true }).click();
				await page.getByRole('status').getByText('Saved', { exact: true }).waitFor();
				await page.waitForTimeout(300);
			};
			await open();
			await save();
			await open();
			await sheet.getByRole('button', { name: 'Coffee', exact: true }).click();
			await save();
			await open();
			await sheet.getByRole('button', { name: 'Wine', exact: true }).click();
			await sheet.getByRole('button', { name: 'One more' }).click();
			await snap(page, 'sheet-drink', scheme);
			await save();
			await page.locator('#main').getByText('Drinks today: 75 cl').waitFor();
			await snap(page, 'today-drinks', scheme);

			await open();
			await sheet.getByRole('button', { name: 'Own amount' }).click();
			await sheet.getByLabel('Amount in cl', { exact: true }).fill('12');
			await snap(page, 'sheet-drink-amount', scheme);
			await sheet.getByRole('button', { name: 'Edit', exact: true }).click();
			await page.waitForTimeout(400);
			await snap(page, 'presets-drinks', scheme);
			const editor = page.getByRole('dialog', { name: 'Drinks and sizes' });
			await editor.getByRole('heading', { name: 'Sizes', exact: true }).scrollIntoViewIfNeeded();
			await page.waitForTimeout(200);
			await snap(page, 'presets-sizes', scheme);
		});

		test(`body map entry sheet, same as last time and today ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'bodymap-entry', 'bodymap-entry screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			const open = async () => {
				await page.getByRole('button', { name: 'Log something' }).click();
				await page.getByRole('button', { name: 'Pain', exact: true }).click();
				await page.waitForTimeout(400);
			};
			const intensity = (n: number) =>
				sheet
					.getByRole('radiogroup', { name: /^Intensity/ })
					.getByRole('radio', { name: String(n), exact: true })
					.click();
			const region = (name: string) =>
				sheet.locator('svg[role=group]').getByRole('button', { name, exact: true }).click();
			await open();
			await snap(page, 'sheet-empty', scheme);
			await region('Your left shoulder');
			await intensity(3);
			await region('Your right knee');
			await intensity(6);
			await sheet.getByRole('button', { name: 'Aching', exact: true }).click();
			await sheet.getByRole('button', { name: 'Throbbing', exact: true }).click();
			await page.waitForTimeout(300);
			await snap(page, 'sheet-bodymap', scheme);
			await sheet.getByRole('button', { name: 'Find', exact: true }).click();
			await sheet.getByLabel('Find a body part').fill('knee');
			await snap(page, 'sheet-find', scheme);
			await sheet.getByRole('button', { name: 'Back to the body map' }).click();
			await sheet.getByRole('button', { name: 'Save 2 points' }).click();
			await page.getByText('Your left shoulder 3 · Your right knee 6').waitFor();
			await page
				.getByRole('status')
				.getByText('Saved', { exact: true })
				.waitFor({ state: 'hidden', timeout: 15_000 });
			await page.waitForTimeout(300);
			await snap(page, 'today-bodymap', scheme);
			await open();
			await snap(page, 'sheet-same', scheme);
		});

		test(`headache details ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'headache-details', 'headache-details screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Pain', exact: true }).click();
			await sheet.getByRole('button', { name: 'Head, close-up', exact: true }).click();
			await sheet
				.locator('svg[role=group]')
				.getByRole('button', { name: 'Your left temple', exact: true })
				.click();
			await sheet
				.getByRole('radiogroup', { name: /^Intensity/ })
				.getByRole('radio', { name: '6', exact: true })
				.click();
			await sheet.getByRole('button', { name: 'Throbbing', exact: true }).click();
			await sheet.getByRole('button', { name: 'Constant', exact: true }).click();
			await page.waitForTimeout(300);
			await snap(page, 'sheet-zones', scheme);
			await sheet.getByLabel('Hour Started').selectOption('22');
			await sheet.getByLabel('Hour Stopped').selectOption('02');
			await sheet.getByRole('button', { name: 'Vision', exact: true }).click();
			await sheet
				.getByRole('group', { name: 'Sensitive to light?' })
				.getByRole('button', { name: 'Yes' })
				.click();
			await sheet.getByLabel('Possible trigger').fill('Skipped lunch');
			await sheet.getByLabel('Possible trigger').scrollIntoViewIfNeeded();
			await page.waitForTimeout(300);
			await snap(page, 'sheet-headache', scheme);
		});

		test(`head zones ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'head-zones', 'head-zones screenshots only');
			// Taller than the usual 812 px so that the whole head shows above the pinned panel (width stays 375).
			await page.setViewportSize({ width: 375, height: 1150 });
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			const region = (name: string) =>
				sheet.locator('svg[role=group]').getByRole('button', { name, exact: true }).click();
			const wider = (name: string) =>
				sheet
					.getByRole('group', { name: 'How wide an area' })
					.getByRole('button', { name, exact: true })
					.click();
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Pain', exact: true }).click();
			await page.waitForTimeout(400);
			await sheet.getByRole('button', { name: 'Head, close-up' }).click();
			await page.waitForTimeout(300);
			// Empty: to judge the faint features.
			await snap(page, 'front-empty', scheme);
			await region('Your right temple');
			await sheet
				.getByRole('radiogroup', { name: /^Intensity/ })
				.getByRole('radio', { name: '5', exact: true })
				.click();
			await page.waitForTimeout(300);
			await snap(page, 'front-temple', scheme);
			await wider('Front of this side');
			await page.waitForTimeout(300);
			await snap(page, 'front-of-side', scheme);
			await wider('This side');
			await page.waitForTimeout(300);
			await snap(page, 'this-side', scheme);
			await sheet.getByRole('radio', { name: 'Back', exact: true }).click();
			await region('Back of the left side of your head');
			await sheet
				.getByRole('radiogroup', { name: /^Intensity/ })
				.getByRole('radio', { name: '3', exact: true })
				.click();
			await wider('Band around the head');
			await page.waitForTimeout(300);
			await snap(page, 'back-band', scheme);
			// The same band seen from the front.
			await sheet.getByRole('radio', { name: 'Front', exact: true }).click();
			await page.waitForTimeout(300);
			await snap(page, 'front-band', scheme);
		});

		test(`body map close-ups and wider areas ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'bodymap-zoom', 'bodymap-zoom screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			const intensity = (n: number) =>
				sheet
					.getByRole('radiogroup', { name: /^Intensity/ })
					.getByRole('radio', { name: String(n), exact: true })
					.click();
			const region = (name: string) =>
				sheet.locator('svg[role=group]').getByRole('button', { name, exact: true }).click();
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Pain', exact: true }).click();
			await page.waitForTimeout(400);
			const back = () => sheet.getByRole('button', { name: 'Back to the body' }).click();
			// The close-ups as they open, before any point is chosen.
			await sheet.getByRole('button', { name: 'Head, close-up' }).click();
			await page.waitForTimeout(300);
			await snap(page, 'head', scheme);
			await back();
			await sheet.getByRole('button', { name: 'Hands, close-up' }).click();
			await page.waitForTimeout(300);
			await snap(page, 'hand', scheme);
			await sheet.getByRole('radio', { name: 'Back', exact: true }).click();
			await page.waitForTimeout(300);
			await snap(page, 'hand-back', scheme);
			await back();
			await sheet.getByRole('button', { name: 'Feet, close-up' }).click();
			await page.waitForTimeout(300);
			await snap(page, 'foot-top', scheme);
			await sheet.getByRole('radio', { name: 'Sole', exact: true }).click();
			await page.waitForTimeout(300);
			await snap(page, 'foot-sole', scheme);
			await back();
			// With points.
			await sheet.getByRole('button', { name: 'Head, close-up' }).click();
			await region('Your left temple');
			await intensity(4);
			await page.waitForTimeout(300);
			await snap(page, 'head-point', scheme);
			await back();
			await sheet.getByRole('button', { name: 'Hands, close-up' }).click();
			await region('Your right index finger');
			await intensity(6);
			await page.waitForTimeout(300);
			await snap(page, 'hand-point', scheme);
			await back();
			// The close-up buttons carry a count of the points in them.
			await page.waitForTimeout(300);
			await snap(page, 'main-with-closeups', scheme);
			await region('Your left upper belly');
			await intensity(5);
			await sheet
				.getByRole('group', { name: 'How wide an area' })
				.getByRole('button', { name: 'Whole belly', exact: true })
				.click();
			await page.waitForTimeout(400);
			await snap(page, 'belly-whole', scheme);
		});

		test(`photos meal sheet, timeline and viewer ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'photos', 'photos screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			// Synthetic pictures painted at test time (nothing real).
			const png = async (hue: number) =>
				Buffer.from(
					await page.evaluate(async (h) => {
						const c = document.createElement('canvas');
						c.width = 1200;
						c.height = 900;
						const x = c.getContext('2d')!;
						const g = x.createLinearGradient(0, 0, 1200, 900);
						g.addColorStop(0, `hsl(${h} 60% 75%)`);
						g.addColorStop(1, `hsl(${h + 50} 55% 45%)`);
						x.fillStyle = g;
						x.fillRect(0, 0, 1200, 900);
						x.fillStyle = `hsl(${h + 20} 50% 92%)`;
						x.beginPath();
						x.arc(600, 450, 260, 0, Math.PI * 2);
						x.fill();
						const b = await new Promise<Blob>((r) => c.toBlob((v) => r(v!), 'image/png'));
						return Array.from(new Uint8Array(await b.arrayBuffer()));
					}, hue)
				);
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Meal', exact: true }).click();
			await page.waitForTimeout(400);
			const sheet = page.getByRole('dialog');
			await sheet.getByLabel('What did you have?').fill('Tomato soup with bread');
			const input = sheet.locator('input[type=file]');
			await input.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: await png(20) });
			await sheet.getByRole('img', { name: 'Photo attached to this entry' }).waitFor();
			await input.setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: await png(140) });
			await sheet.getByRole('img', { name: 'Photo attached to this entry' }).nth(1).waitFor();
			await sheet.getByRole('button', { name: 'Remove photo 2' }).scrollIntoViewIfNeeded();
			await snap(page, 'sheet-meal-photos', scheme);
			await sheet.getByRole('button', { name: 'Save', exact: true }).click();
			await page.getByRole('button', { name: 'Open photo' }).first().waitFor();
			await page.waitForFunction(() =>
				Array.from(document.querySelectorAll('button[aria-label="Open photo"] img')).every(
					(i) => (i as HTMLImageElement).naturalWidth > 0
				)
			);
			await page.waitForTimeout(300);
			await snap(page, 'today-photos', scheme);
			await page.getByRole('button', { name: 'Open photo' }).first().click();
			await page.getByRole('dialog', { name: 'Photo' }).getByRole('img').waitFor();
			await snap(page, 'viewer', scheme);
		});

		test(`medication list and set-up sheets ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'medication', 'medication screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/meds');
			await page.getByText('No medication yet').waitFor();
			await snap(page, 'meds-empty', scheme);

			const sheet = page.getByRole('dialog', { name: /medication/i });
			const add = async (name: string) => {
				await page.getByRole('button', { name: 'Add medication' }).click();
				await page.waitForTimeout(400);
				await sheet.getByLabel('Name', { exact: true }).fill(name);
			};
			const save = async () => {
				await sheet.getByRole('button', { name: 'Save', exact: true }).click();
				await page.getByRole('status').getByText('Saved', { exact: true }).waitFor();
				await sheet.waitFor({ state: 'hidden' });
			};

			// Every day, two times: the sheet is captured before saving.
			await add('Vitamin D');
			await sheet.getByLabel('Strength', { exact: true }).fill('20');
			await sheet.getByLabel('Unit', { exact: true }).selectOption('µg');
			await sheet.getByLabel('Amount 1', { exact: true }).fill('1 tablet');
			await sheet.getByRole('button', { name: 'Add a time' }).click();
			await sheet.getByLabel('Time 2', { exact: true }).fill('08:00');
			await sheet.getByText('This time is already listed').scrollIntoViewIfNeeded();
			await snap(page, 'sheet-duplicate-time', scheme);
			await sheet.getByLabel('Time 2', { exact: true }).fill('20:00');
			await sheet.getByLabel('Amount 2', { exact: true }).fill('1 tablet');
			await snap(page, 'sheet-daily', scheme);
			await save();

			await add('Iron');
			await sheet.getByLabel('Strength', { exact: true }).fill('14');
			await sheet.getByLabel('Unit', { exact: true }).selectOption('mg');
			await sheet.getByRole('radio', { name: 'Some weekdays' }).click();
			for (const d of ['Mon', 'Wed', 'Fri'])
				await sheet.getByRole('button', { name: d, exact: true }).click();
			await sheet.getByLabel('Amount 1', { exact: true }).fill('1 capsule');
			await snap(page, 'sheet-weekdays', scheme);
			await save();

			await add('Magnesium');
			await sheet.getByRole('button', { name: 'Sachet (powder)', exact: true }).click();
			await sheet.getByRole('radio', { name: 'Every few days' }).click();
			await sheet.getByRole('button', { name: 'One day more' }).click();
			await sheet.getByLabel('Amount 1', { exact: true }).fill('1 sachet');
			await save();

			await add('Throat spray');
			await sheet.getByRole('button', { name: 'Spray', exact: true }).click();
			await sheet.getByRole('radio', { name: 'When needed' }).click();
			await save();

			await add('Old antihistamine');
			await save();
			// The list row, not the same name in the Today card above it.
			await page.getByRole('list', { name: 'Medication' }).getByText('Old antihistamine').click();
			await page.waitForTimeout(400);
			await sheet.getByRole('button', { name: 'Archive', exact: true }).click();
			await page.getByRole('status').getByText('Medication archived').waitFor();
			await page.waitForTimeout(300);
			await snap(page, 'meds-list', scheme);
		});

		test(`doses on today, meds and timeline ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'doses', 'doses screenshots only');
			test.setTimeout(120_000);
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/meds');
			const sheet = page.getByRole('dialog', { name: /medication/i });
			const add = async (name: string, options: { time?: string; asNeeded?: boolean } = {}) => {
				// The page grows with the list; scroll the Add button clear of the fixed tab bar before tapping it.
				await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
				await page.getByRole('button', { name: 'Add medication' }).click();
				await page.waitForTimeout(300);
				await sheet.getByLabel('Name', { exact: true }).fill(name);
				if (options.asNeeded) await sheet.getByRole('radio', { name: 'When needed' }).click();
				else {
					if (options.time) await sheet.getByLabel('Time 1', { exact: true }).fill(options.time);
					await sheet.getByLabel('Amount 1', { exact: true }).fill('1 tablet');
				}
				await sheet.getByRole('button', { name: 'Save', exact: true }).click();
				await page.getByRole('status').getByText('Saved', { exact: true }).waitFor();
				await sheet.waitFor({ state: 'hidden' });
				// The toast covers the Add button at the end of the page until it goes away.
				await page.getByRole('status').getByText('Saved', { exact: true }).waitFor({ state: 'hidden' });
			};
			await add('Vitamin D');
			await add('Magnesium');
			await add('Iron', { time: '13:00' });
			await add('Zinc', { time: '20:00' });
			await add('Calcium', { time: '20:00' });
			await add('Throat spray', { asNeeded: true });

			const due = page.getByRole('region', { name: "Today's medication" });
			await due.getByRole('button', { name: 'All taken at 08:00' }).click();
			await due.locator('.pill.taken').first().waitFor();
			await due.getByRole('button', { name: /^Iron/ }).click();
			const dose = page.getByRole('dialog', { name: 'Iron' });
			await page.waitForTimeout(400);
			await dose.getByRole('radio', { name: 'Taken late' }).click();
			const day = await page.evaluate(() => {
				const d = new Date();
				const p = (n: number) => String(n).padStart(2, '0');
				return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
			});
			await dose.getByLabel('When did you take it?').fill(`${day}T13:40`);
			await snap(page, 'dose-sheet', scheme);
			await dose.getByRole('button', { name: 'Save', exact: true }).click();
			await dose.waitFor({ state: 'hidden' });
			await page.getByRole('status').getByText('Saved', { exact: true }).waitFor({ state: 'hidden' });
			await page.waitForTimeout(300);
			await snap(page, 'meds-today', scheme);

			await page.getByRole('link', { name: 'Today', exact: true }).click();
			await due.waitFor();
			await page.waitForTimeout(300);
			await snap(page, 'today-due', scheme);
			await snap(page, 'today-timeline', scheme, true);
		});

		test(`dose edit and meds edit ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'dose-edit', 'dose-edit screenshots only');
			test.setTimeout(120_000);
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/meds');
			const sheet = page.getByRole('dialog', { name: /medication/i });
			const saved = page.getByRole('status').getByText('Saved', { exact: true });
			const add = async (name: string, asNeeded = false) => {
				await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
				await page.getByRole('button', { name: 'Add medication' }).click();
				await page.waitForTimeout(300);
				await sheet.getByLabel('Name', { exact: true }).fill(name);
				if (asNeeded) await sheet.getByRole('radio', { name: 'When needed' }).click();
				else await sheet.getByLabel('Amount 1', { exact: true }).fill('1 tablet');
				await sheet.getByRole('button', { name: 'Save', exact: true }).click();
				await saved.waitFor();
				await sheet.waitFor({ state: 'hidden' });
				await saved.waitFor({ state: 'hidden' });
			};
			await add('Vitamin D');
			await add('Throat spray', true);
			await add('Nasal spray', true);
			const day = await page.evaluate(() => {
				const d = new Date();
				const p = (n: number) => String(n).padStart(2, '0');
				return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
			});

			const due = page.getByRole('region', { name: "Today's medication" });
			await due.getByRole('button', { name: 'Mark Vitamin D as taken' }).click();
			await due.locator('.pill.taken').first().waitFor();
			await due.locator('.pill.taken').first().click();
			const dose = page.getByRole('dialog', { name: 'Vitamin D' });
			await page.waitForTimeout(400);
			await dose.getByLabel('When did you take it?').fill(`${day}T07:12`);
			await snap(page, 'dose-taken-time', scheme);
			await dose.getByRole('button', { name: 'Save', exact: true }).click();
			await dose.waitFor({ state: 'hidden' });
			await saved.waitFor({ state: 'hidden' });

			await due.getByRole('button', { name: 'Log a dose of Throat spray' }).click();
			const asNeeded = page.getByRole('dialog', { name: 'Log a dose' });
			await asNeeded.getByLabel('Amount', { exact: false }).fill('2 puffs');
			await asNeeded.getByRole('button', { name: 'Save', exact: true }).click();
			await asNeeded.waitFor({ state: 'hidden' });
			await saved.waitFor({ state: 'hidden' });
			await page.getByRole('link', { name: 'Today', exact: true }).click();
			await page.getByText('Throat spray · Taken').click();
			await page.getByRole('dialog', { name: 'Dose', exact: true }).waitFor();
			await page.waitForTimeout(400);
			await snap(page, 'dose-asneeded-edit', scheme);
			await page
				.getByRole('dialog', { name: 'Dose', exact: true })
				.getByRole('button', { name: 'Save', exact: true })
				.click();
			await page.getByRole('dialog', { name: 'Dose', exact: true }).waitFor({ state: 'hidden' });
			await saved.waitFor({ state: 'hidden' });

			await page.getByRole('link', { name: 'Meds', exact: true }).click();
			await page.getByRole('button', { name: 'Edit Vitamin D', exact: true }).waitFor();
			await page.waitForTimeout(300);
			await snap(page, 'meds-edit', scheme, true);
		});

		test(`log another medicine ${scheme}`, async ({ page }) => {
			test.skip(
				!['dose-adhoc', 'meds-hide-other'].includes(folder!),
				'dose-adhoc and meds-hide-other screenshots only'
			);
			test.setTimeout(120_000);
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/meds');
			await page.getByRole('button', { name: 'Log another medicine' }).click();
			const sheet = page.getByRole('dialog', { name: 'Log another medicine' });
			await page.waitForTimeout(400);
			await sheet.getByLabel('Medicine', { exact: true }).fill('Throat lozenge');
			await sheet.getByLabel('Amount', { exact: false }).fill('1 lozenge');
			await snap(page, 'adhoc-sheet', scheme);
			await sheet.getByRole('button', { name: 'Save', exact: true }).click();
			await sheet.waitFor({ state: 'hidden' });
			await page.getByRole('status').getByText('Dose logged', { exact: true }).waitFor({ state: 'hidden' });
			await page.waitForTimeout(300);
			await snap(page, 'adhoc-meds', scheme);
		});

		test(`me ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/me');
			await snap(page, 'me', scheme, true);
			await page.getByRole('button', { name: 'Delete my account…' }).click();
			await page.waitForTimeout(400);
			await snap(page, 'me-delete', scheme);
		});

		test(`styleguide ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			await page.goto('/styleguide');
			await snap(page, 'styleguide', scheme, true);
		});

		test(`bodymap outlines ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			await page.goto('/styleguide');
			const toggle = page.getByRole('radiogroup', { name: 'View' });
			const top = () =>
				toggle.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 16));
			await top();
			await page.locator('svg[role=group]').getByRole('button', { name: 'Your right knee' }).click();
			await snap(page, 'bodymap-front', scheme);
			await page.getByRole('radio', { name: 'Back' }).click();
			await page.locator('svg[role=group]').getByRole('button', { name: 'Your left calf' }).click();
			await top();
			await snap(page, 'bodymap-back', scheme);
		});

		test(`bodymap find ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			await page.goto('/styleguide');
			const search = page.getByLabel('Find a body part');
			await search.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 80));
			await snap(page, 'bodymap-find', scheme);
			await search.fill('knee');
			await snap(page, 'bodymap-find-filtered', scheme);
		});

		test(`login, recover and unlock ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			const user = await signUpViaApi(page, 'shot');
			await page.goto('/');
			await page.getByRole('heading', { name: 'Your diary is locked' }).waitFor();
			await snap(page, 'unlock', scheme);
			await page.getByRole('button', { name: 'Not you? Sign out' }).click();
			await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
			await snap(page, 'login', scheme);
			await page.getByLabel('Username').fill(user.username);
			await page.getByLabel('Passphrase', { exact: true }).fill('wrong passphrase');
			await page.getByRole('button', { name: 'Sign in' }).click();
			await page.getByRole('alert').waitFor();
			await snap(page, 'login-error', scheme);
			await page.goto('/recover');
			await page.getByRole('heading', { name: 'Get back into your diary' }).waitFor();
			await snap(page, 'recover', scheme);
		});

		test(`two-step sign-in ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'totp', 'totp screenshots only');
			await prepare(page, scheme);
			const user = await signUpAndSignIn(page, '/me');
			const card = page.locator('section.card', {
				has: page.getByRole('heading', { name: 'Two-step sign-in' })
			});
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'me-card-off', scheme);
			await card.getByRole('button', { name: 'Turn on' }).click();
			await page.waitForTimeout(400);
			await page.getByRole('dialog').getByLabel('Passphrase', { exact: true }).fill(user.passphrase);
			await page.getByRole('dialog').getByRole('button', { name: 'Show setup key' }).click();
			await page.getByTestId('totp-secret').waitFor();
			await page.waitForTimeout(400);
			await snap(page, 'enable-sheet', scheme);
			const secret = (await page.getByTestId('totp-secret').locator('span').allTextContents()).join('');
			await page
				.getByRole('dialog')
				.getByLabel('Six-digit code from the app')
				.fill(await previousStepCode(secret));
			await page.getByRole('button', { name: 'Confirm and turn on' }).click();
			await page.getByTestId('totp-state').filter({ hasText: 'On' }).waitFor();
			await page.waitForTimeout(400);
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'me-card-on', scheme);
			await page.getByRole('button', { name: 'Sign out' }).click();
			await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
			await page.getByLabel('Username').fill(user.username);
			await page.getByLabel('Passphrase', { exact: true }).fill(user.passphrase);
			await page.getByRole('button', { name: 'Sign in' }).click();
			await page.getByRole('heading', { name: 'One more step' }).waitFor();
			await snap(page, 'login-code', scheme);
		});

		test(`admin users ${scheme}`, async ({ page, playwright }) => {
			test.skip(folder !== 'admin-users', 'admin-users screenshots only');
			await prepare(page, scheme);
			const api = await playwright.request.newContext({ baseURL: ORIGIN });
			const maja = await signUpApiAccount(api, { prefix: 'maja' });
			const jonas = await signUpApiAccount(await playwright.request.newContext({ baseURL: ORIGIN }), {
				prefix: 'jonas'
			});
			const admin = await signUpApiAccount(page.request, { prefix: 'admin', admin: true });
			const all = (await (await page.request.get('/api/admin/users')).json()).users as {
				id: string;
				username: string;
			}[];
			const jonasId = all.find((u) => u.username === jonas.username)!.id;
			await postJson(page.request, `/api/admin/users/${jonasId}/disable`);
			await page.goto('/me');
			await page.getByRole('heading', { name: 'Your diary is locked' }).waitFor();
			await unlockWith(page, admin.passphrase);
			await page.getByTestId('admin-link').scrollIntoViewIfNeeded();
			await snap(page, 'me-admin-entry', scheme);
			await page.getByTestId('admin-link').click();
			await page.getByTestId('admin-users').waitFor();
			await page.locator(`li.person[data-username="${maja.username}"]`).waitFor();
			await snap(page, 'users', scheme, true);
			await page
				.locator(`li.person[data-username="${maja.username}"]`)
				.getByRole('button', { name: /^Delete/ })
				.click();
			await page.waitForTimeout(400);
			await snap(page, 'delete-sheet', scheme);
			await page.getByRole('button', { name: 'Cancel' }).click();
			await page.waitForTimeout(400);
			await page.getByRole('button', { name: 'Create invite link' }).click();
			await page.getByTestId('invite-link').waitFor();
			await page.getByTestId('invite-link').scrollIntoViewIfNeeded();
			await page.waitForTimeout(200);
			await snap(page, 'invite-link', scheme);
		});

		test(`join journey ${scheme}`, async ({ page }) => {
			test.setTimeout(120_000);
			await prepare(page, scheme);
			await page.goto(`/join#t=${createInvite()}`);
			await page.getByRole('button', { name: 'Get started' }).waitFor();
			await snap(page, 'join-welcome', scheme);
			await page.getByRole('button', { name: 'Get started' }).click();
			await page.getByLabel('Username').fill(newUsername('maja'));
			const passphrase = newPassphrase();
			await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
			await page.getByLabel('Repeat passphrase').fill(passphrase);
			await snap(page, 'join-passphrase', scheme, true);
			await page.getByRole('button', { name: 'Continue' }).click();
			await page.getByRole('heading', { name: 'Your recovery key' }).waitFor({ timeout: 30_000 });
			const groups = await page.getByTestId('recovery-key').locator('span').allTextContents();
			await snap(page, 'join-recovery-key', scheme, true);
			await page.getByRole('button', { name: "I've stored it. Check me" }).click();
			const lead = (await page.getByText(/Type group \d+ and group \d+/).textContent()) ?? '';
			const [a, b] = [...lead.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
			await page.getByLabel(`Group ${a} (4 characters)`).fill(groups[a! - 1]!);
			await page.getByLabel(`Group ${b} (4 characters)`).fill('ZZZZ');
			await snap(page, 'join-confirm', scheme);
			await page.getByLabel(`Group ${b} (4 characters)`).fill(groups[b! - 1]!);
			await page.getByRole('button', { name: 'Confirm' }).click();
			await page.getByRole('heading', { name: 'Before you start' }).waitFor();
			await snap(page, 'join-consent', scheme, true);
		});

		test(`reminders ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'reminders', 'reminders screenshots only');
			test.setTimeout(90_000);
			await prepare(page, scheme);
			await stubPush(page, endpointOf());
			await signUpAndSignIn(page, '/meds');
			await addMedWithReminder(page, 'Synthol', '08:00');
			await addMedWithReminder(page, 'Evening tablet', '20:00', ['Mon', 'Wed', 'Fri']);
			await page.getByRole('link', { name: 'Me', exact: true }).click();
			const card = page.getByTestId('reminders-card');
			await card.waitFor();
			await page.getByText('Saved', { exact: true }).waitFor({ state: 'hidden', timeout: 15_000 });
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'me-reminders-off', scheme);
			await card.getByRole('switch', { name: 'Remind me on this device' }).click();
			await page.getByTestId('reminders-count').waitFor();
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'me-reminders-on', scheme);
			await page.getByRole('radio', { name: 'Dansk' }).click();
			await page.getByText('Påmindelser på denne enhed').waitFor();
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'me-reminders-on-da', scheme);
		});

		test(`reminders on an iPhone tab ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'reminders', 'reminders screenshots only');
			await prepare(page, scheme);
			await stubPush(page, endpointOf(), { ios: true });
			await signUpAndSignIn(page, '/me');
			const card = page.getByTestId('reminders-card');
			await card.getByText(/Add to Home Screen/).waitFor();
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'me-reminders-ios', scheme);
		});
	});
}
