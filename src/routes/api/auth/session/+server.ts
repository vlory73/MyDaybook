import { bundleOf, findById, identityOf } from '$lib/server/auth/accounts';
import { ApiError, api, reply, requireUser } from '$lib/server/auth/http';

/** Current session, plus the wrapped key bundle so the client can unlock after a reload. */
export const GET = api((event) => {
	const { user } = requireUser(event);
	const row = findById(user.id);
	if (!row) throw new ApiError(401, 'unauthenticated');
	return reply({ ...identityOf(row), bundle: bundleOf(row) });
});
