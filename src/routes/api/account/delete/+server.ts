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
	reauthenticate(event, user, authKey);
	eraseUser(user.id);
	destroySession(event.cookies);
	return reply({ ok: true });
});
