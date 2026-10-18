import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { findById } from '$lib/server/auth/accounts';
import { recordEvent } from '$lib/server/auth/events';
import {
	ApiError,
	api,
	clientIp,
	noteFailure,
	noteSuccess,
	rateGuard,
	readJson,
	reply,
	requireUser
} from '$lib/server/auth/http';
import { revokeAllSessions } from '$lib/server/auth/sessions';
import { sha256, verifySecret } from '$lib/server/auth/tokens';
import { KEY_LEN, SALT_LEN, WRAPPED_LEN, b64Bytes, parseKdfParams } from '$lib/server/auth/validate';

/** Change passphrase: re-wrapped MK, new salt and verifier. Other sessions are revoked. */
export const POST = api(async (event) => {
	const { user, sessionId } = requireUser(event);
	const body = await readJson(event);
	const currentAuthKey = b64Bytes(body.currentAuthKey, KEY_LEN);
	const kdfSalt = b64Bytes(body.kdfSalt, SALT_LEN);
	const kdfParams = parseKdfParams(body.kdfParams);
	const authKey = b64Bytes(body.authKey, KEY_LEN);
	const wrappedMkPw = b64Bytes(body.wrappedMkByPassphrase, WRAPPED_LEN);
	if (!currentAuthKey || !kdfSalt || !kdfParams || !authKey || !wrappedMkPw) {
		throw new ApiError(400, 'bad_request');
	}
	const key = user.username ?? user.id;
	rateGuard(event, 'sensitive', key);

	const row = findById(user.id);
	if (!row || !verifySecret(currentAuthKey, row.authVerifier)) {
		noteFailure('sensitive', event, key);
		recordEvent('login_failed', user.id, clientIp(event));
		throw new ApiError(401, 'invalid_credentials');
	}
	noteSuccess('sensitive', event, key);
	db()
		.update(users)
		.set({
			kdfSalt,
			kdfParams: JSON.stringify(kdfParams),
			authVerifier: sha256(authKey),
			wrappedMkPw
		})
		.where(eq(users.id, user.id))
		.run();
	revokeAllSessions(user.id, sessionId);
	recordEvent('passphrase_changed', user.id, clientIp(event));
	return reply({ ok: true });
});
