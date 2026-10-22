import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CI e2e container', () => {
	it('uses the Playwright image that matches the installed @playwright/test', () => {
		const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
		const version = lock.packages['node_modules/@playwright/test'].version;
		const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
		const tag = ci.match(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/)?.[1];
		expect(tag).toBe(version);
	});
});
