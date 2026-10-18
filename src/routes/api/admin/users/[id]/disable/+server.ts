import { eq } from 'drizzle-orm';
import { writeTx } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import { activeAdminCount, audit, checkDisable } from '$lib/server/auth/admin';
import { ApiError, api, reply, requireAdmin } from '$lib/server/auth/http';
import { parseUuidV4 } from '$lib/server/auth/validate';

/** Admin only. Disables the account and ends all its sessions. Reversible with `/enable`. */
export const POST = api((event) => {
	const { user: admin } = requireAdmin(event);
	const id = parseUuidV4(event.params.id);
	if (!id) throw new ApiError(404, 'not_found');
	writeTx((tx) => {
		const target = tx
			.select({ id: users.id, role: users.role, status: users.status })
			.from(users)
			.where(eq(users.id, id))
			.get();
		if (!target) throw new ApiError(404, 'not_found');
		const refused = checkDisable(admin.id, target, activeAdminCount(tx));
		if (refused) throw new ApiError(409, refused);
		tx.update(users).set({ status: 'disabled' }).where(eq(users.id, id)).run();
		tx.delete(sessions).where(eq(sessions.userId, id)).run();
		audit(tx, admin.id, 'disable', id);
	});
	return reply({ ok: true });
});
