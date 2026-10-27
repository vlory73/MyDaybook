import { expect, test, type Page } from '@playwright/test';
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
	seedRecords,
	unlockWith
} from './helpers';
import { at, heartRateType, heatSet, month, watchRecord, watchRecord2 } from './trends-data';
import { addDays, todayKey } from '../../src/lib/records/time';

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
			await sheet.getByRole('radio', { name: 'Main sleep' }).click();
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
			await sheet.getByLabel('Name, for example Temperature').fill('Ankle width');
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

		test(`meal fixes places and watch list on top ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'meal-fixes', 'meal-fixes screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Meal', exact: true }).click();
			await page.waitForTimeout(400);
			const sheet = page.getByRole('dialog', { name: 'Meal' });
			await sheet.getByRole('button', { name: 'Lunch', exact: true }).click();
			await sheet.getByLabel('What did you have?').fill('Packed lunch: rye bread and cheese');
			await sheet.getByRole('button', { name: 'Work', exact: true }).click();
			await sheet.getByRole('button', { name: 'Work', exact: true }).scrollIntoViewIfNeeded();
			await snap(page, 'meal-places', scheme);

			await sheet.getByRole('button', { name: 'Set up your watch list' }).scrollIntoViewIfNeeded();
			await sheet.getByRole('button', { name: 'Set up your watch list' }).click();
			const watch = page.getByRole('dialog', { name: 'What I watch in food' });
			await watch.getByRole('button', { name: 'Gluten', exact: true }).click();
			await watch.getByRole('button', { name: 'Lactose', exact: true }).click();
			await page.waitForTimeout(400);
			await snap(page, 'watch-list-on-top', scheme);

			await watch.getByRole('button', { name: 'Close' }).click();
			await page.waitForTimeout(400);
			await sheet.getByRole('radiogroup', { name: 'Gluten' }).scrollIntoViewIfNeeded();
			await sheet
				.getByRole('radiogroup', { name: 'Lactose' })
				.getByRole('radio', { name: 'No', exact: true })
				.click();
			await snap(page, 'meal-after-return', scheme);
		});

		test(`meal drinks ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'meal-drinks', 'meal-drinks screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Meal', exact: true }).click();
			await page.waitForTimeout(400);
			const meal = page.getByRole('dialog', { name: 'Meal' });
			const drink = page.getByRole('dialog', { name: 'Drink' });
			await meal.getByRole('button', { name: 'Breakfast', exact: true }).click();
			await meal.getByLabel('What did you have?').fill('Oatmeal with berries and yoghurt');
			await meal.getByRole('button', { name: 'Add a drink', exact: true }).click();
			await drink.getByRole('button', { name: 'Coffee', exact: true }).click();
			await drink.getByRole('button', { name: 'Add to meal', exact: true }).scrollIntoViewIfNeeded();
			await page.waitForTimeout(400);
			await snap(page, 'drink-on-top', scheme);
			await drink.getByRole('button', { name: 'Add to meal', exact: true }).click();
			await meal.getByRole('button', { name: 'Add a drink', exact: true }).click();
			await drink.getByRole('button', { name: 'One more' }).click();
			await drink.getByRole('button', { name: 'Add to meal', exact: true }).click();
			await page.waitForTimeout(400);
			await meal.getByRole('group', { name: 'Drinks with this meal' }).scrollIntoViewIfNeeded();
			await snap(page, 'meal-with-drinks', scheme);
			await meal.getByRole('button', { name: 'Save', exact: true }).click();
			await page.getByRole('status').getByText('Meal and 2 drinks saved').waitFor();
			await page.waitForTimeout(300);
			await snap(page, 'today-after-save', scheme);
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
			await sheet.getByLabel('Started', { exact: true }).fill(`${at(1, 22).slice(0, 10)}T22:00`);
			await sheet.getByLabel('Stopped', { exact: true }).fill(`${at(0, 2).slice(0, 10)}T02:00`);
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

		test(`trends ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'trends', 'trends screenshots only');
			await prepare(page, scheme);
			const account = await signUpApiAccount(page.request);
			const [gluten, lactose, heartRate] = await seedRecords(page.request, account, [
				watchRecord,
				watchRecord2,
				heartRateType
			]);
			void lactose;
			await seedRecords(page.request, account, month(gluten!, heartRate!));
			await page.goto('/trends');
			await unlockWith(page, account.passphrase);
			await page.getByRole('heading', { name: 'After meals with…' }).waitFor({ timeout: 20_000 });
			await snap(page, 'trends-30', scheme);
			await snap(page, 'trends-30-full', scheme, true);
			await page.getByRole('radio', { name: '7 days' }).click();
			await page.waitForTimeout(300);
			await snap(page, 'trends-7-full', scheme, true);
			await page.getByRole('radio', { name: '90 days' }).click();
			await page.waitForTimeout(300);
			await snap(page, 'trends-90-full', scheme, true);
			await page.getByRole('radio', { name: 'Custom' }).click();
			await page.waitForTimeout(300);
			await page.evaluate(() => window.scrollTo(0, 0));
			await snap(page, 'trends-custom', scheme);
			await page.getByRole('radio', { name: '30 days' }).click();
			await page.getByRole('link', { name: 'Me', exact: true }).click();
			await page.getByRole('radio', { name: 'Dansk' }).click();
			await page.getByRole('link', { name: 'Udvikling', exact: true }).click();
			await page.getByRole('heading', { name: 'Efter måltider med…' }).waitFor();
			await snap(page, 'trends-da-full', scheme, true);
		});

		test(`heatmap ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'heatmap', 'heatmap screenshots only');
			await prepare(page, scheme);
			const pt = (region: string, side: string, space: string, intensity: number) => ({
				region,
				side,
				space,
				u: 0.5,
				v: 0.5,
				intensity,
				qualities: []
			});
			const account = await signUpApiAccount(page.request);
			await seedRecords(page.request, account, [
				...heatSet(),
				{
					v: 1,
					type: 'pain',
					at: at(0, 6),
					points: [pt('lower_back', 'midline', '2d-back-v1', 5), pt('knee', 'right', '2d-front-v1', 4)]
				},
				{ v: 1, type: 'pain', at: at(0, 7), points: [pt('knee', 'left', '2d-front-v1', 3)] },
				{
					v: 1,
					type: 'pain',
					at: at(0, 8),
					points: [pt('temple', 'right', '2d-head-front-v2', 6), pt('belly', 'midline', '2d-front-v1', 4)]
				}
			]);
			await page.goto('/trends');
			await unlockWith(page, account.passphrase);
			const card = page
				.locator('section.card')
				.filter({ has: page.getByRole('heading', { name: 'Where it hurt', exact: true }) });
			await card.waitFor({ timeout: 20_000 });
			const shot = async (name: string) => {
				await page.waitForTimeout(250);
				await card.screenshot({ path: `docs/screenshots/${folder}/${name}-${scheme}.png` });
			};
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'card-front-full', scheme, true);
			await shot('card-front');
			await card.getByRole('radio', { name: 'Back', exact: true }).click();
			await shot('card-back');
			await card.getByRole('radio', { name: 'Front', exact: true }).click();
			await card.getByRole('button', { name: /^Show all/ }).click();
			await shot('card-front-all');
			await card.getByRole('button', { name: 'Show fewer places' }).click();
			const figure = card.getByTestId('heat-figure').locator('svg.body');
			await figure.getByRole('button', { name: 'Look closer: Head' }).click();
			await shot('card-head');
			await card.getByRole('button', { name: 'Back to the body' }).click();
			await figure.getByRole('button', { name: 'Look closer: Your right hand' }).click();
			await shot('card-hand');
			await card.getByRole('button', { name: 'Back to the body' }).click();

			await page.goto('/');
			await unlockWith(page, account.passphrase);
			await page.locator('.thumb').first().waitFor({ timeout: 20_000 });
			await snap(page, 'today-thumbs', scheme, true);

			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Pain', exact: true }).click();
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			for (const [region, n] of [
				['Your right knee', 1],
				['Your left knee', 2],
				['Your right shin', 3]
			] as const) {
				await sheet.locator('svg[role=group]').getByRole('button', { name: region, exact: true }).click();
				await sheet
					.getByRole('radiogroup', { name: /^Intensity/ })
					.getByRole('radio', { name: String(n), exact: true })
					.click();
				if (n < 3) await sheet.getByRole('button', { name: 'Add a point' }).click();
			}
			await page.waitForTimeout(400);
			await snap(page, 'pain-sheet', scheme);
		});

		test(`pain sheet fixes ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'pain-sheet-fixes', 'pain sheet fixes screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page);
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Pain', exact: true }).click();
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			const fig = sheet.locator('svg[role=group]');
			const wide = sheet.getByRole('group', { name: 'How wide an area' });
			const level = (n: number) =>
				sheet
					.getByRole('radiogroup', { name: /^Intensity/ })
					.getByRole('radio', { name: String(n), exact: true })
					.click();
			// No headache tick on the main body.
			await page.waitForTimeout(400);
			await snap(page, 'main-body-no-tick', scheme);
			await fig.getByRole('button', { name: 'Your right thigh', exact: true }).click();
			await wide.getByRole('button', { name: 'Whole leg', exact: true }).click();
			await level(6);
			await page.waitForTimeout(400);
			await snap(page, 'whole-leg', scheme);
			// Taller than a phone, so the whole leg shows above the panel.
			await page.setViewportSize({ width: 375, height: 1150 });
			await page.waitForTimeout(400);
			await snap(page, 'whole-leg-tall', scheme);
			await page.setViewportSize({ width: 375, height: 812 });
			await fig.getByRole('button', { name: 'Your left forearm', exact: true }).click();
			await wide.getByRole('button', { name: 'Whole arm', exact: true }).click();
			await level(3);
			await page.waitForTimeout(400);
			await snap(page, 'whole-arm-front', scheme);
			// Whole arm on the back view.
			await sheet.getByRole('radio', { name: 'Back', exact: true }).click();
			await fig.getByRole('button', { name: 'Your right forearm', exact: true }).click();
			await wide.getByRole('button', { name: 'Whole arm', exact: true }).click();
			await level(4);
			await page.waitForTimeout(400);
			await snap(page, 'whole-arm-back', scheme);
			// Taller than a phone (as for the head zones) so the whole map and the tick show above the panel.
			await page.setViewportSize({ width: 375, height: 1150 });
			for (let i = 0; i < 3; i++) await sheet.getByRole('button', { name: 'Remove point' }).click();
			await sheet.getByRole('radio', { name: 'Front', exact: true }).click();
			await sheet.getByRole('button', { name: 'Head, close-up' }).click();
			await page.waitForTimeout(400);
			await snap(page, 'head-close-up-tick', scheme);
		});

		test(`pain episodes ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'pain-episodes', 'pain episodes screenshots only');
			await prepare(page, scheme);
			const pt = (region: string, side: string, intensity: number) => ({
				region,
				side,
				space: region === 'lower_back' ? '2d-back-v1' : '2d-front-v1',
				u: 0.5,
				v: 0.5,
				intensity,
				qualities: []
			});
			const knee = (intensity: number, side = 'right') => pt('knee', side, intensity);
			const account = await signUpApiAccount(page.request);
			const [ongoing, ended] = await seedRecords(page.request, account, [
				{ v: 1, type: 'pain_episode', started: at(2, 9, 10) },
				{ v: 1, type: 'pain_episode', started: at(24, 9), ended: at(18, 12) }
			]);
			const entry = (episode: string, daysAgo: number, hh: number, mm: number, points: object[]) => ({
				v: 1,
				type: 'pain',
				at: at(daysAgo, hh, mm),
				points,
				episode
			});
			await seedRecords(page.request, account, [
				entry(ongoing!, 2, 9, 10, [knee(4)]),
				entry(ongoing!, 2, 21, 5, [knee(5)]),
				entry(ongoing!, 1, 19, 40, [knee(6), knee(2, 'left')]),
				entry(ended!, 24, 9, 0, [knee(4)]),
				entry(ended!, 24, 21, 0, [knee(5)]),
				entry(ended!, 23, 12, 0, [knee(6)]),
				entry(ended!, 21, 8, 0, [knee(3)]),
				entry(ended!, 20, 8, 0, [knee(2)]),
				entry(ended!, 19, 8, 0, [knee(2)]),
				entry(ended!, 18, 8, 0, [knee(1)])
			]);
			await page.goto('/');
			await unlockWith(page, account.passphrase);
			const card = page.getByRole('region', { name: 'Still there?' });
			await card.waitFor({ timeout: 20_000 });
			await snap(page, 'today-card', scheme);

			await seedRecords(page.request, account, [
				entry(ongoing!, 0, 0, 10, [knee(3)]),
				{ v: 1, type: 'pain', at: at(0, 0, 15), points: [pt('lower_back', 'midline', 2)] }
			]);
			await page.reload();
			await page.getByRole('heading', { name: 'Your diary is locked' }).waitFor();
			await unlockWith(page, account.passphrase);
			const chip = page.getByRole('button', { name: /^Open episode/ });
			await chip.waitFor({ timeout: 20_000 });
			await snap(page, 'timeline-chip', scheme, true);

			await chip.click();
			const episode = page.getByRole('dialog', { name: 'Your right knee' });
			await episode.waitFor();
			await page.waitForTimeout(400);
			await snap(page, 'episode-sheet-ongoing', scheme);
			await page.keyboard.press('Escape');

			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Pain', exact: true }).click();
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			await sheet
				.locator('svg[role=group]')
				.getByRole('button', { name: 'Your right knee', exact: true })
				.click();
			await sheet
				.getByRole('radiogroup', { name: /^Intensity/ })
				.getByRole('radio', { name: '5', exact: true })
				.click();
			const add = sheet.getByRole('button', { name: /^Add to / });
			const toEnd = () => sheet.evaluate((d) => d.scrollTo(0, d.scrollHeight));
			await toEnd();
			await page.waitForTimeout(400);
			await snap(page, 'pain-sheet-add', scheme);
			await add.click();
			await toEnd();
			await page.waitForTimeout(400);
			await snap(page, 'pain-sheet-linked', scheme);
			await page.keyboard.press('Escape');

			await page.getByRole('link', { name: 'Trends', exact: true }).click();
			const episodes = page
				.locator('section.card')
				.filter({ has: page.getByRole('heading', { name: 'Episodes', exact: true }) });
			await episodes.waitFor({ timeout: 20_000 });
			await episodes.scrollIntoViewIfNeeded();
			await page.waitForTimeout(300);
			await snap(page, 'trends-episodes', scheme);
			await episodes.getByRole('button').nth(1).click();
			await episode.waitFor();
			await page.waitForTimeout(400);
			await snap(page, 'episode-sheet-ended', scheme);
		});

		test(`display name ${scheme}`, async ({ page }) => {
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/me');
			await page.getByTestId('name-edit').click();
			await page.getByLabel('First name').fill('Ada');
			await page.getByLabel('Last name').fill('Example');
			await page.waitForTimeout(400);
			await snap(page, 'name-editor', scheme);
			await page.getByRole('button', { name: 'Save name' }).click();
			await expect(page.getByTestId('profile-name')).toHaveText('Ada Example');
			await expect(page.getByText('Name saved')).toBeHidden({ timeout: 15_000 });
			await snap(page, 'me-name', scheme);
			await page.getByRole('link', { name: 'Today', exact: true }).click();
			await expect(page.getByRole('heading', { level: 1, name: /, Ada$/ })).toBeVisible();
			await snap(page, 'today-greeting', scheme);
		});

		test(`trends empty ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'trends', 'trends screenshots only');
			await prepare(page, scheme);
			await signUpAndSignIn(page, '/trends');
			await page.getByRole('heading', { name: 'No charts yet' }).waitFor();
			await snap(page, 'trends-empty', scheme);
		});

		test(`headache report ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'headache-report', 'headache report screenshots only');
			await prepare(page, scheme);
			const account = await signUpApiAccount(page.request);
			const todayIso = at(0, 12).slice(0, 10);
			const medBase = {
				v: 1,
				type: 'medication',
				form: 'tablet',
				times: [],
				start: todayIso,
				reminders: false,
				archived: false
			};
			const [para, ibu] = await seedRecords(page.request, account, [
				{ ...medBase, name: 'Paracetamol', strength: 500, unit: 'mg', schedule: { kind: 'as_needed' } },
				{ ...medBase, name: 'Ibuprofen', strength: 400, unit: 'mg', schedule: { kind: 'as_needed' } }
			]);
			const head = (side: string, intensity: number, qualities: string[] = []) => ({
				region: 'temple',
				side,
				space: '2d-head-front-v2',
				u: 0.5,
				v: 0.5,
				intensity,
				qualities
			});
			const days = [1, 2, 4, 5, 7, 9, 10, 12, 13];
			const records: object[] = [];
			days.forEach((d, i) => {
				const side = ['right', 'left', 'right', 'right', 'left', 'right', 'left', 'right', 'right'][i]!;
				const start = 7 + (i % 5) * 3;
				records.push({
					v: 1,
					type: 'pain',
					at: at(d, start),
					points: [
						head(side, 3 + (i % 4) * 2, i % 2 ? ['constant'] : ['throbbing']),
						...(i === 1 ? [head('right', 8)] : [])
					],
					headache: {
						started: at(d, start),
						...(i === 0
							? { stillGoing: true }
							: { stopped: at(i === 1 ? d - 1 : d, i === 1 ? 2 : Math.min(start + 4, 23)) }),
						...(i % 3 === 0 ? { before: ['vision'] } : i % 3 === 1 ? { before: ['vision', 'feeling'] } : {}),
						...(i % 2 === 0
							? { worseWithActivity: true, light: true, sound: i % 4 === 0 }
							: { worseWithActivity: false, light: false }),
						...(i === 1
							? { trigger: 'Skipped lunch, long meeting, bright screen all afternoon and a noisy office' }
							: i % 3 === 0
								? { trigger: 'Poor sleep' }
								: {})
					}
				});
				if (i % 2 === 0) {
					records.push({
						v: 1,
						type: 'gut',
						at: at(d, start + 1),
						symptoms: [{ kind: 'nausea', intensity: 1 + (i % 5) }],
						flags: []
					});
				}
				records.push({
					v: 1,
					type: 'dose',
					at: at(d, start + 1, 10),
					medicationId: para!,
					status: 'taken',
					amount: '500 mg'
				});
				if (i === 1) {
					for (const [h, m, id] of [
						[start + 2, 30, ibu!],
						[start + 5, 15, para!],
						[start + 8, 0, para!]
					] as const) {
						records.push({
							v: 1,
							type: 'dose',
							at: at(d, h, m),
							medicationId: id,
							status: 'taken',
							amount: id === ibu ? '400 mg' : '500 mg'
						});
					}
				}
			});
			await seedRecords(page.request, account, records);
			await page.goto('/reports/headache');
			await unlockWith(page, account.passphrase);
			await page.getByRole('heading', { name: 'Headache diary', level: 1 }).waitFor();
			await page.getByLabel('Name on the report').fill('Sam Example');
			await snap(page, 'report-screen', scheme, true);
			if (scheme !== 'light') return;

			const shoot = async (layout: RegExp, language: string, file: string, pages: number) => {
				await page.emulateMedia({ media: 'screen', colorScheme: scheme });
				await page.getByRole('radio', { name: layout }).click();
				await page.getByRole('radio', { name: language }).click();
				await page.getByRole('button', { name: 'Make report' }).click();
				await page.getByTestId('report').waitFor();
				await page.emulateMedia({ media: 'print', colorScheme: scheme });
				const sheets = page.locator('.report-sheet');
				if ((await sheets.count()) !== pages)
					throw new Error(`expected ${pages} sheets, got ${await sheets.count()}`);
				const portrait = layout.source.includes('paper');
				await page.setViewportSize(portrait ? { width: 793, height: 1122 } : { width: 1122, height: 793 });
				for (let i = 0; i < pages; i++) {
					await page.evaluate(() => window.scrollTo(0, 0));
					const box = (await sheets.nth(i).boundingBox())!;
					await page.screenshot({
						path: `docs/screenshots/${folder}/${file}-page${i + 1}.png`,
						fullPage: true,
						clip: { x: box.x, y: box.y, width: box.width, height: box.height }
					});
				}
				await page.setViewportSize({ width: 375, height: 812 });
				await page.emulateMedia({ media: 'screen', colorScheme: scheme });
				await page.waitForTimeout(200);
				if (file === 'table-en') await snap(page, 'report-preview', scheme);
				await page.getByRole('button', { name: /^(Back|Tilbage)$/ }).click();
			};
			await page
				.getByRole('radio', { name: 'Custom from–to' })
				.or(page.getByRole('button', { name: 'Custom from–to' }))
				.click();
			await page.locator('.custom input').first().fill(at(13, 12).slice(0, 10));
			await page.locator('.custom input').last().fill(todayIso);
			await shoot(/Clean table/, 'English', 'table-en', 2);
			await shoot(/Clean table/, 'Dansk', 'table-da', 2);
			await shoot(/Like the paper form/, 'English', 'form-en', 2);
			await shoot(/Like the paper form/, 'Dansk', 'form-da', 2);
		});
		test(`headache still there ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'headache-still', 'headache-still screenshots only');
			await prepare(page, scheme);
			const account = await signUpApiAccount(page.request);
			const startH = Math.max(0, new Date().getHours() - 3);
			const head = (intensity: number) => ({
				region: 'temple',
				side: 'left',
				space: '2d-head-front-v2',
				u: 0.5,
				v: 0.5,
				intensity,
				qualities: ['throbbing', 'constant']
			});
			const [episode] = await seedRecords(page.request, account, [
				{ v: 1, type: 'pain_episode', started: at(3, 14) }
			]);
			await seedRecords(page.request, account, [
				{ v: 1, type: 'sleep', at: at(0, 0, 30), asleepAt: at(1, 23, 0), quality: 3 },
				{
					v: 1,
					type: 'pain',
					at: at(3, 14),
					points: [head(5)],
					episode,
					headache: { started: at(3, 14), stopped: at(3, 22) }
				},
				{
					v: 1,
					type: 'pain',
					at: at(0, startH),
					points: [head(6)],
					episode,
					headache: { started: at(0, startH), trigger: 'Skipped lunch' }
				}
			]);
			await page.goto('/');
			await unlockWith(page, account.passphrase);
			const card = page.getByRole('region', { name: 'Headache · still there?' });
			await card.waitFor({ timeout: 20_000 });
			await snap(page, 'today-card', scheme);

			await card.getByRole('button', { name: "It's gone", exact: true }).click();
			await card.getByText('When did it stop?').waitFor();
			await snap(page, 'today-card-expanded', scheme);

			await card.getByRole('button', { name: 'Cancel' }).click();
			await page
				.getByRole('list')
				.filter({ has: page.locator('time') })
				.getByText('Your left temple 6', { exact: true })
				.click();
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			await sheet.getByText(/^Leave empty while/).waitFor();
			// Taller than a phone, so the docked point panel does not cover the headache section (as head-zones does).
			await page.setViewportSize({ width: 375, height: 1150 });
			await page.waitForTimeout(900);
			await sheet.getByText(/^Leave empty while/).evaluate((el) => el.scrollIntoView({ block: 'center' }));
			await page.waitForTimeout(400);
			await snap(page, 'pain-sheet-stopped', scheme);
		});

		test(`headache still there report ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'headache-still', 'headache-still screenshots only');
			await prepare(page, scheme);
			const account = await signUpApiAccount(page.request);
			const todayIso = at(0, 12).slice(0, 10);
			const head = (intensity: number) => ({
				region: 'temple',
				side: 'left',
				space: '2d-head-front-v2',
				u: 0.5,
				v: 0.5,
				intensity,
				qualities: ['throbbing']
			});
			const entry = (daysAgo: number, hour: number, headache: object) => ({
				v: 1,
				type: 'pain',
				at: at(daysAgo, hour),
				points: [head(5)],
				headache: { started: at(daysAgo, hour), ...headache }
			});
			await seedRecords(page.request, account, [
				// a normal stop
				entry(6, 14, { stopped: at(6, 17) }),
				// never answered, last seen at 18:00
				entry(5, 15, { lastSeen: at(5, 18) }),
				// ran past midnight: the next column is marked "continued from"
				entry(4, 22, { stopped: at(3, 2) }),
				// still going (today)
				entry(0, Math.max(0, new Date().getHours() - 2), {})
			]);
			await page.goto('/reports/headache');
			await unlockWith(page, account.passphrase);
			await page.getByRole('heading', { name: 'Headache diary', level: 1 }).waitFor();
			await page.getByLabel('Name on the report').fill('Sam Example');
			await page
				.getByRole('radio', { name: 'Custom from–to' })
				.or(page.getByRole('button', { name: 'Custom from–to' }))
				.click();
			await page.locator('.custom input').first().fill(at(6, 12).slice(0, 10));
			await page.locator('.custom input').last().fill(todayIso);
			for (const [layout, file] of [
				[/Clean table/, 'report-table'],
				[/Like the paper form/, 'report-form']
			] as const) {
				await page.emulateMedia({ media: 'screen', colorScheme: scheme });
				await page.getByRole('radio', { name: layout }).click();
				await page.getByRole('radio', { name: 'English' }).click();
				await page.getByRole('button', { name: 'Make report' }).click();
				await page.getByTestId('report').waitFor();
				await page.emulateMedia({ media: 'print', colorScheme: scheme });
				const portrait = file === 'report-form';
				await page.setViewportSize(portrait ? { width: 793, height: 1122 } : { width: 1122, height: 793 });
				const sheet = page.locator('.report-sheet').first();
				const box = (await sheet.boundingBox())!;
				await page.evaluate(() => window.scrollTo(0, 0));
				await page.screenshot({
					path: `docs/screenshots/${folder}/${file}-sheet-${scheme}.png`,
					fullPage: true,
					clip: { x: box.x, y: box.y, width: box.width, height: box.height }
				});
				await page.setViewportSize({ width: 375, height: 812 });
				await page.emulateMedia({ media: 'screen', colorScheme: scheme });
				await page.waitForTimeout(200);
				if (!portrait) await snap(page, 'report-preview', scheme);
				await page.getByRole('button', { name: /^(Back|Tilbage)$/ }).click();
			}
		});
		test(`headache times ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'headache-times', 'headache-times screenshots only');
			await prepare(page, scheme);
			const account = await signUpApiAccount(page.request);
			const head = (intensity: number) => ({
				region: 'temple',
				side: 'left',
				space: '2d-head-front-v2',
				u: 0.5,
				v: 0.5,
				intensity,
				qualities: ['throbbing']
			});
			const local = (minutesAgo: number) => {
				const d = new Date(Date.now() - minutesAgo * 60_000);
				const p2 = (n: number) => String(n).padStart(2, '0');
				return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
			};
			const start = local(190);
			const offset = at(0, 12).slice(19);
			await seedRecords(page.request, account, [
				{
					v: 1,
					type: 'pain',
					at: `${start}:00${offset}`,
					points: [head(6)],
					headache: { started: `${start}:00${offset}`, trigger: 'Skipped lunch' }
				}
			]);
			await page.goto('/');
			await unlockWith(page, account.passphrase);
			const card = page.getByRole('region', { name: 'Headache · still there?' });
			await card.waitFor({ timeout: 20_000 });
			await card.getByRole('button', { name: "It's gone", exact: true }).click();
			await card.getByText('When did it stop?').waitFor();
			await snap(page, 'today-card-options', scheme, true);
			await card.getByRole('button', { name: 'Earlier…' }).click();
			await card.getByLabel('When it stopped').fill(local(100));
			await snap(page, 'today-card-earlier', scheme, true);

			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Pain', exact: true }).click();
			const sheet = page.getByRole('dialog', { name: 'Where do you feel it?' });
			await sheet.getByRole('button', { name: 'Head, close-up', exact: true }).click();
			await sheet
				.locator('svg[role=group]')
				.getByRole('button', { name: 'Your left temple', exact: true })
				.click();
			await sheet
				.getByRole('radiogroup', { name: /^Intensity/ })
				.getByRole('radio', { name: '6', exact: true })
				.click();
			await sheet.getByLabel('Started', { exact: true }).fill(local(190));
			await sheet.getByLabel('Stopped', { exact: true }).fill(local(45));
			await page.setViewportSize({ width: 375, height: 1500 });
			await page.waitForTimeout(900);
			await sheet
				.getByLabel('Started', { exact: true })
				.evaluate((el) => el.scrollIntoView({ block: 'center' }));
			await page.waitForTimeout(400);
			await snap(page, 'pain-sheet-times', scheme);
		});
		test(`measure split ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'measure-split', 'measure-split screenshots only');
			await prepare(page, scheme);
			const account = await signUpApiAccount(page.request);
			const [heartRate] = await seedRecords(page.request, account, [heartRateType]);
			void heartRate;
			const bp = [];
			for (let ago = 29; ago >= 0; ago -= 2) {
				const wave = Math.sin(ago / 3);
				bp.push({
					v: 1,
					type: 'measurement',
					at: at(ago, 8),
					typeId: 'blood_pressure',
					values: [Math.round(126 + wave * 6), Math.round(81 + wave * 3)],
					unit: 'mmHg',
					context: ['morning']
				});
				bp.push({
					v: 1,
					type: 'measurement',
					at: at(ago, 8, 5),
					typeId: 'pulse',
					values: [Math.round(66 + wave * 4)],
					unit: 'bpm',
					context: []
				});
			}
			await seedRecords(page.request, account, bp);
			await page.goto('/');
			await unlockWith(page, account.passphrase);
			await page.getByRole('button', { name: 'Log something' }).waitFor({ timeout: 20_000 });
			const sheet = page.getByRole('dialog');
			const open = async (tile: string) => {
				await page.getByRole('button', { name: 'Log something' }).click();
				await page.getByRole('button', { name: tile, exact: true }).click();
				await page.waitForTimeout(500);
			};

			await open('Weight');
			await sheet.getByLabel('Value', { exact: true }).fill('72.4');
			await snap(page, 'sheet-weight', scheme);
			await page.getByRole('button', { name: 'Close' }).click();

			await open('Measure');
			await sheet.getByRole('button', { name: 'Blood pressure', exact: true }).click();
			await sheet.getByLabel('Upper', { exact: true }).fill('128');
			await sheet.getByLabel('Lower', { exact: true }).fill('82');
			await snap(page, 'sheet-measure-bp', scheme);
			await sheet.getByRole('button', { name: 'Pulse', exact: true }).click();
			await sheet.getByLabel('Value', { exact: true }).fill('64');
			await snap(page, 'sheet-measure-type-list', scheme);
			await page.getByRole('button', { name: 'Close' }).click();

			await page.getByRole('link', { name: 'Trends', exact: true }).click();
			const card = page.locator('section.card').filter({
				has: page.getByRole('heading', { name: 'Blood pressure', exact: true })
			});
			await card.waitFor({ timeout: 20_000 });
			await card.scrollIntoViewIfNeeded();
			await page.waitForTimeout(300);
			await snap(page, 'trends-blood-pressure', scheme);

			if (scheme !== 'light') return;
			await page.getByRole('link', { name: 'Reports' }).click();
			await page.getByTestId('report-doctor').click();
			await page.getByRole('heading', { name: 'Doctor visit', level: 1 }).waitFor({ timeout: 20_000 });
			await page.getByLabel('Name on the report').fill('Sam Example');
			await page.getByRole('button', { name: 'Preview report' }).click();
			await page.getByTestId('doctor-page').first().waitFor();
			await page.emulateMedia({ media: 'print', colorScheme: scheme });
			await page.setViewportSize({ width: 794, height: 1123 });
			await page.waitForTimeout(300);
			const sheetEl = page.locator('.dsheet, .report-sheet').filter({ hasText: 'Blood pressure' }).first();
			const box = (await sheetEl.boundingBox())!;
			await page.screenshot({
				path: `docs/screenshots/${folder}/doctor-report-bp.png`,
				fullPage: true,
				clip: { x: box.x, y: box.y, width: box.width, height: box.height }
			});
		});

		test(`doctor report ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'doctor-report', 'doctor report screenshots only');
			await prepare(page, scheme);
			const account = await signUpApiAccount(page.request);
			const start = addDays(todayKey(), -60);
			const medBase = { v: 1, type: 'medication', times: [], start, reminders: false, archived: false };
			const daily = (
				name: string,
				strength: number,
				unit: string,
				form: string,
				time: string,
				schedule: object
			) => ({
				...medBase,
				name,
				strength,
				unit,
				form,
				schedule,
				times: [{ time, amount: '1' }]
			});
			const [gluten, , heartRate, mg, vitD, omep, para, ibu] = await seedRecords(page.request, account, [
				watchRecord,
				watchRecord2,
				heartRateType,
				daily('Magnesium', 250, 'mg', 'tablet', '08:00', { kind: 'daily' }),
				daily('Vitamin D', 20, 'µg', 'capsule', '08:00', { kind: 'daily' }),
				daily('Omeprazole', 20, 'mg', 'capsule', '07:30', { kind: 'weekdays', days: [1, 3, 5] }),
				{
					...medBase,
					name: 'Paracetamol',
					strength: 500,
					unit: 'mg',
					form: 'tablet',
					schedule: { kind: 'as_needed' }
				},
				{
					...medBase,
					name: 'Ibuprofen',
					strength: 400,
					unit: 'mg',
					form: 'tablet',
					schedule: { kind: 'as_needed' }
				}
			]);
			const doses: object[] = [];
			const slotDose = (id: string, ago: number, time: string, status: string) => {
				const day = addDays(todayKey(), -ago);
				doses.push({
					v: 1,
					type: 'dose',
					at: at(ago, Number(time.slice(0, 2)), Number(time.slice(3)) + (status === 'late' ? 40 : 3)),
					medicationId: id,
					status,
					amount: '1',
					slot: { date: day, time }
				});
			};
			for (let ago = 1; ago <= 29; ago++) {
				slotDose(mg!, ago, '08:00', ago % 11 === 0 ? 'late' : 'taken');
				slotDose(vitD!, ago, '08:00', ago === 7 || ago === 19 ? 'skipped' : ago === 12 ? 'late' : 'taken');
				const weekday = new Date(addDays(todayKey(), -ago) + 'T12:00:00').getDay();
				if ([1, 3, 5].includes(weekday)) slotDose(omep!, ago, '07:30', ago === 9 ? 'skipped' : 'taken');
			}
			for (const [id, ago, hh, mm, amount] of [
				[para, 1, 22, 15, '500 mg'],
				[para, 3, 21, 0, '500 mg'],
				[para, 5, 12, 30, '1000 mg'],
				[para, 8, 20, 10, '500 mg'],
				[para, 11, 9, 45, '500 mg'],
				[para, 13, 22, 0, '500 mg'],
				[para, 16, 18, 20, '500 mg'],
				[para, 20, 13, 0, '500 mg'],
				[para, 24, 21, 40, '500 mg'],
				[ibu, 6, 16, 0, '400 mg'],
				[ibu, 14, 15, 30, '400 mg'],
				[ibu, 18, 10, 0, '400 mg']
			] as const) {
				doses.push({ v: 1, type: 'dose', at: at(ago, hh, mm), medicationId: id, status: 'taken', amount });
			}
			const [kneeEp, backEp] = await seedRecords(page.request, account, [
				{ v: 1, type: 'pain_episode', started: at(17, 9) },
				{ v: 1, type: 'pain_episode', started: at(29, 9), ended: at(19, 12) }
			]);
			const spot = (region: string, side: string, space: string, intensity: number) => ({
				region,
				side,
				space,
				u: 0.5,
				v: 0.5,
				intensity,
				qualities: []
			});
			const episodes: object[] = [];
			for (const ago of [17, 15, 12, 9, 6, 3]) {
				episodes.push({
					v: 1,
					type: 'pain',
					at: at(ago, 18),
					points: [spot('knee', 'right', '2d-front-v1', 3 + (ago % 4))],
					episode: kneeEp
				});
			}
			for (const ago of [29, 27, 24, 21, 19]) {
				episodes.push({
					v: 1,
					type: 'pain',
					at: at(ago, 8),
					points: [spot('lower_back', 'midline', '2d-back-v1', 4 + (ago % 3))],
					episode: backEp
				});
			}
			const notes = [
				[2, 'Slept badly, woke twice. Knee stiff in the morning.'],
				[9, 'Long walk with the dog, no problems afterwards.'],
				[15, 'Started taking the vitamin with breakfast instead of lunch.']
			].map(([ago, text]) => ({ v: 1, type: 'note', at: at(ago as number, 20), text, tags: [] }));
			await seedRecords(page.request, account, [
				...month(gluten!, heartRate!),
				...heatSet(),
				...doses,
				...episodes,
				...notes
			]);

			await page.goto('/reports');
			await unlockWith(page, account.passphrase);
			await page.getByRole('heading', { name: 'Reports', level: 1 }).waitFor({ timeout: 20_000 });
			await snap(page, 'reports', scheme);

			await page.getByTestId('report-doctor').click();
			await page.getByRole('heading', { name: 'Doctor visit', level: 1 }).waitFor();
			await page.getByLabel('Name on the report').fill('Sam Example');
			await page
				.getByLabel(/^Questions for your doctor/)
				.fill('Is it worth changing when I take the omeprazole? The back pain is worse in the evenings.');
			await page.getByText('3 notes').waitFor();
			await page.setViewportSize({ width: 375, height: 1500 });
			await snap(page, 'options', scheme, true);
			await page.setViewportSize({ width: 375, height: 812 });
			if (scheme !== 'light') return;

			const shoot = async (language: string, file: string, headache: boolean) => {
				await page.emulateMedia({ media: 'screen', colorScheme: scheme });
				await page.getByRole('radio', { name: language }).click();
				await page.getByRole('checkbox', { name: /^Notes/ }).setChecked(true);
				await page.getByRole('checkbox', { name: /^Add the Headache diary pages/ }).setChecked(headache);
				await page.getByRole('button', { name: 'Preview report' }).click();
				await page.getByTestId('doctor-page').first().waitFor();
				await page.emulateMedia({ media: 'print', colorScheme: scheme });
				await page.setViewportSize({ width: 794, height: 1123 });
				await page.waitForTimeout(300);
				const sheets = page.locator('.dsheet, .report-sheet');
				const total = await sheets.count();
				console.log(`${file}: ${total} sheets`);
				for (let i = 0; i < total; i++) {
					await page.evaluate(() => window.scrollTo(0, 0));
					const box = (await sheets.nth(i).boundingBox())!;
					await page.screenshot({
						path: `docs/screenshots/${folder}/${file}-page${i + 1}.png`,
						fullPage: true,
						clip: { x: box.x, y: box.y, width: box.width, height: box.height }
					});
				}
				await page.setViewportSize({ width: 375, height: 812 });
				await page.emulateMedia({ media: 'screen', colorScheme: scheme });
				await page.waitForTimeout(200);
				if (file === 'report-en') await snap(page, 'preview', scheme);
				await page.getByRole('button', { name: /^(Back|Tilbage)$/ }).click();
			};
			await shoot('English', 'report-en', false);
			await shoot('Dansk', 'report-da', true);
		});
		test(`export ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'export', 'export screenshots only');
			await prepare(page, scheme);
			await page.addInitScript(() => {
				Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
			});
			const user = await signUpAndSignIn(page);
			const dialog = page.getByRole('dialog');
			// A note, a weight and three meals with a synthetic photo each.
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Note', exact: true }).click();
			await page.getByLabel('Note text').fill('Slept well, short walk after lunch');
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(dialog).toBeHidden();
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Weight', exact: true }).click();
			await page.getByLabel('Value', { exact: true }).fill('72.4');
			await dialog.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(dialog).toBeHidden();
			const png = await page.evaluate(async () => {
				const canvas = document.createElement('canvas');
				canvas.width = 1200;
				canvas.height = 900;
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = '#e8c9a8';
				ctx.fillRect(0, 0, 1200, 900);
				ctx.fillStyle = '#6b8f71';
				ctx.beginPath();
				ctx.arc(600, 450, 260, 0, Math.PI * 2);
				ctx.fill();
				const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
				return Array.from(new Uint8Array(await blob.arrayBuffer()));
			});
			for (const text of ['Porridge with berries', 'Soup and bread', 'Apple']) {
				await page.getByRole('button', { name: 'Log something' }).click();
				await page.getByRole('button', { name: 'Meal', exact: true }).click();
				await page.getByLabel('What did you have?').fill(text);
				await dialog.locator('input[type=file]').setInputFiles({
					name: 'synthetic.png',
					mimeType: 'image/png',
					buffer: Buffer.from(png)
				});
				await expect(dialog.getByRole('img', { name: 'Photo attached to this entry' })).toBeVisible();
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible({
					timeout: 15_000
				});
				await expect(dialog).toBeHidden();
			}

			// Let the last "Saved" toast go away before taking pictures.
			await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeHidden({
				timeout: 15_000
			});
			await page.getByRole('link', { name: 'Me', exact: true }).click();
			const card = page.locator('section.card').filter({
				has: page.getByRole('heading', { name: 'Your data', exact: true })
			});
			await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
			await page.waitForTimeout(300);
			await snap(page, 'me-your-data', scheme);
			await page.evaluate(() => document.querySelector('div.danger')!.scrollIntoView({ block: 'center' }));
			await page.waitForTimeout(300);
			await snap(page, 'me-delete-account', scheme);

			await page.getByTestId('export-link').click();
			await expect(page.getByRole('heading', { name: 'Download my data', level: 1 })).toBeVisible();
			await snap(page, 'export-page', scheme, true);

			await page.getByRole('button', { name: 'Prepare download' }).click();
			await dialog.getByLabel('Passphrase').fill(user.passphrase);
			await page.waitForTimeout(400);
			await snap(page, 'export-passphrase', scheme);

			// Slow the photo downloads a little so the progress state can be captured.
			await page.route('**/api/attachments/*', async (route) => {
				await new Promise((r) => setTimeout(r, 2500));
				await route.continue();
			});
			await dialog.getByRole('button', { name: 'Continue' }).click();
			await expect(page.getByText(/Preparing… [12] of 3 photos/)).toBeVisible({ timeout: 20_000 });
			await snap(page, 'export-preparing', scheme, true);
			await expect(page.getByRole('heading', { name: 'Your file is ready' })).toBeVisible({
				timeout: 30_000
			});
			await snap(page, 'export-ready', scheme, true);
		});
	});
}

