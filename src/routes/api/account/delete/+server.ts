import { db } from '$lib/server/db';
import { activeAdminCount, checkSelfDelete } from '$lib/server/auth/admin';
import { eraseUser } from '$lib/server/auth/erase';
import { ApiError, api, readJson, reply, requireUser } from '$lib/server/auth/http';
import { reauthenticate } from '$lib/server/auth/reauth';
import { destroySession } from '$lib/server/auth/sessions';
import { KEY_LEN, b64Bytes } from '$lib/server/auth/validate';

/** Art. 17 erasure of your own account (see `eraseUser`). Needs the auth key. */
export const POST = api(async (event) => {
	const { user } = requireUser(event);
	const authKey = b64Bytes((await readJson(event)).authKey, KEY_LEN);
	if (!authKey) throw new ApiError(400, 'bad_request');
	const row = reauthenticate(event, user, authKey);
	const refused = checkSelfDelete({ id: row.id, role: row.role, status: row.status }, activeAdminCount(db()));
	if (refused) throw new ApiError(409, refused);
	eraseUser(user.id);
	destroySession(event.cookies);
	return reply({ ok: true });
});
