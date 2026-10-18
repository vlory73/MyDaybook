import { test as base, expect } from '@playwright/test';

/** Fails any test whose page logs a CSP violation or throws an uncaught error. */
export const test = base.extend<{ problems: string[] }>({
	problems: async ({ page }, use) => {
		const problems: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error' || /Content Security Policy/i.test(msg.text())) problems.push(msg.text());
		});
		page.on('pageerror', (err) => problems.push(err.message));
		await use(problems);
		expect(problems, 'console errors or CSP violations').toEqual([]);
	}
});

export { expect };
