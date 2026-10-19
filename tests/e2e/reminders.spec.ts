import { randomBytes } from 'node:crypto';
import type { Page, Request } from '@playwright/test';
import { test, expect } from './fixtures';
import { addMedWithReminder, endpointOf, stubPush } from './push-stub';
import { JSON_HEADERS, signUpApiAccount, loginApi, signUpAndSignIn } from './helpers';

// Synthetic data only. `pushManager` is stubbed in the page (see push-stub.ts); the app, the API and the database are real.
const VAPID_PUBLIC_KEY =
	'BMeg_PsVjfOosJOG529LOXKd0LWZFTqK11kwK_i4bMfqBtDg6jLfz3Sj1Kx6416WFfHjCIVfH8sQL14LAkGfKKA';

const card = (page: Page) => page.getByTestId('reminders-card');
const isPut = (r: Request) => r.url().endsWith('/api/push/subscription') && r.method() === 'PUT';

test('turning reminders on subscribes the device and uploads only a time zone and times', async ({
	page
}) => {
	const endpoint = endpointOf();
	await stubPush(page, endpoint);
	await signUpAndSignIn(page, '/meds');
	const secret = `Synthol ${randomBytes(4).toString('hex')}`;
	await addMedWithReminder(page, secret, '08:00');
	await addMedWithReminder(page, `Other ${randomBytes(3).toString('hex')}`, '08:00', ['Mon', 'Wed']);

	const puts: Request[] = [];
	page.on('request', (r) => isPut(r) && puts.push(r));
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await expect(card(page)).toHaveAttribute('data-status', 'idle');
	await expect(page.getByText(/never contain health information/)).toBeVisible();
	await card(page).getByRole('switch', { name: 'Remind me on this device' }).click();
	await expect(card(page)).toHaveAttribute('data-status', 'on');
	await expect(page.getByTestId('reminders-count')).toHaveText('1 reminder time on this device.');

	expect(await page.evaluate(() => (window as unknown as { __push: unknown }).__push)).toMatchObject({
		subscribe: [{ userVisibleOnly: true, keyLength: 65 }]
	});
	expect(puts).toHaveLength(1);
	const body = puts[0]!.postDataJSON() as {
		endpoint: string;
		keys: Record<string, string>;
		schedule: { tz: string; slots: { time: string; days: number[] }[] };
	};
	expect(body.endpoint).toBe(endpoint);
	expect(Object.keys(body).sort()).toEqual(['endpoint', 'keys', 'schedule']);
	expect(body.schedule.slots).toEqual([{ time: '08:00', days: [0, 1, 2, 3, 4, 5, 6] }]); // merged
	expect(() => Intl.DateTimeFormat('en', { timeZone: body.schedule.tz })).not.toThrow();
	expect(JSON.stringify(body)).not.toContain(secret);

	// A medicine without reminders changes nothing, so nothing is uploaded.
	await page.getByRole('link', { name: 'Meds', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: /medication/i });
	await page.getByRole('button', { name: 'Add medication' }).click();
	await sheet.getByLabel('Name', { exact: true }).fill('Quiet one');
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();
	await page.waitForTimeout(500);
	expect(puts).toHaveLength(1);

	// A new reminder time is uploaded.
	await addMedWithReminder(page, 'Evening one', '21:30');
	await expect.poll(() => puts.length).toBe(2);
	const next = puts[1]!.postDataJSON() as { schedule: { slots: { time: string }[] } };
	expect(next.schedule.slots.map((s) => s.time)).toEqual(['08:00', '21:30']);

	// Turning it off removes the subscription from the server and the browser.
	const deleted = page.waitForRequest(
		(r) => r.method() === 'DELETE' && r.url().endsWith('/api/push/subscription')
	);
	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await card(page).getByRole('switch', { name: 'Remind me on this device' }).click();
	expect((await deleted).postDataJSON()).toEqual({ endpoint });
	await expect(card(page)).toHaveAttribute('data-status', 'idle');
});

test('signing out removes this device’s subscription', async ({ page }) => {
	await stubPush(page, endpointOf());
	await signUpAndSignIn(page, '/me');
	await card(page).getByRole('switch', { name: 'Remind me on this device' }).click();
	await expect(card(page)).toHaveAttribute('data-status', 'on');
	const deleted = page.waitForRequest(
		(r) => r.method() === 'DELETE' && r.url().endsWith('/api/push/subscription')
	);
	await page.getByRole('button', { name: 'Sign out' }).click();
	await deleted;
	await expect(page).toHaveURL(/\/login$/);
	expect(
		await page.evaluate(() => (window as unknown as { __push: { unsubscribed: number } }).__push.unsubscribed)
	).toBe(1);
});

test('permission denied is explained and offers no toggle', async ({ page }) => {
	await stubPush(page, endpointOf(), { permission: 'denied' });
	await signUpAndSignIn(page, '/me');
	await expect(card(page)).toHaveAttribute('data-status', 'denied');
	await expect(card(page).getByText(/Notifications are blocked for this app/)).toBeVisible();
	await expect(card(page).getByRole('switch')).toHaveCount(0);
});

