import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { dataDir, db, sqliteHandle } from '$lib/server/db';
import { securityEvents, users } from '$lib/server/db/schema';
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
import { destroySession } from '$lib/server/auth/sessions';
import { verifySecret } from '$lib/server/auth/tokens';
import { KEY_LEN, b64Bytes } from '$lib/server/auth/validate';

/** Dependents for whom this user is the only guardian (decision D12). */
function soleGuardianOf(userId: string): number {
	const row = sqliteHandle()
		.prepare(
			`SELECT COUNT(*) AS n FROM guardianships g
			 WHERE g.guardian_id = ? AND NOT EXISTS (
				SELECT 1 FROM guardianships o WHERE o.dependent_id = g.dependent_id AND o.guardian_id <> g.guardian_id
			 )`
		)
		.get(userId) as { n: number };
	return row.n;
}

/**
 * Art. 17 erasure. Foreign keys cascade to records, sessions, consents, guardianships, push subscriptions and
 * reminder slots. The user's security_events go too; admin_audit rows stay for accountability (D23).
 */
export const POST = api(async (event) => {
	const { user } = requireUser(event);
	const authKey = b64Bytes((await readJson(event)).authKey, KEY_LEN);
	if (!authKey) throw new ApiError(400, 'bad_request');
	const key = user.username ?? user.id;
	rateGuard(event, 'sensitive', key);

	const row = findById(user.id);
	if (!row || !verifySecret(authKey, row.authVerifier)) {
		noteFailure('sensitive', event, key);
		recordEvent('login_failed', user.id, clientIp(event));
		throw new ApiError(401, 'invalid_credentials');
	}
	noteSuccess('sensitive', event, key);

	db().transaction((tx) => {
		if (soleGuardianOf(user.id) > 0) throw new ApiError(409, 'last_guardian');
		tx.delete(securityEvents).where(eq(securityEvents.userId, user.id)).run();
		tx.delete(users).where(eq(users.id, user.id)).run();
	});

	rmSync(join(dataDir(), 'blobs', user.id), { recursive: true, force: true });
	sqliteHandle().pragma('wal_checkpoint(TRUNCATE)');
	destroySession(event.cookies);
	return reply({ ok: true });
});