// Naps as separate sleep entries (SCREENSHOTS=naps): sheets, timeline, Trends sleep card, doctor report.
for (const scheme of ['light', 'dark'] as const) {
	test(`naps ${scheme}`, async ({ page }) => {
		test.skip(folder !== 'naps', 'naps screenshots only');
		await prepare(page, scheme);
		await page.goto('/'); // the server creates its database on the first request
		const account = await signUpApiAccount(page.request);
		const records: object[] = [];
		for (let d = 0; d <= 24; d++) {
			records.push({
				v: 1,
				type: 'sleep',
				asleepAt: at(d + 1, 23, 20 + ((d * 7) % 50)),
				at: at(d, 6, 40 + ((d * 5) % 40)),
				...(d % 3 === 0 ? { quality: 3 + (d % 3) } : {})
			});
			if (d % 4 === 1 || d === 0)
				records.push({
					v: 1,
					type: 'sleep',
					kind: 'nap',
					asleepAt: at(d, 13, 20),
					at: at(d, 13, 20 + 30 + ((d * 5) % 40))
				});
		}
		await seedRecords(page.request, account, records);
		await page.goto('/');
		await page.getByRole('heading', { name: 'Your diary is locked' }).waitFor();
		await unlockWith(page, account.passphrase);
		await page
			.getByText('Nap 45 min')
			.or(page.getByText(/^Nap \d/))
			.first()
			.waitFor({ timeout: 20_000 });
		await page.waitForTimeout(400);
		await snap(page, 'timeline', scheme);

		const sheet = page.getByRole('dialog');
		await page.getByRole('button', { name: 'Log something' }).click();
		await page.getByRole('button', { name: 'Sleep', exact: true }).click();
		await sheet.getByRole('radio', { name: 'Main sleep' }).click();
		await sheet
			.getByRole('radiogroup', { name: 'How did you sleep?' })
			.getByRole('radio', { name: '4/5' })
			.click();
		await page.waitForTimeout(400);
		await snap(page, 'sheet-main', scheme);
		await sheet.getByRole('radio', { name: 'Nap', exact: true }).click();
		await page.waitForTimeout(400);
		await snap(page, 'sheet-nap', scheme);
		await page.getByRole('button', { name: 'Close' }).click();

		await page.getByRole('link', { name: 'Trends', exact: true }).click();
		const card = page.locator('section.card').filter({
			has: page.getByRole('heading', { name: 'Sleep', exact: true })
		});
		await card.waitFor({ timeout: 20_000 });
		await card.scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);
		await snap(page, 'trends-sleep', scheme);

		await page.getByRole('link', { name: 'Reports' }).click();
		await page.getByTestId('report-doctor').click();
		await page.getByRole('heading', { name: 'Doctor visit', level: 1 }).waitFor({ timeout: 20_000 });
		await page.getByLabel('Name on the report').fill('Sam Example');
		await page.getByRole('button', { name: 'Preview report' }).click();
		await page.getByTestId('doctor-page').first().waitFor();
		await page.emulateMedia({ media: 'print', colorScheme: scheme });
		await page.setViewportSize({ width: 794, height: 1123 });
		await page.waitForTimeout(300);
		const sheetEl = page.locator('.dsheet, .report-sheet').filter({ hasText: 'Main sleep' }).first();
		const box = (await sheetEl.boundingBox())!;
		await page.screenshot({
			path: `docs/screenshots/${folder}/doctor-report-sleep-${scheme}.png`,
			fullPage: true,
			clip: { x: box.x, y: box.y, width: box.width, height: box.height }
		});
	});

	test(`edit keeps time ${scheme}`, async ({ page }) => {
		test.skip(folder !== 'edit-keeps-time', 'edit-keeps-time screenshots only');
		await prepare(page, scheme);
		const account = await signUpApiAccount(page.request);
		await seedRecords(page.request, account, [
			{ v: 1, type: 'feeling', at: at(1, 8, 15), mood: 4, energy: 3, stress: 2, symptoms: [] }
		]);
		await page.goto('/');
		await unlockWith(page, account.passphrase);
		const days = page.getByRole('group', { name: 'Choose a day' }).locator('button[aria-pressed]');
		const marks = await Promise.all((await days.all()).map((b) => b.getAttribute('aria-current')));
		const idx = marks.indexOf('date');
		if (idx > 0) await days.nth(idx - 1).click();
		else {
			await page.getByRole('button', { name: 'Previous week' }).click();
			await days.last().click();
		}
		await page.getByText(/Mood 4 · Energy 3 · Stress 2/).click();
		await page.getByRole('dialog').getByLabel('Time of the entry').waitFor();
		await page.waitForTimeout(400);
		await snap(page, 'edit-sheet-original-time', scheme);
	});

	test(`age and consent ${scheme}`, async ({ page }) => {
		test.skip(folder !== 'age-and-consent', 'age-and-consent screenshots only');
		test.setTimeout(120_000);
		await prepare(page, scheme);
		await page.goto(`/join#t=${createInvite()}`);
		await page.getByRole('button', { name: 'Get started' }).click();
		await page.getByLabel('Username').fill(newUsername('shot'));
		const passphrase = newPassphrase();
		await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
		await page.getByLabel('Repeat passphrase').fill(passphrase);
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('heading', { name: 'Your recovery key' }).waitFor({ timeout: 30_000 });
		const groups = await page.getByTestId('recovery-key').locator('span').allTextContents();
		await page.getByRole('button', { name: "I've stored it. Check me" }).click();
		const lead = (await page.getByText(/Type group \d+ and group \d+/).textContent()) ?? '';
		const [a, b] = [...lead.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
		await page.getByLabel(`Group ${a} (4 characters)`).fill(groups[a! - 1]!);
		await page.getByLabel(`Group ${b} (4 characters)`).fill(groups[b! - 1]!);
		await page.getByRole('button', { name: 'Confirm' }).click();
		await page.getByRole('heading', { name: 'Before you start' }).waitFor();
		await page.getByRole('checkbox').check();
		await snap(page, 'consent', scheme, true);
		await page.getByTestId('consent-read').click();
		await page.getByRole('heading', { name: 'Your privacy', level: 1 }).waitFor();
		await snap(page, 'consent-privacy-in-join', scheme);
		await page.getByTestId('privacy-back').click();
		await page.getByRole('button', { name: 'Create my diary' }).click();
		await page.getByRole('navigation', { name: 'Main' }).waitFor({ timeout: 30_000 });
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await page.getByTestId('privacy-link').waitFor();
		await snap(page, 'me-with-privacy-card', scheme, true);
		await page.getByTestId('privacy-link').click();
		await page.getByTestId('agreement').waitFor();
		await page.getByTestId('agreement-line').waitFor();
		await snap(page, 'privacy-top', scheme);
		await snap(page, 'privacy-full', scheme, true);
		await page.getByTestId('agreement-read').click();
		await page.getByTestId('agreement-text').waitFor();
		await snap(page, 'privacy-agreement-text', scheme);
	});

	test(`offline unlock ${scheme}`, async ({ page }) => {
		test.skip(folder !== 'offline-unlock', 'offline-unlock screenshots only');
		test.setTimeout(90_000);
		await prepare(page, scheme);
		await stubPush(page, endpointOf());
		const user = await signUpAndSignIn(page);
		for (const text of ['Porridge with berries', 'Short walk after lunch']) {
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.getByRole('button', { name: 'Note', exact: true }).click();
			await page.getByLabel('Note text').fill(text);
			await page.getByRole('button', { name: 'Save' }).click();
			await page.getByText('Note saved').waitFor();
			await page.getByText('Note saved').waitFor({ state: 'hidden', timeout: 15_000 });
		}
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		await page.getByRole('button', { name: 'Lock now' }).click();
		await page.getByRole('heading', { name: 'Your diary is locked' }).waitFor();
		await page.context().setOffline(true);
		await page.evaluate(() => window.dispatchEvent(new Event('offline')));
		await page.getByTestId('needs-connection').waitFor();
		await snap(page, 'unlock-offline', scheme);
		if (scheme === 'light') {
			await page.getByRole('radio', { name: 'Dansk' }).click();
			await page.getByText('Du er offline.').waitFor();
			await snap(page, 'unlock-offline-da', scheme);
			await page.getByRole('radio', { name: 'English' }).click();
		}
		await unlockWith(page, user.passphrase);
		await page.getByRole('link', { name: 'Today', exact: true }).click();
		await page.getByText('Short walk after lunch').waitFor({ timeout: 15_000 });
		await snap(page, 'today-offline-unlocked', scheme);
		await page.getByRole('link', { name: 'Me', exact: true }).click();
		const card = page.getByTestId('reminders-card');
		await card.getByTestId('needs-connection').waitFor();
		await card.scrollIntoViewIfNeeded();
		await snap(page, 'me-reminders-offline', scheme);
		if (scheme === 'light') {
			await page.getByRole('radio', { name: 'Dansk' }).click();
			await card.getByText('Kræver forbindelse.').waitFor();
			await card.scrollIntoViewIfNeeded();
			await snap(page, 'me-reminders-offline-da', scheme);
		}
	});

	test(`privacy signed out ${scheme}`, async ({ page }) => {
		test.skip(folder !== 'age-and-consent', 'age-and-consent screenshots only');
		await prepare(page, scheme);
		await page.goto('/privacy');
		await page.getByRole('heading', { name: 'Your privacy', level: 1 }).waitFor();
		await snap(page, 'privacy-signed-out', scheme, true);
	});
}

