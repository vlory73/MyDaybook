import { test } from '@playwright/test';

// Phone-width screenshots for PRs (CLAUDE.md "How to work"): 375 x 812 at 2x, light and dark.
// Opt-in: SCREENSHOTS=<folder name> npx playwright test screenshots --project=phone-chromium
const folder = process.env.SCREENSHOTS;
test.skip(!folder, 'set SCREENSHOTS=<name> to capture');
// Only so full-page captures can pin the fixed tab bar to the bottom; never used in functional tests.
test.use({ bypassCSP: true });

const shots: {
	name: string;
	path: string;
	fullPage?: boolean;
	act?: (page: import('@playwright/test').Page) => Promise<void>;
}[] = [
	{ name: 'today', path: '/' },
	{
		name: 'quicklog',
		path: '/',
		act: async (page) => {
			await page.getByRole('button', { name: 'Log something' }).click();
			await page.waitForTimeout(400);
		}
	},
	{ name: 'me', path: '/me', fullPage: true },
	{ name: 'styleguide', path: '/styleguide', fullPage: true }
];

for (const scheme of ['light', 'dark'] as const) {
	for (const shot of shots) {
		test(`${shot.name} ${scheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
			await page.goto(shot.path);
			await page.waitForLoadState('networkidle');
			await shot.act?.(page);
			if (shot.fullPage)
				await page.addStyleTag({
					content: 'nav.tabbar{position:static !important}main.page{padding-bottom:24px !important}'
				});
			await page.screenshot({
				path: `docs/screenshots/${folder}/${shot.name}-${scheme}.png`,
				fullPage: shot.fullPage
			});
		});
	}
}
