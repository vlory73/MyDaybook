import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { RequestEvent } from '@sveltejs/kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheticVapidKeys } from './test-keys';
import { dataDir, db, sqliteHandle } from '../db';
import { migrateWithBackup } from '../db/migrate';
import { pushSubscriptions, users } from '../db/schema';

// The routes use the process-wide database, so point it at a temporary folder before it is first opened.
const dir = mkdtempSync(join(tmpdir(), 'mydaybook-push-routes-'));
process.env.DATA_DIR = dir;
const keys = syntheticVapidKeys();

const b = Buffer.from('synthetic');
const row = (id: string) => ({
	id,
	username: id,
	kind: 'adult' as const,
	createdAt: 1,
	kdfSalt: b,
	kdfParams: '{}',
	authVerifier: b,
	recoveryVerifier: b,
	wrappedMkPw: b,
	wrappedMkRk: b,
	publicKey: b,
	wrappedPrivateKey: b
});

const event = (userId: string | null, body?: unknown) =>
	({
		locals: userId
			? { user: { id: userId, role: 'member' }, sessionId: 's' }
			: { user: null, sessionId: null },
		request: new Request('http://localhost/api/push/subscription', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body ?? {})
		}),
		route: { id: '/api/push' }
	}) as unknown as RequestEvent;

const payload = (endpoint = 'https://fcm.googleapis.com/fcm/send/route-device') => ({
	endpoint,
	keys: { p256dh: 'synthetic_p256dh', auth: 'synthetic_auth' },
	schedule: { tz: 'UTC', slots: [{ time: '08:00', days: [1] }] }
});

function setKeys(on: boolean) {
	for (const [name, value] of Object.entries({
		VAPID_PUBLIC_KEY: keys.VAPID_PUBLIC_KEY,
		VAPID_PRIVATE_KEY: keys.VAPID_PRIVATE_KEY,
		VAPID_SUBJECT: 'mailto:owner@example.invalid'
	})) {
		if (on) process.env[name] = value;
		else delete process.env[name];
	}
}

beforeAll(async () => {
	expect(dataDir()).toBe(resolve(dir));
	await migrateWithBackup(sqliteHandle(), dir, resolve('drizzle'));
	db()
		.insert(users)
		.values([row('u1'), row('u2')])
		.run();
});
afterAll(() => {
	setKeys(false);
	sqliteHandle().close();
	rmSync(dir, { recursive: true, force: true });
});

describe('push API routes', () => {
	it('GET key: needs a session, and is off (503) without VAPID keys', async () => {
		const { GET } = await import('../../../routes/api/push/key/+server');
		setKeys(false);
		expect((await GET(event(null))).status).toBe(401);
		const off = await GET(event('u1'));
		expect(off.status).toBe(503);
		expect(await off.json()).toEqual({ error: 'push_not_configured' });
		setKeys(true);
		const on = await GET(event('u1'));
		expect(on.status).toBe(200);
		expect(await on.json()).toEqual({ publicKey: keys.VAPID_PUBLIC_KEY });
	});

	it('PUT: off without keys, 401 signed out, 400 for a bad endpoint or schedule, 201 then 200', async () => {
		const { PUT } = await import('../../../routes/api/push/subscription/+server');
		setKeys(false);
		expect((await PUT(event('u1', payload()))).status).toBe(503);
		setKeys(true);
		expect((await PUT(event(null, payload()))).status).toBe(401);
		const bad = await PUT(event('u1', payload('https://example.com/steal')));
		expect(bad.status).toBe(400);
		expect(await bad.json()).toEqual({ error: 'bad_endpoint' });
		expect(
			(await PUT(event('u1', { ...payload(), schedule: { tz: 'UTC', slots: [{ time: '8am', days: [1] }] } })))
				.status
		).toBe(400);
		expect((await PUT(event('u1', payload()))).status).toBe(201);
		expect((await PUT(event('u1', payload()))).status).toBe(200);
		expect(db().select().from(pushSubscriptions).all()).toHaveLength(1);
	});

	it('PUT and DELETE respect ownership', async () => {
		const { PUT, DELETE } = await import('../../../routes/api/push/subscription/+server');
		setKeys(true);
		expect((await PUT(event('u2', payload()))).status).toBe(403);
		expect((await DELETE(event('u2', { endpoint: payload().endpoint }))).status).toBe(404);
		expect(db().select().from(pushSubscriptions).all()).toHaveLength(1);
		expect((await DELETE(event(null, { endpoint: payload().endpoint }))).status).toBe(401);
		expect((await DELETE(event('u1', { endpoint: payload().endpoint }))).status).toBe(200);
		expect(db().select().from(pushSubscriptions).all()).toHaveLength(0);
	});

	it('DELETE still works when the feature is off on the server', async () => {
		const { PUT, DELETE } = await import('../../../routes/api/push/subscription/+server');
		setKeys(true);
		await PUT(event('u1', payload()));
		setKeys(false);
		expect((await DELETE(event('u1', { endpoint: payload().endpoint }))).status).toBe(200);
	});
});
