import { test as base, expect } from '@playwright/test';

/**
 * The browser logs "Failed to load resource: ... status of 401" for any HTTP 4xx answer, even when the app handles
 * it on purpose (no session yet, wrong passphrase, taken username). Those notices are expected on the account
 * screens. Everything else still fails the test: other console errors, CSP violations, uncaught errors, and 5xx.
 */
const EXPECTED_HTTP_NOTICE = /Failed to load resource: the server responded with a status of 4\d\d/;

/** Fails any test whose page logs a CSP violation or throws an uncaught error. */
export const test = base.extend<{ problems: string[] }>({
	problems: async ({ page }, use) => {
		const problems: string[] = [];
		page.on('console', (msg) => {
			const text = msg.text();
			if (EXPECTED_HTTP_NOTICE.test(text)) return;
			if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(text);
		});
		page.on('pageerror', (err) => problems.push(err.message));
		await use(problems);
		expect(problems, 'console errors or CSP violations').toEqual([]);
	}
});

export { expect };
