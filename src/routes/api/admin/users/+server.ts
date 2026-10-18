import { eq, max } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import { dayOf } from '$lib/server/auth/admin';
import { api, reply, requireAdmin } from '$lib/server/auth/http';

/**
 * Admin only. Who has an account and how much space it uses, nothing about what is in it: no content, no key
 * material, no IP addresses, and "last active" is the day of the newest session activity (UTC), never the time.
 */
export const GET = api((event) => {
	requireAdmin(event);
	const rows = db()
		.select({
			id: users.id,
			username: users.username,
			role: users.role,
			kind: users.kind,
			status: users.status,
			createdAt: users.createdAt,
			storageBytes: users.storageBytes,
			totp: users.totpSecretEnc,
			lastSeen: max(sessions.lastSeenAt)
		})
		.from(users)
		.leftJoin(sessions, eq(sessions.userId, users.id))
		.groupBy(users.id)
		.orderBy(users.createdAt)
		.all();
	return reply({
		users: rows.map((r) => ({
			id: r.id,
			username: r.username,
			role: r.role,
			kind: r.kind,
			status: r.status,
			createdAt: r.createdAt,
			storageBytes: r.storageBytes,
			lastActiveDay: r.lastSeen === null ? null : dayOf(r.lastSeen),
			totpEnabled: r.totp !== null
		}))
	});
});
