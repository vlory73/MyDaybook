import { eq } from 'drizzle-orm';
import { db as openDb, type Db } from '../db';
import { logLine } from '../db/log';
import { pushSubscriptions, users } from '../db/schema';
import { dueKeys } from './schedule';
import { sendPush, type SendOutcome } from './send';
import { parseStoredSchedule } from './subscriptions';
import { vapidConfig, type VapidConfig } from './vapid';

/** A subscription is dropped after this many failed sends in a row. */
export const MAX_CONSECUTIVE_FAILURES = 5;

export interface TickDeps {
	db: Db;
	config: VapidConfig;
	send?: (endpoint: string, config: VapidConfig) => Promise<SendOutcome>;
}

/**
 * One scheduler pass: for every subscription, sends one empty push when a slot of its schedule falls in the last
 * few minutes of its own time zone and has not been sent yet. Returns how many pushes went out.
 * Only active accounts are served. A subscription the push service reports as gone (404/410) is deleted, and so is
 * one that failed MAX_CONSECUTIVE_FAILURES times in a row (a success resets the count).
 */
export async function runTick(now: Date, deps: TickDeps): Promise<number> {
	const send = deps.send ?? ((endpoint, config) => sendPush(endpoint, config));
	const rows = deps.db
		.select({ sub: pushSubscriptions })
		.from(pushSubscriptions)
		.innerJoin(users, eq(users.id, pushSubscriptions.userId))
		.where(eq(users.status, 'active'))
		.all()
		.map((r) => r.sub);
	let sent = 0;
	for (const row of rows) {
		const schedule = parseStoredSchedule(row.schedule);
		if (!schedule || schedule.slots.length === 0) continue;
		let fired: string[];
		try {
			fired = JSON.parse(row.lastFired) as string[];
		} catch {
			fired = [];
		}
		const { due, window } = dueKeys(schedule, now, fired);
		// Keys older than the window can never match again, so they are forgotten.
		const keep = fired.filter((k) => window.includes(k));
		if (due.length === 0) {
			if (keep.length !== fired.length) {
				deps.db
					.update(pushSubscriptions)
					.set({ lastFired: JSON.stringify(keep) })
					.where(eq(pushSubscriptions.id, row.id))
					.run();
			}
			continue;
		}
		// Marked before sending: a crash or slow service then costs one reminder, never a repeat storm.
		deps.db
			.update(pushSubscriptions)
			.set({ lastFired: JSON.stringify([...keep, ...due]) })
			.where(eq(pushSubscriptions.id, row.id))
			.run();
		const outcome = await send(row.endpoint, deps.config);
		if (outcome === 'sent') sent++;
		if (outcome === 'gone' || (outcome === 'failed' && row.failures + 1 >= MAX_CONSECUTIVE_FAILURES)) {
			deps.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id)).run();
		} else if (outcome === 'failed') {
			deps.db
				.update(pushSubscriptions)
				.set({ failures: row.failures + 1 })
				.where(eq(pushSubscriptions.id, row.id))
				.run();
		} else if (row.failures > 0) {
			deps.db.update(pushSubscriptions).set({ failures: 0 }).where(eq(pushSubscriptions.id, row.id)).run();
		}
	}
	return sent;
}

let timer: NodeJS.Timeout | undefined;

/**
 * Starts the one-minute tick. Off when the VAPID keys are missing or PUSH_SCHEDULER=off. Never throws into the process.
 */
export function startPushScheduler(): void {
	if (timer) return;
	if ((process.env.PUSH_SCHEDULER ?? '').toLowerCase() === 'off') {
		logLine({ event: 'push_schedule', enabled: false, reason: 'disabled' });
		return;
	}
	const config = vapidConfig();
	if (!config) {
		logLine({ event: 'push_schedule', enabled: false, reason: 'no_vapid_keys' });
		return;
	}
	logLine({ event: 'push_schedule', enabled: true });
	let running = false;
	timer = setInterval(() => {
		if (running) return;
		running = true;
		runTick(new Date(), { db: openDb(), config })
			.catch(() => logLine({ event: 'push_tick_failed' }))
			.finally(() => {
				running = false;
			});
	}, 60_000);
	timer.unref();
}
