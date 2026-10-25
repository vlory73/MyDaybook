import { randomUUID } from 'node:crypto';
import { lt } from 'drizzle-orm';
import { db } from '../db';
import { securityEvents } from '../db/schema';
import { limiters } from './rate-limit';
import { pruneExpiredSessions } from './sessions';

const DAY = 86_400_000;

/** IP_RETENTION_DAYS: default 7; 0 means IP addresses are not stored at all. */
export function ipRetentionDays(): number {
	const raw = process.env.IP_RETENTION_DAYS;
	if (raw === undefined || raw === '') return 7;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n >= 0 ? n : 7;
}

export type SecurityEventType =
	| 'signup'
	| 'login_failed'
	| 'rate_limited'
	| 'recovery_failed'
	| 'recovery_used'
	| 'passphrase_changed'
	| 'invite_failed'
	| 'totp_failed'
	| 'totp_enabled'
	| 'totp_disabled';

export function recordEvent(type: SecurityEventType, userId: string | null, ip: string | null): void {
	db()
		.insert(securityEvents)
		.values({ id: randomUUID(), type, userId, ip: ipRetentionDays() > 0 ? ip : null, at: Date.now() })
		.run();
}

/** Events carry no IP when retention is 0, but are still pruned after a week. */
export function pruneSecurityEvents(now = Date.now()): number {
	const days = ipRetentionDays() || 7;
	return db()
		.delete(securityEvents)
		.where(lt(securityEvents.at, now - days * DAY))
		.run().changes;
}

let timers: NodeJS.Timeout[] = [];

/**
 * Hourly prune of old security events, sessions and spent tokens; idle rate-limit buckets every 5 minutes.
 * The timers never keep the process alive.
 */
export function startHousekeeping(): void {
	if (timers.length) return;
	pruneSecurityEvents();
	timers = [
		setInterval(
			() => {
				pruneSecurityEvents();
				pruneExpiredSessions();
			},
			60 * 60 * 1000
		),
		setInterval(
			() => {
				limiters.user.sweep();
				limiters.ip.sweep();
			},
			5 * 60 * 1000
		)
	];
	for (const t of timers) t.unref();
}
