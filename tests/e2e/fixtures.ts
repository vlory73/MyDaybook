import { test as base, expect } from '@playwright/test';

/**
 * The browser logs "Failed to load resource: ... status of 401" for any HTTP 4xx answer, even when the app handles
 * it on purpose (no session yet, wrong passphrase, taken username). Those notices are expected on the account
 * screens. Everything else still fails the test: other console errors, CSP violations, uncaught errors, and 5xx.
 */
const EXPECTED_HTTP_NOTICE = /Failed to load resource: the server responded with a status of 4\d\d/;

/**
 * WebKit reports "Fetch API cannot load <url> due to access control checks." whenever a fetch is cancelled: by a
 * navigation, or by the app itself (e.g. signing out stops an in-flight /api/records sync). Real users see the same
 * harmless line. The wording varies (with or without the "Fetch API cannot load http:/" prefix) and it can arrive as
 * a console message or as a page error, so both are checked, anywhere in the text. Only our own server's /api/ paths
 * are ignored: the app makes no cross-origin requests, and a CSP block produces a different message, so genuine
 * problems still fail the test.
 */
const CANCELLED_OWN_API_FETCH = new RegExp(
	`/127\\.0\\.0\\.1:${process.env.E2E_PORT ?? 4173}/api/\\S* due to access control checks\\.`
);

/** Fails any test whose page logs a CSP violation or throws an uncaught error. */
export const test = base.extend<{ problems: string[] }>({
	problems: async ({ page }, use) => {
		const problems: string[] = [];
		page.on('console', (msg) => {
			const text = msg.text();
			if (EXPECTED_HTTP_NOTICE.test(text) || CANCELLED_OWN_API_FETCH.test(text)) return;
			if (msg.type() === 'error' || /Content Security Policy/i.test(text)) problems.push(text);
		});
		page.on('pageerror', (err) => {
			if (!CANCELLED_OWN_API_FETCH.test(err.message)) problems.push(err.message);
		});
		await use(problems);
		expect(problems, 'console errors or CSP violations').toEqual([]);
	}
});

export { expect };
