import { test, type Page } from '@playwright/test';
import { previousStepCode } from './totp-code';
import { createInvite, newPassphrase, newUsername, signUpAndSignIn, signUpViaApi } from './helpers';

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
	});
}
