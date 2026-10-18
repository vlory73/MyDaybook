import { ApiError, api, reply, requireUser } from '$lib/server/auth/http';
import { decodeCursor, listRecords, parseLimit } from '$lib/server/records';

/** Changed records and tombstones of the signed-in user since `since`, oldest first. Ciphertext only. */
export const GET = api((event) => {
	const { user } = requireUser(event);
	const rawSince = event.url.searchParams.get('since');
	const since = rawSince === null || rawSince === '' ? null : decodeCursor(rawSince);
	if (rawSince && !since) throw new ApiError(400, 'bad_request');
	const limit = parseLimit(event.url.searchParams.get('limit'));
	if (limit === null) throw new ApiError(400, 'bad_request');
	return reply(listRecords(user.id, since, limit));
});