// Danish review (SCREENSHOTS=danish-review): the main screens with the app language set to Dansk, light only.
test('danish review screens', async ({ page }) => {
	test.skip(folder !== 'danish-review', 'danish-review screenshots only');
	test.setTimeout(240_000);
	await prepare(page, 'light');
	await page.addInitScript(() => localStorage.setItem('locale', 'da'));
	const account = await signUpApiAccount(page.request);
	const start = addDays(todayKey(), -60);
	const medBase = { v: 1, type: 'medication', times: [], start, reminders: false, archived: false };
	const [gluten, , heartRate, mg, omep, para] = await seedRecords(page.request, account, [
		watchRecord,
		watchRecord2,
		heartRateType,
		{
			...medBase,
			name: 'Magnesium',
			strength: 250,
			unit: 'mg',
			form: 'tablet',
			schedule: { kind: 'daily' },
			times: [
				{ time: '08:00', amount: '1' },
				{ time: '20:00', amount: '1' }
			],
			reminders: true
		},
		{
			...medBase,
			name: 'Omeprazol',
			strength: 20,
			unit: 'mg',
			form: 'capsule',
			schedule: { kind: 'weekdays', days: [1, 3, 5] },
			times: [{ time: '07:30', amount: '1' }]
		},
		{
			...medBase,
			name: 'Paracetamol',
			strength: 500,
			unit: 'mg',
			form: 'tablet',
			schedule: { kind: 'as_needed' }
		}
	]);
	const head = (side: string, intensity: number, qualities: string[] = []) => ({
		region: 'temple',
		side,
		space: '2d-head-front-v2',
		u: 0.5,
		v: 0.5,
		intensity,
		qualities
	});
	const extra: object[] = [];
	[1, 2, 4, 5, 7, 9, 10, 12, 13].forEach((d, i) => {
		const h = 7 + (i % 5) * 3;
		extra.push({
			v: 1,
			type: 'pain',
			at: at(d, h),
			points: [head(i % 2 ? 'left' : 'right', 3 + (i % 4) * 2, i % 2 ? ['constant'] : ['throbbing'])],
			headache: {
				started: at(d, h),
				stopped: at(d, Math.min(h + 4, 23)),
				...(i % 3 === 0 ? { before: ['vision'] } : {}),
				worseWithActivity: i % 2 === 0,
				light: i % 2 === 0,
				sound: i % 4 === 0,
				...(i % 3 === 0 ? { trigger: 'Dårlig søvn' } : {})
			}
		});
		if (i % 2 === 0)
			extra.push({
				v: 1,
				type: 'gut',
				at: at(d, h + 1),
				symptoms: [{ kind: 'nausea', intensity: 1 + (i % 5) }],
				flags: []
			});
		extra.push({
			v: 1,
			type: 'dose',
			at: at(d, h + 1, 10),
			medicationId: para!,
			status: 'taken',
			amount: '500 mg'
		});
	});
	for (let ago = 1; ago <= 29; ago++) {
		const day = addDays(todayKey(), -ago);
		extra.push({
			v: 1,
			type: 'dose',
			at: at(ago, 8, ago % 11 === 0 ? 40 : 3),
			medicationId: mg!,
			status: ago % 11 === 0 ? 'late' : 'taken',
			amount: '1',
			slot: { date: day, time: '08:00' }
		});
		const weekday = new Date(day + 'T12:00:00').getDay();
		if ([1, 3, 5].includes(weekday))
			extra.push({
				v: 1,
				type: 'dose',
				at: at(ago, 7, 33),
				medicationId: omep!,
				status: ago === 9 ? 'skipped' : 'taken',
				amount: '1',
				slot: { date: day, time: '07:30' }
			});
	}
	extra.push(
		...[
			[2, 'Sov dårligt, vågnede to gange. Knæet var stift om morgenen.'],
			[9, 'Lang gåtur med hunden, ingen problemer bagefter.']
		].map(([ago, text]) => ({ v: 1, type: 'note', at: at(ago as number, 20), text, tags: [] }))
	);
	await seedRecords(page.request, account, [...month(gluten!, heartRate!), ...heatSet(), ...extra]);

	await page.goto('/');
	await page.getByLabel('Adgangssætning', { exact: true }).fill(account.passphrase);
	await page.getByRole('button', { name: 'Lås op' }).click();
	await expect(page.getByRole('heading', { name: 'Din dagbog er låst' })).toBeHidden({ timeout: 30_000 });
	await page.getByRole('navigation', { name: 'Hovedmenu' }).waitFor();
	await page.waitForTimeout(800);
	await snap(page, 'today', 'light');

	await page.getByRole('button', { name: 'Registrér noget' }).click();
	await page.waitForTimeout(400);
	await snap(page, 'quicklog', 'light');

	const sheet = page.getByRole('dialog', { name: 'Hvor mærker du det?' });
	await page.getByRole('button', { name: 'Smerter', exact: true }).click();
	await page.waitForTimeout(400);
	await sheet.locator('svg[role=group]').getByRole('button', { name: 'Dit højre knæ', exact: true }).click();
	await sheet
		.getByRole('radiogroup', { name: /^Styrke/ })
		.getByRole('radio', { name: '6', exact: true })
		.click();
	await sheet.getByRole('button', { name: 'Pulserende', exact: true }).click();
	await page.waitForTimeout(300);
	await snap(page, 'pain-sheet', 'light');
	await sheet.getByRole('button', { name: 'Luk' }).first().click();
	await page.waitForTimeout(400);

	await page.getByRole('link', { name: 'Medicin', exact: true }).click();
	await page.getByRole('heading', { name: 'Medicin', level: 1 }).waitFor();
	await page.waitForTimeout(500);
	await snap(page, 'meds', 'light', true);

	await page.getByRole('link', { name: 'Udvikling', exact: true }).click();
	await page.getByRole('heading', { name: 'Udvikling', level: 1 }).waitFor();
	await page.waitForTimeout(800);
	await snap(page, 'trends', 'light', true);

	await page.getByRole('link', { name: 'Mig', exact: true }).click();
	await page.getByTestId('privacy-link').waitFor();
	await snap(page, 'me', 'light', true);
	await page.getByTestId('privacy-link').click();
	await page.getByTestId('agreement').waitFor();
	await snap(page, 'privacy', 'light', true);

	// Reports: print views, report language Dansk.
	await page.getByRole('link', { name: 'Udvikling', exact: true }).click();
	await page
		.getByRole('link', { name: 'Rapporter' })
		.or(page.getByRole('button', { name: 'Rapporter' }))
		.first()
		.click();
	await page.getByRole('heading', { name: 'Rapporter', level: 1 }).waitFor();
	await snap(page, 'reports', 'light');

	await page.getByTestId('report-headache').click();
	await page.getByRole('heading', { name: 'Hovedpinedagbog', level: 1 }).waitFor();
	await page.getByLabel('Navn på rapporten').fill('Sam Eksempel');
	await snap(page, 'headache-options', 'light', true);
	const shoot = async (
		layout: RegExp | null,
		file: string,
		make: string,
		sheetsSel: string,
		size: [number, number]
	) => {
		await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
		if (layout) await page.getByRole('radio', { name: layout }).click();
		await page.getByRole('radio', { name: 'Dansk' }).click();
		await page.getByRole('button', { name: make }).click();
		await page.waitForTimeout(500);
		await page.emulateMedia({ media: 'print', colorScheme: 'light' });
		await page.setViewportSize({ width: size[0], height: size[1] });
		await page.waitForTimeout(300);
		const sheets = page.locator(sheetsSel);
		const total = await sheets.count();
		for (let i = 0; i < total; i++) {
			await page.evaluate(() => window.scrollTo(0, 0));
			const box = (await sheets.nth(i).boundingBox())!;
			await page.screenshot({
				path: `docs/screenshots/${folder}/${file}-side${i + 1}.png`,
				fullPage: true,
				clip: { x: box.x, y: box.y, width: box.width, height: box.height }
			});
		}
		await page.setViewportSize({ width: 375, height: 812 });
		await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
		await page.waitForTimeout(200);
		await page.getByRole('button', { name: /^Tilbage$/ }).click();
	};
	await page.getByRole('button', { name: 'Seneste 28 dage' }).click();
	await shoot(/Overskuelig tabel/, 'headache-table', 'Lav rapport', '.report-sheet', [1122, 793]);
	await shoot(/Som papirskemaet/, 'headache-form', 'Lav rapport', '.report-sheet', [793, 1122]);

	await page.getByRole('link', { name: 'Tilbage til Rapporter' }).click();
	await page.getByTestId('report-doctor').click();
	await page.getByRole('heading', { name: 'Lægebesøg', level: 1 }).waitFor();
	await page.getByLabel('Navn på rapporten').fill('Sam Eksempel');
	await page
		.getByLabel(/^Spørgsmål til din læge/)
		.fill('Kan jeg flytte tidspunktet for omeprazol? Rygsmerterne er værre om aftenen.');
	await page.waitForTimeout(500);
	await page.setViewportSize({ width: 375, height: 1500 });
	await snap(page, 'doctor-options', 'light', true);
	await page.setViewportSize({ width: 375, height: 812 });
	await shoot(null, 'doctor', 'Se rapporten', '.dsheet, .report-sheet', [794, 1123]);
});