test('an iPhone tab that is not on the Home Screen is told how to install', async ({ page }) => {
	await stubPush(page, endpointOf(), { ios: true });
	await signUpAndSignIn(page, '/me');
	await expect(card(page)).toHaveAttribute('data-status', 'ios-install');
	await expect(card(page).getByText(/Add to Home Screen/)).toBeVisible();
	await expect(card(page).getByText(/iOS 16\.4/)).toBeVisible();
	await expect(card(page).getByRole('switch')).toHaveCount(0);
});

test.describe('without the service worker', () => {
	// WebKit does not pass requests from a service-worker-controlled page through page.route; the push stub fakes the
	// registration, so the real worker is not needed here.
	test.use({ serviceWorkers: 'block' });

	test('when the server has no VAPID keys the card says reminders are not set up', async ({ page }) => {
		await stubPush(page, endpointOf());
		await page.route('**/api/push/key', (route) =>
			route.fulfill({ status: 503, json: { error: 'push_not_configured' } })
		);
		await signUpAndSignIn(page, '/me');
		await expect(card(page)).toHaveAttribute('data-status', 'server-off');
		await expect(card(page).getByText('Reminders are not set up on this server.')).toBeVisible();
		await expect(card(page).getByRole('switch')).toHaveCount(0);
	});
});

test('the key is served, and the worker is left a neutral sentence in the chosen language', async ({
	page
}) => {
	await signUpAndSignIn(page, '/me');
	const key = await page.evaluate(async () => (await fetch('/api/push/key')).json());
	expect(key).toEqual({ publicKey: VAPID_PUBLIC_KEY });
	const text = () =>
		page.evaluate(
			async () => (await (await (await caches.open('prefs')).match('/__reminder-text'))?.text()) ?? null
		);
	await expect.poll(text).toBe('You have a reminder.');
	await page.getByRole('radio', { name: 'Dansk' }).click();
	await expect.poll(text).toBe('Du har en påmindelse.');
	// The worker itself holds no medicine wording.
	const source = await page.evaluate(async () => (await fetch('/service-worker.js')).text());
	expect(source).toContain('notificationclick');
	expect(source.toLowerCase()).not.toMatch(/medic|dose|pill/);
});

test.describe('API', () => {
	test('needs a session, validates, keeps subscriptions private and removes them on request', async ({
		playwright,
		baseURL
	}) => {
		const anon = await playwright.request.newContext({ baseURL });
		expect((await anon.get('/api/push/key')).status()).toBe(401);

		const a = await playwright.request.newContext({ baseURL });
		const b = await playwright.request.newContext({ baseURL });
		const accountA = await signUpApiAccount(a, { prefix: 'rem' });
		await signUpApiAccount(b, { prefix: 'rem' });
		expect((await loginApi(a, accountA)).status()).toBe(200);

		expect(await (await a.get('/api/push/key')).json()).toEqual({ publicKey: VAPID_PUBLIC_KEY });

		const endpoint = endpointOf();
		const good = {
			endpoint,
			keys: { p256dh: 'e2e_synthetic_p256dh', auth: 'e2e_synthetic_auth' },
			schedule: { tz: 'Europe/Copenhagen', slots: [{ time: '08:00', days: [1, 3] }] }
		};
		const put = (ctx: typeof a, data: object) =>
			ctx.put('/api/push/subscription', { headers: JSON_HEADERS, data });

		expect((await put(anon, good)).status()).toBe(401);
		expect((await put(a, { ...good, endpoint: 'https://example.com/steal' })).status()).toBe(400);
		expect((await put(a, { ...good, endpoint: 'http://fcm.googleapis.com/x' })).status()).toBe(400);
		expect((await put(a, { ...good, schedule: { tz: 'Nowhere/Land', slots: [] } })).status()).toBe(400);
		// CSRF conventions: a foreign origin and a non-JSON body are refused.
		expect(
			(
				await a.put('/api/push/subscription', {
					headers: { ...JSON_HEADERS, origin: 'https://evil.example' },
					data: good
				})
			).status()
		).toBe(403);
		expect(
			(
				await a.put('/api/push/subscription', {
					headers: { origin: JSON_HEADERS.origin, 'content-type': 'text/plain' },
					data: 'x'
				})
			).status()
		).toBe(403);

		expect((await put(a, good)).status()).toBe(201);
		expect((await put(a, good)).status()).toBe(200);
		// Another account cannot take over or remove it.
		expect((await put(b, good)).status()).toBe(403);
		const del = (ctx: typeof a) =>
			ctx.delete('/api/push/subscription', { headers: JSON_HEADERS, data: { endpoint } });
		expect((await del(b)).status()).toBe(404);
		expect((await del(a)).status()).toBe(200);
		expect((await del(a)).status()).toBe(404);
	});
});
