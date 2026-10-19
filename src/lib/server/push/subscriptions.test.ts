import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, wrap, type Db } from '../db';
import { migrateWithBackup } from '../db/migrate';
import { pushSubscriptions, users } from '../db/schema';
import { syntheticVapidKeys } from './test-keys';
import { runTick } from './scheduler';
import { MAX_SUBSCRIPTIONS_PER_USER, deleteSubscription, upsertSubscription } from './subscriptions';
import { vapidConfig } from './vapid';

let dir: string;
let sqlite: Database.Database;
let db: Db;

const b = Buffer.from('synthetic');
const user = (id: string) => ({
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
const body = (over: Record<string, unknown> = {}) => ({
	endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
	keys: { p256dh: 'BPk-synthetic_p256dh', auth: 'synthetic_auth' },
	schedule: { tz: 'Europe/Copenhagen', slots: [{ time: '08:00', days: [1, 2, 3] }] },
	...over
});

beforeEach(async () => {
	dir = mkdtempSync(join(tmpdir(), 'mydaybook-push-'));
	sqlite = openDatabase(dir);
	await migrateWithBackup(sqlite, dir, resolve('drizzle'));
	db = wrap(sqlite);
	db.insert(users)
		.values([user('u1'), user('u2')])
		.run();
});
afterEach(() => {
	sqlite.close();
	rmSync(dir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe('upsertSubscription', () => {
	it('creates a subscription owned by the caller, then updates it by endpoint', () => {
		expect(upsertSubscription(db, 'u1', body(), 1000)).toEqual({ ok: true, created: true });
		const schedule = { tz: 'UTC', slots: [{ time: '21:30', days: [0] }] };
		expect(upsertSubscription(db, 'u1', body({ schedule }), 2000)).toEqual({ ok: true, created: false });
		const rows = db.select().from(pushSubscriptions).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ userId: 'u1', createdAt: 1000, updatedAt: 2000 });
		expect(JSON.parse(rows[0]!.schedule)).toEqual(schedule);
	});

	it('refuses an endpoint that belongs to another user, and leaves it alone', () => {
		upsertSubscription(db, 'u1', body());
		expect(upsertSubscription(db, 'u2', body({ schedule: { tz: 'UTC', slots: [] } }))).toEqual({
			ok: false,
			status: 403,
			code: 'forbidden'
		});
		const row = db.select().from(pushSubscriptions).get()!;
		expect(row.userId).toBe('u1');
		expect(JSON.parse(row.schedule).slots).toHaveLength(1);
	});

	it('validates endpoint, schedule and keys', () => {
		const code = (over: Record<string, unknown>) => {
			const r = upsertSubscription(db, 'u1', body(over));
			return r.ok ? 'ok' : `${r.status} ${r.code}`;
		};
		expect(code({ endpoint: 'https://example.com/x' })).toBe('400 bad_endpoint');
		expect(code({ endpoint: 'http://fcm.googleapis.com/x' })).toBe('400 bad_endpoint');
		expect(code({ schedule: { tz: 'Nope/Nope', slots: [] } })).toBe('400 bad_schedule');
		expect(code({ schedule: undefined })).toBe('400 bad_schedule');
		expect(code({ keys: undefined })).toBe('400 bad_keys');
		expect(code({ keys: { p256dh: 'a b', auth: 'x' } })).toBe('400 bad_keys');
		expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
	});

	it('limits the number of devices per user', () => {
		for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_USER; i++) {
			expect(
				upsertSubscription(db, 'u1', body({ endpoint: `https://fcm.googleapis.com/fcm/send/d${i}` })).ok
			).toBe(true);
		}
		expect(
			upsertSubscription(db, 'u1', body({ endpoint: 'https://fcm.googleapis.com/fcm/send/extra' }))
		).toMatchObject({
			ok: false,
			status: 409
		});
		// Updating an existing one still works.
		expect(
			upsertSubscription(db, 'u1', body({ endpoint: 'https://fcm.googleapis.com/fcm/send/d0' })).ok
		).toBe(true);
	});

	it('stores nothing but endpoint, keys, time zone and times', () => {
		upsertSubscription(
			db,
			'u1',
			body({
				medication: 'Synthol',
				schedule: { tz: 'UTC', slots: [{ time: '08:00', days: [1], name: 'Synthol' }] }
			})
		);
		const row = db.select().from(pushSubscriptions).get()!;
		expect(JSON.stringify(row)).not.toContain('Synthol');
	});
});

describe('deleteSubscription', () => {
	it('deletes only the caller’s own subscription', () => {
		upsertSubscription(db, 'u1', body());
		expect(deleteSubscription(db, 'u2', body().endpoint)).toBe(false);
		expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
		expect(deleteSubscription(db, 'u1', body().endpoint)).toBe(true);
		expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
		expect(deleteSubscription(db, 'u1', body().endpoint)).toBe(false);
		expect(deleteSubscription(db, 'u1', 'https://example.com/x')).toBe(false);
	});

	it('goes away with the account (cascade)', () => {
		upsertSubscription(db, 'u1', body());
		db.delete(users).where(eq(users.id, 'u1')).run();
		expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
	});
});

describe('runTick', () => {
	const keys = syntheticVapidKeys();
	const config = vapidConfig({ ...keys, VAPID_SUBJECT: 'mailto:owner@example.invalid' })!;
	const at = (iso: string) => new Date(iso);

	it('sends once per slot per day, deduplicated across ticks', async () => {
		upsertSubscription(db, 'u1', body());
		const send = vi.fn(async () => 'sent' as const);
		// Tuesday 2026-10-20 08:00 in Copenhagen is 06:00Z.
		expect(await runTick(at('2026-10-20T06:00:05Z'), { db, config, send })).toBe(1);
		expect(await runTick(at('2026-10-20T06:01:05Z'), { db, config, send })).toBe(0);
		expect(await runTick(at('2026-10-20T06:04:05Z'), { db, config, send })).toBe(0);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/device-1', config);
		// Next scheduled day (Wednesday).
		expect(await runTick(at('2026-10-21T06:00:05Z'), { db, config, send })).toBe(1);
	});

	it('catches up after missed ticks, but not after the window and not on other weekdays', async () => {
		upsertSubscription(db, 'u1', body());
		const send = vi.fn(async () => 'sent' as const);
		expect(await runTick(at('2026-10-20T06:07:00Z'), { db, config, send })).toBe(0); // too late
		expect(await runTick(at('2026-10-24T06:00:00Z'), { db, config, send })).toBe(0); // Saturday
		expect(await runTick(at('2026-10-20T06:04:30Z'), { db, config, send })).toBe(1); // within 5 minutes
	});

	it('sends one push even when two slots are due together', async () => {
		upsertSubscription(
			db,
			'u1',
			body({
				schedule: {
					tz: 'UTC',
					slots: [
						{ time: '08:00', days: [2] },
						{ time: '08:02', days: [2] }
					]
				}
			})
		);
		const send = vi.fn(async () => 'sent' as const);
		expect(await runTick(at('2026-10-20T08:03:00Z'), { db, config, send })).toBe(1);
		expect(send).toHaveBeenCalledTimes(1);
		expect(await runTick(at('2026-10-20T08:04:00Z'), { db, config, send })).toBe(0);
	});

	it('deletes a subscription the push service reports gone, and keeps one that merely failed', async () => {
		upsertSubscription(db, 'u1', body());
		upsertSubscription(db, 'u2', body({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-2' }));
		const send = vi.fn(async (endpoint: string) =>
			endpoint.endsWith('device-1') ? ('gone' as const) : ('failed' as const)
		);
		await runTick(at('2026-10-20T06:00:05Z'), { db, config, send });
		const left = db.select().from(pushSubscriptions).all();
		expect(left.map((r) => r.userId)).toEqual(['u2']);
	});

	it('forgets old keys and ignores empty schedules', async () => {
		upsertSubscription(db, 'u1', body());
		upsertSubscription(
			db,
			'u2',
			body({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-2', schedule: { tz: 'UTC', slots: [] } })
		);
		const send = vi.fn(async () => 'sent' as const);
		await runTick(at('2026-10-20T06:00:05Z'), { db, config, send });
		await runTick(at('2026-10-20T09:00:00Z'), { db, config, send });
		const row = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, 'u1')).get()!;
		expect(JSON.parse(row.lastFired)).toEqual([]);
		expect(send).toHaveBeenCalledTimes(1);
	});
});