// Offline outbox (SCREENSHOTS=offline-outbox): waiting entries, the Sync card, the sign-out warning.
test.describe('offline outbox', () => {
	// Without the service worker, `page.route` and offline mode behave the same in every browser.
	test.use({ serviceWorkers: 'block' });
	const QUEUED = "Saved on this device. It will sync when you're back online.";
	const offline = async (page: Page, off: boolean) => {
		await page.context().setOffline(off);
		await page.evaluate((o) => window.dispatchEvent(new Event(o ? 'offline' : 'online')), off);
	};
	const note = async (page: Page, text: string, toast: string) => {
		await page.getByRole('button', { name: 'Log something' }).click();
		await page.getByRole('button', { name: 'Note', exact: true }).click();
		await page.getByLabel('Note text').fill(text);
		await page.getByRole('button', { name: 'Save' }).click();
		await page.getByText(toast).waitFor();
		await page.getByRole('dialog').waitFor({ state: 'hidden' });
	};

	for (const scheme of ['light', 'dark'] as const) {
		test(`offline outbox ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'offline-outbox', 'offline-outbox screenshots only');
			test.setTimeout(120_000);
			await prepare(page, scheme);
			// The icon sprite is normally kept by the service worker; here it is served from disk, also while offline.
			await page.route('**/icons.svg', (route) =>
				route.fulfill({ path: 'static/icons.svg', contentType: 'image/svg+xml' })
			);
			await stubPush(page, endpointOf());
			await signUpAndSignIn(page);
			await note(page, 'Slept well, woke up rested', 'Note saved');
			// Open Me once while online, so its code is loaded before the connection goes.
			await page.getByRole('link', { name: 'Me', exact: true }).click();
			await page.getByRole('button', { name: 'Sign out' }).waitFor();
			await page.getByRole('link', { name: 'Today', exact: true }).click();

			await offline(page, true);
			await note(page, 'Porridge with berries', QUEUED);
			await page.getByText(QUEUED).waitFor({ state: 'hidden', timeout: 15_000 });
			await note(page, 'Short walk after lunch', QUEUED);
			await page.getByText('Offline · 2 not synced yet').waitFor();
			await snap(page, 'today-offline-waiting', scheme);
			await page.getByText(QUEUED).waitFor({ state: 'hidden', timeout: 15_000 });
			await snap(page, 'today-offline-waiting-full', scheme, true);

			await page.getByRole('link', { name: 'Me', exact: true }).click();
			await page.getByTestId('sync-card').waitFor();
			await snap(page, 'me-sync-card', scheme);
			if (scheme === 'light') {
				await page.getByRole('radio', { name: 'Dansk' }).click();
				await page.getByText('venter på at blive synkroniseret').waitFor();
				await page.getByRole('heading', { name: 'Mig', level: 1 }).scrollIntoViewIfNeeded();
				await snap(page, 'me-sync-card-da', scheme);
				await page.getByRole('link', { name: 'I dag', exact: true }).click();
				await page.getByText('Offline · 2 ikke synkroniseret endnu').waitFor();
				await snap(page, 'today-offline-waiting-da', scheme);
				await page.getByRole('link', { name: 'Mig', exact: true }).click();
				await page.getByRole('radio', { name: 'English' }).click();
			}

			await page.getByRole('button', { name: 'Sign out' }).click();
			await page.getByTestId('signout-warning').waitFor();
			await page.waitForTimeout(400);
			await snap(page, 'signout-warning', scheme);
			if (scheme === 'light') {
				await page.getByRole('button', { name: 'Stay signed in' }).click();
				await page.getByRole('radio', { name: 'Dansk' }).click();
				await page.getByRole('button', { name: 'Log ud' }).click();
				await page.getByTestId('signout-warning').waitFor();
				await page.waitForTimeout(400);
				await snap(page, 'signout-warning-da', scheme);
				await page.getByRole('button', { name: 'Bliv logget ind' }).click();
				await page.getByRole('radio', { name: 'English' }).click();
			} else {
				await page.getByRole('button', { name: 'Stay signed in' }).click();
			}

			// Back online, but the server answers slowly: the pill says "Syncing 2…".
			await page.route('**/api/records/*', () => new Promise(() => undefined));
			await page.getByRole('link', { name: 'Today', exact: true }).click();
			await offline(page, false);
			await page.getByText('Syncing 2…').waitFor();
			await snap(page, 'today-syncing', scheme);
		});

		test(`refused change ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'offline-outbox', 'offline-outbox screenshots only');
			await prepare(page, scheme);
			await stubPush(page, endpointOf());
			await signUpAndSignIn(page);
			await page.route('**/api/records/*', (route) =>
				route.request().method() === 'PUT'
					? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"bad_request"}' })
					: route.continue()
			);
			await note(page, 'Short walk after lunch', "Saved on this device, but the server didn't accept it.");
			await page.getByText("1 couldn't be synced").first().waitFor();
			await snap(page, 'today-refused', scheme);
			await page.getByRole('link', { name: 'Me', exact: true }).click();
			await page.getByTestId('sync-card').waitFor();
			await snap(page, 'me-sync-card-refused', scheme);
		});
	}
});

