import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { activeAdminCount, checkDelete } from '$lib/server/auth/admin';
import { eraseUser } from '$lib/server/auth/erase';
import { ApiError, api, readJson, reply, requireAdmin } from '$lib/server/auth/http';
import { reauthenticate } from '$lib/server/auth/reauth';
import { KEY_LEN, b64Bytes, parseUuidV4 } from '$lib/server/auth/validate';

/**
 * Admin only, irreversible. The ADMIN re-authenticates with their own auth key. Same erasure as account deletion
 * (D12 last-guardian check, security events removed, blobs removed); the admin_audit row stays.
 */
export const POST = api(async (event) => {
	const { user: admin } = requireAdmin(event);
	const id = parseUuidV4(event.params.id);
	const authKey = b64Bytes((await readJson(event)).authKey, KEY_LEN);
	if (!id || !authKey) throw new ApiError(400, 'bad_request');
	reauthenticate(event, admin, authKey);

	const target = db()
		.select({ id: users.id, role: users.role, status: users.status })
		.from(users)
		.where(eq(users.id, id))
		.get();
	if (!target) throw new ApiError(404, 'not_found');
	const refused = checkDelete(admin.id, target, activeAdminCount(db()));
	if (refused) throw new ApiError(409, refused);
	eraseUser(id, { adminId: admin.id });
	return reply({ ok: true });
});
