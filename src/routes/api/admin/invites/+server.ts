import { and, desc, gt, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { invites } from '$lib/server/db/schema';
import { api, reply, requireAdmin } from '$lib/server/auth/http';

/** Admin only. Open invites (not used, not expired). The token is never returned: it exists only as a hash. */
export const GET = api((event) => {
	requireAdmin(event);
	const rows = db()
		.select({
			id: invites.id,
			role: invites.role,
			createdAt: invites.createdAt,
			expiresAt: invites.expiresAt
		})
		.from(invites)
		.where(and(isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
		.orderBy(desc(invites.createdAt))
		.all();
	return reply({ invites: rows });
});
