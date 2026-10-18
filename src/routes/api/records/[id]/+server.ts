import { ApiError, api, readJson, reply, requireUser } from '$lib/server/auth/http';
import { parseUuidV4 } from '$lib/server/auth/validate';
import {
	deleteRecord,
	parseBaseRev,
	parseCiphertext,
	parseWrappedKey,
	putRecord,
	type PutResult
} from '$lib/server/records';

function answer(result: PutResult): Response {
	if (result.ok) return reply({ id: result.id, rev: result.rev, updatedAt: result.updatedAt });
	if (result.reason === 'conflict') return reply({ error: 'conflict', rev: result.rev }, 409);
	throw new ApiError(404, 'not_found');
}

/** Creates or replaces a record. A foreign id is answered like a missing one (404). */
export const PUT = api(async (event) => {
	const { user } = requireUser(event);
	const id = parseUuidV4(event.params.id);
	if (!id) throw new ApiError(400, 'bad_request');
	const body = await readJson(event);
	const wrappedKey = parseWrappedKey(body.wrappedKey);
	const ciphertext = parseCiphertext(body.ciphertext);
	const baseRev = parseBaseRev(body.baseRev);
	if (!wrappedKey || !ciphertext || baseRev === null) throw new ApiError(400, 'bad_request');
	return answer(putRecord(user.id, id, wrappedKey, ciphertext, baseRev));
});

/** Turns the record into a tombstone (content removed, so other devices learn about the deletion). */
export const DELETE = api((event) => {
	const { user } = requireUser(event);
	const id = parseUuidV4(event.params.id);
	if (!id) throw new ApiError(400, 'bad_request');
	return answer(deleteRecord(user.id, id));
});
