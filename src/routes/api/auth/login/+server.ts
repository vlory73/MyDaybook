import { bundleOf, findByUsername, identityOf } from '$lib/server/auth/accounts';
import { recordEvent } from '$lib/server/auth/events';
import {
	ApiError,
	api,
	clientIp,
	noteFailure,
	noteSuccess,
	rateGuard,
	readJson,
	reply
} from '$lib/server/auth/http';
import { createSession } from '$lib/server/auth/sessions';
import { dummyVerify, verifySecret } from '$lib/server/auth/tokens';
import { KEY_LEN, b64Bytes, looseUsername } from '$lib/server/auth/validate';

/** Unknown user, wrong key and disabled account all answer with the same 401. */
export const POST = api(async (event) => {
	const body = await readJson(event);
	const username = looseUsername(body.username);
	const authKey = b64Bytes(body.authKey, KEY_LEN);
	if (!username || !authKey) throw new ApiError(400, 'bad_request');
	rateGuard(event, 'login', username);

	const user = findByUsername(username);
	const ok = user
		? verifySecret(authKey, user.authVerifier) && user.status === 'active'
		: dummyVerify(authKey);
	if (!user || !ok) {
		noteFailure('login', event, username);
		recordEvent('login_failed', user?.id ?? null, clientIp(event));
		throw new ApiError(401, 'invalid_credentials');
	}
	noteSuccess('login', event, username);
	createSession(event.cookies, user.id);
	return reply({ ...identityOf(user), bundle: bundleOf(user) });
});
