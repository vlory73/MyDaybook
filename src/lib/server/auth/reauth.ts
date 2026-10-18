import type { RequestEvent } from '@sveltejs/kit';
import { findById, type UserRow } from './accounts';
import { recordEvent } from './events';
import { ApiError, clientIp, noteFailure, noteSuccess, rateGuard } from './http';
import { verifySecret } from './tokens';

/**
 * Re-authentication for sensitive actions: the caller sends the auth key derived from the current passphrase.
 * Shares the `sensitive` limiter with passphrase change and account deletion. Throws 401 `invalid_credentials`.
 */
export function reauthenticate(
	event: RequestEvent,
	user: { id: string; username: string | null },
	authKey: Buffer
): UserRow {
	const key = user.username ?? user.id;
	rateGuard(event, 'sensitive', key);
	const row = findById(user.id);
	if (!row || !verifySecret(authKey, row.authVerifier)) {
		noteFailure('sensitive', event, key);
		recordEvent('login_failed', user.id, clientIp(event));
		throw new ApiError(401, 'invalid_credentials');
	}
	noteSuccess('sensitive', event, key);
	return row;
}
