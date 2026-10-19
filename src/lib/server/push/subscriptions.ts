import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from '../db';
import { pushSubscriptions } from '../db/schema';
import { parseEndpoint } from './endpoint';
import { parseSchedule, type PushSchedule } from './schedule';

/** A person has a few devices; this only stops one account from filling the table. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

const B64URL = /^[A-Za-z0-9_-]{1,256}$/;

export type UpsertResult =
	{ ok: true; created: boolean } | { ok: false; status: 400 | 403 | 409; code: string };

/**
 * Creates or updates the subscription for `endpoint`, owned by `userId`. An endpoint that belongs to someone else is
 * refused (403) instead of taken over. Validation: allowed push host, schedule shape, key strings.
 */
export function upsertSubscription(
	db: Db | Tx,
	userId: string,
	body: Record<string, unknown>,
	now = Date.now()
): UpsertResult {
	const url = parseEndpoint(body.endpoint);
	if (!url) return { ok: false, status: 400, code: 'bad_endpoint' };
	const schedule = parseSchedule(body.schedule);
	if (!schedule) return { ok: false, status: 400, code: 'bad_schedule' };
	const keys = body.keys;
	if (typeof keys !== 'object' || keys === null) return { ok: false, status: 400, code: 'bad_keys' };
	const { p256dh, auth } = keys as Record<string, unknown>;
	if (typeof p256dh !== 'string' || typeof auth !== 'string' || !B64URL.test(p256dh) || !B64URL.test(auth)) {
		return { ok: false, status: 400, code: 'bad_keys' };
	}
	const endpoint = url.href;
	const existing = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
	const json = JSON.stringify(schedule);
	if (existing) {
		if (existing.userId !== userId) return { ok: false, status: 403, code: 'forbidden' };
		db.update(pushSubscriptions)
			.set({
				keys: JSON.stringify({ p256dh, auth }),
				schedule: json,
				updatedAt: now
			})
			.where(eq(pushSubscriptions.id, existing.id))
			.run();
		return { ok: true, created: false };
	}
	const count = db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId))
		.all().length;
	if (count >= MAX_SUBSCRIPTIONS_PER_USER) return { ok: false, status: 409, code: 'too_many_subscriptions' };
	db.insert(pushSubscriptions)
		.values({
			id: randomUUID(),
			userId,
			endpoint,
			keys: JSON.stringify({ p256dh, auth }),
			schedule: json,
			lastFired: '[]',
			createdAt: now,
			updatedAt: now
		})
		.run();
	return { ok: true, created: true };
}

/** Deletes the caller's own subscription. Someone else's endpoint is treated as not found (no existence leak). */
export function deleteSubscription(db: Db | Tx, userId: string, endpoint: unknown): boolean {
	const url = parseEndpoint(endpoint);
	if (!url) return false;
	const res = db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.endpoint, url.href), eq(pushSubscriptions.userId, userId)))
		.run();
	return res.changes > 0;
}

export function parseStoredSchedule(json: string): PushSchedule | null {
	try {
		return parseSchedule(JSON.parse(json));
	} catch {
		return null;
	}
}
