import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { recoveryTokens } from '$lib/server/db/schema';
import { findByUsername } from '$lib/server/auth/accounts';
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
import { dummyVerify, newToken, sha256, verifySecret } from '$lib/server/auth/tokens';
import { KEY_LEN, b64Bytes, looseUsername } from '$lib/server/auth/validate';

// Long enough to save and confirm the new recovery key on a phone.
const RECOVERY_TOKEN_MS = 15 * 60_000;

/** Proves possession of the recovery key (via RAK) and hands out the recovery-wrapped MK plus a single-use token. */
export const POST = api(async (event) => {
	const body = await readJson(event);
	const username = looseUsername(body.username);
	const recoveryAuthKey = b64Bytes(body.recoveryAuthKey, KEY_LEN);
	if (!username || !recoveryAuthKey) throw new ApiError(400, 'bad_request');
	rateGuard(event, 'recover', username);

	const user = findByUsername(username);
	const ok = user
		? verifySecret(recoveryAuthKey, user.recoveryVerifier) && user.status === 'active'
		: dummyVerify(recoveryAuthKey);
	if (!user || !ok) {
		noteFailure('recover', event, username);
		recordEvent('recovery_failed', user?.id ?? null, clientIp(event));
		throw new ApiError(401, 'invalid_credentials');
	}
	noteSuccess('recover', event, username);

	const token = newToken();
	db().transaction((tx) => {
		tx.delete(recoveryTokens).where(eq(recoveryTokens.userId, user.id)).run();
		tx.insert(recoveryTokens)
			.values({
				id: randomUUID(),
				tokenHash: sha256(token),
				userId: user.id,
				expiresAt: Date.now() + RECOVERY_TOKEN_MS
			})
			.run();
	});
	return reply({
		recoveryToken: token,
		userId: user.id,
		wrappedMkByRecovery: user.wrappedMkRk.toString('base64url'),
		wrappedPrivateKey: user.wrappedPrivateKey.toString('base64url'),
		publicKey: user.publicKey.toString('base64url')
	});
});
