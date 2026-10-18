import { eq } from 'drizzle-orm';
import { writeTx } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { recordEvent } from '$lib/server/auth/events';
import { ApiError, api, clientIp, noteFailure, readJson, reply, requireUser } from '$lib/server/auth/http';
import { reauthenticate } from '$lib/server/auth/reauth';
import { parseCode } from '$lib/server/auth/totp';
import { consumeActiveCode, totpEnabled } from '$lib/server/auth/totp-account';
import { KEY_LEN, b64Bytes } from '$lib/server/auth/validate';

/** Switches two-step sign-in off. Needs the passphrase (auth key) and a current code. */
export const POST = api(async (event) => {
	const { user } = requireUser(event);
	const body = await readJson(event);
	const authKey = b64Bytes(body.authKey, KEY_LEN);
	const code = parseCode(body.code);
	if (!authKey || !code) throw new ApiError(400, 'bad_request');
	const row = reauthenticate(event, user, authKey);
	if (!totpEnabled(row)) throw new ApiError(409, 'totp_not_enabled');
	if (!consumeActiveCode(row, code)) {
		noteFailure('sensitive', event, user.username ?? user.id);
		recordEvent('totp_failed', user.id, clientIp(event));
		throw new ApiError(401, 'invalid_totp');
	}
	writeTx((tx) => {
		tx.update(users)
			.set({ totpSecretEnc: null, totpPendingEnc: null, totpLastStep: null })
			.where(eq(users.id, user.id))
			.run();
	});
	recordEvent('totp_disabled', user.id, clientIp(event));
	return reply({ enabled: false });
});
