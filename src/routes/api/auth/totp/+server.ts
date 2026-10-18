import { findById } from '$lib/server/auth/accounts';
import { ApiError, api, reply, requireUser } from '$lib/server/auth/http';
import { totpEnabled } from '$lib/server/auth/totp-account';

/** Whether two-step sign-in is on for the signed-in user. */
export const GET = api((event) => {
	const { user } = requireUser(event);
	const row = findById(user.id);
	if (!row) throw new ApiError(401, 'unauthenticated');
	return reply({ enabled: totpEnabled(row) });
});
