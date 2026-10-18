import { findByUsername } from '$lib/server/auth/accounts';
import { ApiError, api, rateGuard, readJson, reply } from '$lib/server/auth/http';
import { DEFAULT_KDF_PARAMS, fakeSalt } from '$lib/server/auth/secret';
import { looseUsername } from '$lib/server/auth/validate';

/** Salt and KDF parameters for a user name. Unknown names get a deterministic fake salt (no account enumeration). */
export const POST = api(async (event) => {
	const username = looseUsername((await readJson(event)).username);
	if (!username) throw new ApiError(400, 'bad_request');
	rateGuard(event, 'prelogin', username);
	const user = findByUsername(username);
	if (user) {
		return reply({ kdfSalt: user.kdfSalt.toString('base64url'), kdfParams: JSON.parse(user.kdfParams) });
	}
	return reply({ kdfSalt: fakeSalt(username).toString('base64url'), kdfParams: DEFAULT_KDF_PARAMS });
});
