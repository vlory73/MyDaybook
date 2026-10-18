import { test, type Page } from '@playwright/test';
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
