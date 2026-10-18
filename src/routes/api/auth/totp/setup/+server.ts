import { eq } from 'drizzle-orm';
import { writeTx } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { ApiError, api, readJson, reply, requireUser } from '$lib/server/auth/http';
import { reauthenticate } from '$lib/server/auth/reauth';
import { encryptSecret, generateSecret, otpauthUri } from '$lib/server/auth/totp';
import { totpEnabled } from '$lib/server/auth/totp-account';
import { KEY_LEN, b64Bytes } from '$lib/server/auth/validate';

/**
 * Starts enrolment: needs the current auth key. Stores a fresh secret as PENDING (encrypted) and returns it once;
 * nothing changes at sign-in until `/enable` has confirmed a code. Calling it again replaces the pending secret.
 */
export const POST = api(async (event) => {
	const { user } = requireUser(event);
	const authKey = b64Bytes((await readJson(event)).authKey, KEY_LEN);
	if (!authKey) throw new ApiError(400, 'bad_request');
	const row = reauthenticate(event, user, authKey);
	if (totpEnabled(row)) throw new ApiError(409, 'totp_already_enabled');

	const secret = generateSecret();
	writeTx((tx) => {
		tx.update(users)
			.set({ totpPendingEnc: encryptSecret(secret) })
			.where(eq(users.id, user.id))
			.run();
	});
	return reply({ secret, uri: otpauthUri(row.username ?? row.id, secret) });
});
