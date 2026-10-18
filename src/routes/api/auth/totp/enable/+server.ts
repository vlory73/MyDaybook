import { eq } from 'drizzle-orm';
import { writeTx } from '$lib/server/db';
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
import { base32Decode, decryptSecret, parseCode, verifyTotp } from '$lib/server/auth/totp';

/** Confirms enrolment: a valid code for the pending secret makes it the active one. */
export const POST = api(async (event) => {
	const { user } = requireUser(event);
	const code = parseCode((await readJson(event)).code);
	if (!code) throw new ApiError(400, 'bad_request');
	const key = user.username ?? user.id;
	rateGuard(event, 'sensitive', key);

	const row = findById(user.id);
	if (!row) throw new ApiError(401, 'unauthenticated');
	if (row.totpSecretEnc) throw new ApiError(409, 'totp_already_enabled');
	if (!row.totpPendingEnc) throw new ApiError(409, 'totp_not_started');
	const secret = decryptSecret(row.totpPendingEnc);
	const step = secret ? verifyTotp(base32Decode(secret), code, Date.now(), null) : null;
	if (step === null) {
		noteFailure('sensitive', event, key);
		recordEvent('totp_failed', user.id, clientIp(event));
		throw new ApiError(401, 'invalid_totp');
	}
	noteSuccess('sensitive', event, key);
	writeTx((tx) => {
		tx.update(users)
			.set({ totpSecretEnc: row.totpPendingEnc, totpPendingEnc: null, totpLastStep: step })
			.where(eq(users.id, user.id))
			.run();
	});
	recordEvent('totp_enabled', user.id, clientIp(event));
	return reply({ enabled: true });
});
