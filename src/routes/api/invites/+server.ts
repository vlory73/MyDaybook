import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { adminAudit, invites } from '$lib/server/db/schema';
import { ApiError, api, readJson, reply, requireAdmin } from '$lib/server/auth/http';
import { newToken, sha256 } from '$lib/server/auth/tokens';

/** Admin only. The token is returned once; only its hash is stored. */
export const POST = api(async (event) => {
	const { user } = requireAdmin(event);
	const body = await readJson(event);
	const role = body.role ?? 'member';
	const hours = body.hours ?? 72;
	if (role !== 'member' && role !== 'admin') throw new ApiError(400, 'bad_request');
	if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 24 * 30) {
		throw new ApiError(400, 'bad_request');
	}
	const token = newToken();
	const now = Date.now();
	const expiresAt = now + hours * 3_600_000;
	const id = randomUUID();
	db().transaction((tx) => {
		tx.insert(invites)
			.values({ id, tokenHash: sha256(token), createdBy: user.id, role, createdAt: now, expiresAt })
			.run();
		tx.insert(adminAudit)
			.values({ id: randomUUID(), adminId: user.id, action: 'invite', targetId: id, at: now })
			.run();
	});
	return reply({ token, expiresAt });
});
