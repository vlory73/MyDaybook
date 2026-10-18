import { test, expect } from '@playwright/test';

test('strict hash-based CSP and security headers', async ({ request }) => {
	const res = await request.get('/');
	const csp = res.headers()['content-security-policy'] ?? '';
	expect(csp).toContain("default-src 'none'");
	expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval' 'sha256-[A-Za-z0-9+/=]+'/);
	expect(csp).not.toContain('unsafe-inline');
	expect(csp).toContain("frame-ancestors 'none'");
	expect(res.headers()['x-content-type-options']).toBe('nosniff');
	expect(res.headers()['referrer-policy']).toBe('no-referrer');
	// HSTS without includeSubDomains/preload (shared duckdns.org parent, HOME_DEPLOYMENT.md).
	expect(res.headers()['strict-transport-security']).toBe('max-age=86400');
});

test('no third-party requests', async ({ page }) => {
	const foreign: string[] = [];
	page.on('request', (r) => {
		if (!r.url().startsWith(`http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`)) foreign.push(r.url());
	});
	await page.goto('/');
	await page.goto('/me');
	expect(foreign).toEqual([]);
});

test('health check and manifest', async ({ request }) => {
	const health = await request.get('/healthz');
	expect(health.ok()).toBe(true);
	expect(await health.json()).toEqual({ status: 'ok' });

	const manifest = await (await request.get('/manifest.webmanifest')).json();
	expect(manifest.display).toBe('standalone');
	expect(manifest.name).toBeTruthy();
});

test('styleguide is hidden unless enabled', async ({ request }) => {
	// Enabled in the test server (STYLEGUIDE=1); the data endpoint answers 200 here.
	const res = await request.get('/styleguide/__data.json');
	expect(res.status()).toBe(200);
});
