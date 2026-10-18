import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { invites } from '$lib/server/db/schema';
import { recordEvent } from '$lib/server/auth/events';
import { ApiError, api, clientIp, rateGuard, readJson, reply } from '$lib/server/auth/http';
import { sha256 } from '$lib/server/auth/tokens';
import { parseToken } from '$lib/server/auth/validate';

/** Is this invite token valid? Expired, used and unknown tokens are indistinguishable. */
export const POST = api(async (event) => {
	const token = parseToken((await readJson(event)).token);
	rateGuard(event, 'invite');
	const row = token
		? db()
				.select({ role: invites.role })
				.from(invites)
				.where(
					and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, Date.now()))
				)
				.get()
		: undefined;
	if (!row) {
		recordEvent('invite_failed', null, clientIp(event));
		throw new ApiError(404, 'invalid_invite');
	}
	return reply({ ok: true, role: row.role });
});
