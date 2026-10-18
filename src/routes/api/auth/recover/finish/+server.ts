import { and, eq, gt } from 'drizzle-orm';
import { db, writeTx } from '$lib/server/db';
import { recoveryTokens, users } from '$lib/server/db/schema';
import { recordEvent } from '$lib/server/auth/events';
import { ApiError, api, clientIp, rateGuard, readJson, reply } from '$lib/server/auth/http';
import { createSession, revokeAllSessions } from '$lib/server/auth/sessions';
import { sha256 } from '$lib/server/auth/tokens';
import {
	KEY_LEN,
	SALT_LEN,
	WRAPPED_LEN,
	b64Bytes,
	parseKdfParams,
	parseToken
} from '$lib/server/auth/validate';

/** Sets a new passphrase and a new recovery key, revokes every session and signs the user in. */
export const POST = api(async (event) => {
	const body = await readJson(event);
	const token = parseToken(body.recoveryToken);
	const kdfSalt = b64Bytes(body.kdfSalt, SALT_LEN);
	const kdfParams = parseKdfParams(body.kdfParams);
	const authKey = b64Bytes(body.authKey, KEY_LEN);
	const wrappedMkPw = b64Bytes(body.wrappedMkByPassphrase, WRAPPED_LEN);
	const recoveryAuthKey = b64Bytes(body.recoveryAuthKey, KEY_LEN);
	const wrappedMkRk = b64Bytes(body.wrappedMkByRecovery, WRAPPED_LEN);
	if (!token || !kdfSalt || !kdfParams || !authKey || !wrappedMkPw || !recoveryAuthKey || !wrappedMkRk) {
		throw new ApiError(400, 'bad_request');
	}
	rateGuard(event, 'recover');

	const now = Date.now();
	const userId = writeTx((tx) => {
		const row = tx
			.select({ id: recoveryTokens.id, userId: recoveryTokens.userId })
			.from(recoveryTokens)
			.where(and(eq(recoveryTokens.tokenHash, sha256(token)), gt(recoveryTokens.expiresAt, now)))
			.get();
		if (!row) return null;
		// Single use: the delete must remove exactly the row we read.
		if (tx.delete(recoveryTokens).where(eq(recoveryTokens.id, row.id)).run().changes !== 1) return null;
		tx.update(users)
			.set({
				kdfSalt,
				kdfParams: JSON.stringify(kdfParams),
				authVerifier: sha256(authKey),
				wrappedMkPw,
				recoveryVerifier: sha256(recoveryAuthKey),
				wrappedMkRk
			})
			.where(eq(users.id, row.userId))
			.run();
		return row.userId;
	});
	if (!userId) {
		recordEvent('recovery_failed', null, clientIp(event));
		throw new ApiError(401, 'invalid_credentials');
	}
	revokeAllSessions(userId);
	createSession(event.cookies, userId, now);
	recordEvent('recovery_used', userId, clientIp(event));
	const user = db().select().from(users).where(eq(users.id, userId)).get()!;
	return reply({ userId, username: user.username, role: user.role });
});
