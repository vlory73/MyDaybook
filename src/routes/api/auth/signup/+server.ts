import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { consents, invites, securityEvents, users } from '$lib/server/db/schema';
import { ipRetentionDays } from '$lib/server/auth/events';
import { ApiError, api, clientIp, rateGuard, readJson, reply } from '$lib/server/auth/http';
import { createSession } from '$lib/server/auth/sessions';
import { sha256 } from '$lib/server/auth/tokens';
import {
	KEY_LEN,
	SALT_LEN,
	WRAPPED_LEN,
	b64Bytes,
	parseConsent,
	parseKdfParams,
	parseToken,
	parseUsername,
	parseUuidV4
} from '$lib/server/auth/validate';

/** Invite-only signup. The server receives verifiers' inputs (AK, RAK) and wrapped keys, never a passphrase or MK. */
export const POST = api(async (event) => {
	const body = await readJson(event);
	const inviteToken = parseToken(body.inviteToken);
	const userId = parseUuidV4(body.userId);
	const username = parseUsername(body.username);
	const kdfSalt = b64Bytes(body.kdfSalt, SALT_LEN);
	const kdfParams = parseKdfParams(body.kdfParams);
	const authKey = b64Bytes(body.authKey, KEY_LEN);
	const recoveryAuthKey = b64Bytes(body.recoveryAuthKey, KEY_LEN);
	const wrappedMkPw = b64Bytes(body.wrappedMkByPassphrase, WRAPPED_LEN);
	const wrappedMkRk = b64Bytes(body.wrappedMkByRecovery, WRAPPED_LEN);
	const publicKey = b64Bytes(body.publicKey, KEY_LEN);
	const wrappedPrivateKey = b64Bytes(body.wrappedPrivateKey, WRAPPED_LEN);
	const consent = parseConsent(body.consent);
	if (
		!inviteToken ||
		!userId ||
		!username ||
		!kdfSalt ||
		!kdfParams ||
		!authKey ||
		!recoveryAuthKey ||
		!wrappedMkPw ||
		!wrappedMkRk ||
		!publicKey ||
		!wrappedPrivateKey ||
		!consent
	) {
		throw new ApiError(400, 'bad_request');
	}
	rateGuard(event, 'signup', username);

	const now = Date.now();
	const ip = clientIp(event);
	const role = db().transaction((tx) => {
		const invite = tx
			.select({ id: invites.id, role: invites.role })
			.from(invites)
			.where(
				and(eq(invites.tokenHash, sha256(inviteToken)), isNull(invites.usedAt), gt(invites.expiresAt, now))
			)
			.get();
		if (!invite) throw new ApiError(404, 'invalid_invite');
		if (tx.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
			throw new ApiError(409, 'username_taken');
		}
		if (tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) {
			throw new ApiError(409, 'user_exists');
		}
		tx.insert(users)
			.values({
				id: userId,
				username,
				kind: 'adult',
				role: invite.role,
				status: 'active',
				createdAt: now,
				kdfSalt,
				kdfParams: JSON.stringify(kdfParams),
				authVerifier: sha256(authKey),
				recoveryVerifier: sha256(recoveryAuthKey),
				wrappedMkPw,
				wrappedMkRk,
				publicKey,
				wrappedPrivateKey
			})
			.run();
		const used = tx
			.update(invites)
			.set({ usedAt: now, usedBy: userId })
			.where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
			.run();
		if (used.changes !== 1) throw new ApiError(404, 'invalid_invite');
		tx.insert(consents)
			.values({
				id: randomUUID(),
				userId,
				version: consent.version,
				textHash: consent.textHash,
				locale: consent.locale,
				actor: 'self',
				acceptedAt: now
			})
			.run();
		tx.insert(securityEvents)
			.values({ id: randomUUID(), type: 'signup', userId, ip: ipRetentionDays() > 0 ? ip : null, at: now })
			.run();
		return invite.role;
	});

	createSession(event.cookies, userId, now);
	return reply({ userId, username, role });
});