// Offline photos (SCREENSHOTS=offline-photos): a queued photo in the sheet and on Today, the placeholder for a photo on
// the server, the Sync card with a refused photo. Synthetic images only.
test.describe('offline photos', () => {
	test.use({ serviceWorkers: 'block' });
	const QUEUED = "Saved on this device. It will sync when you're back online.";
	const offline = async (page: Page, off: boolean) => {
		await page.context().setOffline(off);
		await page.evaluate((o) => window.dispatchEvent(new Event(o ? 'offline' : 'online')), off);
	};
	const png = async (page: Page) =>
		Buffer.from(
			await page.evaluate(async () => {
				const canvas = document.createElement('canvas');
				canvas.width = 800;
				canvas.height = 600;
				const ctx = canvas.getContext('2d')!;
				ctx.fillStyle = '#e8c9a8';
				ctx.fillRect(0, 0, 800, 600);
				ctx.fillStyle = '#6b8f71';
				ctx.beginPath();
				ctx.arc(400, 300, 200, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = '#a94e2e';
				ctx.fillRect(100, 80, 160, 100);
				const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
				return Array.from(new Uint8Array(await blob.arrayBuffer()));
			})
		);
	const pickPhoto = async (page: Page, text: string) => {
		await page.getByRole('button', { name: 'Log something' }).click();
		await page.getByRole('button', { name: 'Meal', exact: true }).click();
		await page.getByLabel('What did you have?').fill(text);
		await page
			.getByRole('dialog')
			.locator('input[type=file]')
			.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: await png(page) });
		await page.getByRole('dialog').getByRole('img', { name: 'Photo attached to this entry' }).waitFor();
	};
	const saveMeal = async (page: Page, toast: string) => {
		await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
		await page.getByText(toast, { exact: true }).waitFor({ timeout: 15_000 });
		await page.getByRole('dialog').waitFor({ state: 'hidden' });
	};

	for (const scheme of ['light', 'dark'] as const) {
		test(`queued photo ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'offline-photos', 'offline-photos screenshots only');
			test.setTimeout(120_000);
			await prepare(page, scheme);
			await page.route('**/icons.svg', (route) =>
				route.fulfill({ path: 'static/icons.svg', contentType: 'image/svg+xml' })
			);
			await stubPush(page, endpointOf());
			await signUpAndSignIn(page);
			// Open Me once while online, so its code is loaded before the connection goes.
			await page.getByRole('link', { name: 'Me', exact: true }).click();
			await page.getByRole('button', { name: 'Sign out' }).waitFor();
			await page.getByRole('link', { name: 'Today', exact: true }).click();
			await offline(page, true);
			await pickPhoto(page, 'Porridge with berries');
			const badge = page.getByRole('dialog').getByTestId('photo-queued');
			await badge.scrollIntoViewIfNeeded();
			await page.waitForTimeout(300);
			await snap(page, 'meal-sheet-queued', scheme);
			await saveMeal(page, QUEUED);
			await page.getByText(QUEUED).waitFor({ state: 'hidden', timeout: 15_000 });
			await page.getByRole('button', { name: 'Open photo' }).getByTestId('photo-queued').waitFor();
			await snap(page, 'today-offline-queued', scheme);
			if (scheme === 'light') {
				await page.getByRole('link', { name: 'Me', exact: true }).click();
				await page.getByRole('radio', { name: 'Dansk' }).click();
				await page.getByRole('link', { name: 'I dag', exact: true }).click();
				await page.getByText('Venter på upload').first().waitFor();
				await snap(page, 'today-offline-queued-da', scheme);
				await page.getByRole('button', { name: 'Registrér noget' }).click();
				await page.getByRole('button', { name: 'Måltid', exact: true }).click();
				await page
					.getByRole('dialog')
					.locator('input[type=file]')
					.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: await png(page) });
				const dbadge = page.getByRole('dialog').getByTestId('photo-queued');
				await dbadge.waitFor();
				await dbadge.scrollIntoViewIfNeeded();
				await page.waitForTimeout(300);
				await snap(page, 'meal-sheet-queued-da', scheme);
			}
		});

		test(`photo on the server while offline ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'offline-photos', 'offline-photos screenshots only');
			test.setTimeout(120_000);
			await prepare(page, scheme);
			await page.route('**/icons.svg', (route) =>
				route.fulfill({ path: 'static/icons.svg', contentType: 'image/svg+xml' })
			);
			await stubPush(page, endpointOf());
			const user = await signUpAndSignIn(page);
			await pickPhoto(page, 'Soup with bread');
			await saveMeal(page, 'Saved');
			await page.getByRole('button', { name: 'Open photo' }).getByRole('img').waitFor();
			// A fresh load while the photo downloads fail, as they do without a connection.
			await page.route('**/api/attachments/*', (route) => route.abort());
			await page.reload();
			await page.getByRole('heading', { name: 'Your diary is locked' }).waitFor();
			await unlockWith(page, user.passphrase);
			await page.getByTestId('photo-offline-tile').waitFor({ timeout: 15_000 });
			await snap(page, 'photo-offline-placeholder', scheme);
			if (scheme === 'light') {
				await page.getByRole('link', { name: 'Me', exact: true }).click();
				await page.getByRole('radio', { name: 'Dansk' }).click();
				await page.getByRole('link', { name: 'I dag', exact: true }).click();
				await page.getByText('Gemte fotos vises, når du er online.').waitFor();
				await snap(page, 'photo-offline-placeholder-da', scheme);
			}
		});

		test(`refused photo ${scheme}`, async ({ page }) => {
			test.skip(folder !== 'offline-photos', 'offline-photos screenshots only');
			test.setTimeout(120_000);
			await prepare(page, scheme);
			await stubPush(page, endpointOf());
			await signUpAndSignIn(page);
			await offline(page, true);
			await pickPhoto(page, 'Toast with jam');
			await saveMeal(page, QUEUED);
			await page.route('**/api/attachments/*', (route) =>
				route.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"too_large"}' })
			);
			await offline(page, false);
			await page.getByRole('link', { name: 'Me', exact: true }).click();
			await page.getByTestId('photos-refused').waitFor({ timeout: 15_000 });
			await page.getByText(QUEUED).waitFor({ state: 'hidden', timeout: 15_000 });
			await snap(page, 'me-sync-card-photo-refused', scheme);
		});
	}
});
