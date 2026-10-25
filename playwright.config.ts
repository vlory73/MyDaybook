import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets several checkouts run the suite side by side (each has its own build and data directory).
const PORT = Number(process.env.E2E_PORT ?? 4173);
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// One retry on CI only: a test that passes on retry is reported as flaky. maxFailures stops a broken build
	// from retrying everything.
	retries: process.env.CI ? 1 : 0,
	maxFailures: process.env.CI ? 10 : 0,
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
			// No nightly backup job in tests; the CLI backup is exercised explicitly (backup-cli.spec.ts).
			BACKUP_TIME: 'off',
			// Photos are uploaded as raw ciphertext of up to 4 MiB; adapter-node's default limit is 512 kB (ARCHITECTURE §5.2).
			BODY_SIZE_LIMIT: '2M',
			DATA_DIR: 'test-results/e2e-data',
			// Plain http on 127.0.0.1: the session cookie is `sid` without Secure (ARCHITECTURE §3.2).
			COOKIE_SECURE: 'false',
			// Reminders (D7): a synthetic key pair so the feature is on, and no scheduler, so tests never call a push service.
			VAPID_PUBLIC_KEY:
				'BMeg_PsVjfOosJOG529LOXKd0LWZFTqK11kwK_i4bMfqBtDg6jLfz3Sj1Kx6416WFfHjCIVfH8sQL14LAkGfKKA',
			VAPID_PRIVATE_KEY: '3vafNk2m7XwfPBcyZ_fhLMKc_oBBZm5g-wpZCK0XgaY',
			VAPID_SUBJECT: 'mailto:e2e@example.invalid',
			PUSH_SCHEDULER: 'off',
			// Synthetic test value, not a secret.
			SESSION_SECRET: 'e2e-synthetic-session-secret-not-for-production',
			// Per-user-name burst is small enough for a quick rate-limit test; the IP bucket is loose because every
			// test shares 127.0.0.1.
			AUTH_RATE_USER_BURST: '20',
			AUTH_RATE_IP_BURST: '10000',
			// Shown on the Privacy page (privacy.spec.ts); synthetic.
			OPERATOR_NAME: 'Example operator',
			OPERATOR_CONTACT: 'privacy@example.invalid'
		}
	},
	projects: [
		{ name: 'phone-chromium', use: { ...devices['Desktop Chrome'], ...phone } },
		// WebKit approximates iOS Safari. CI installs it; the sandbox only has Chromium.
		...(process.env.CI ? [{ name: 'phone-webkit', use: { ...devices['Desktop Safari'], ...phone } }] : [])
	]
});
