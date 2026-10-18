import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
	webServer: {
		// Tests run against the production build, exactly as it ships.
		command: 'npm run build && node build',
		url: `http://127.0.0.1:${PORT}/healthz`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			PORT: String(PORT),
			HOST: '127.0.0.1',
			ORIGIN: `http://127.0.0.1:${PORT}`,
			STYLEGUIDE: '1',
			HSTS_MAX_AGE: '86400',
			ACCESS_LOG: 'off',
			DATA_DIR: 'test-results/e2e-data'
		}
	},
	projects: [
		{ name: 'phone-chromium', use: { ...devices['Desktop Chrome'], ...phone } },
		// WebKit approximates iOS Safari. CI installs it; the sandbox only has Chromium.
		...(process.env.CI ? [{ name: 'phone-webkit', use: { ...devices['Desktop Safari'], ...phone } }] : [])
	]
});
