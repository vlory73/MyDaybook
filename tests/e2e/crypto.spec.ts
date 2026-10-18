import { test, expect } from './fixtures';

test('libsodium WASM loads under the strict CSP and Argon2id runs', async ({ page }) => {
	test.setTimeout(60_000);
	await page.goto('/styleguide');
	const result = page.getByTestId('crypto-selftest');
	await expect(result).toContainText('ok', { timeout: 30_000 });
	console.log(await result.textContent());
});
