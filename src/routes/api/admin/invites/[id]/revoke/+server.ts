import { and, eq, isNull } from 'drizzle-orm';
import { writeTx } from '$lib/server/db';
import { invites } from '$lib/server/db/schema';
import { audit } from '$lib/server/auth/admin';
import { ApiError, api, reply, requireAdmin } from '$lib/server/auth/http';
import { parseUuidV4 } from '$lib/server/auth/validate';

/** Admin only. Deletes an unused invite, so its link stops working at once. */
export const POST = api((event) => {
	const { user: admin } = requireAdmin(event);
	const id = parseUuidV4(event.params.id);
	if (!id) throw new ApiError(404, 'not_found');
	writeTx((tx) => {
		const gone = tx
			.delete(invites)
			.where(and(eq(invites.id, id), isNull(invites.usedAt)))
			.run().changes;
		if (gone !== 1) throw new ApiError(404, 'not_found');
		audit(tx, admin.id, 'revoke_invite', id);
	});
	return reply({ ok: true });
});
