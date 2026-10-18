import { eq } from 'drizzle-orm';
import { writeTx } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { audit } from '$lib/server/auth/admin';
import { ApiError, api, reply, requireAdmin } from '$lib/server/auth/http';
import { parseUuidV4 } from '$lib/server/auth/validate';

/** Admin only. Lets a disabled account sign in again (it has to sign in; its old sessions were ended). */
export const POST = api((event) => {
	const { user: admin } = requireAdmin(event);
	const id = parseUuidV4(event.params.id);
	if (!id) throw new ApiError(404, 'not_found');
	writeTx((tx) => {
		const target = tx.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
		if (!target) throw new ApiError(404, 'not_found');
		tx.update(users).set({ status: 'active' }).where(eq(users.id, id)).run();
		audit(tx, admin.id, 'enable', id);
	});
	return reply({ ok: true });
});
