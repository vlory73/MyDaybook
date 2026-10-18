import type { Cookies } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { and, eq, lt, ne } from 'drizzle-orm';
import { db } from '../db';
import { sessions, users } from '../db/schema';
import { newToken, sha256 } from './tokens';

export const SESSION_IDLE_MS = 30 * 86_400_000;
const SLIDE_AFTER_MS = 60 * 60 * 1000;

/** `__Host-sid` (HttpOnly, Secure, SameSite=Strict, Path=/) unless COOKIE_SECURE=false (plain-http dev and e2e). */
export function cookieSecure(): boolean {
	return process.env.COOKIE_SECURE !== 'false';
}

export function cookieName(): string {
	return cookieSecure() ? '__Host-sid' : 'sid';
}

function setCookie(cookies: Cookies, token: string): void {
	cookies.set(cookieName(), token, {
		httpOnly: true,
		secure: cookieSecure(),
		sameSite: 'strict',
		path: '/',
		maxAge: SESSION_IDLE_MS / 1000
	});
}

export function clearCookie(cookies: Cookies): void {
	cookies.delete(cookieName(), { path: '/', secure: cookieSecure() });
}

export type SessionUser = {
	id: string;
	username: string | null;
	role: 'member' | 'admin';
	kind: 'adult' | 'dependent';
};

/** Creates a session row and sets the cookie. Returns the session id. */
export function createSession(cookies: Cookies, userId: string, now = Date.now()): string {
	const token = newToken();
	const id = randomUUID();
	db()
		.insert(sessions)
		.values({
			id,
			tokenHash: sha256(token),
			userId,
			createdAt: now,
			lastSeenAt: now,
			expiresAt: now + SESSION_IDLE_MS
		})
		.run();
	setCookie(cookies, token);
	return id;
}

/**
 * Resolves the session cookie to a user. Expired sessions and sessions of disabled accounts are removed or ignored.
 * The expiry slides forward at most once an hour, so a read does not become a write on every request.
 */
export function validateSession(
	cookies: Cookies,
	now = Date.now()
): { sessionId: string; user: SessionUser } | null {
	const token = cookies.get(cookieName());
	if (!token || token.length > 100) return null;
	const row = db()
		.select({
			sessionId: sessions.id,
			expiresAt: sessions.expiresAt,
			lastSeenAt: sessions.lastSeenAt,
			status: users.status,
			id: users.id,
			username: users.username,
			role: users.role,
			kind: users.kind
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.tokenHash, sha256(token)))
		.get();
	if (!row) {
		clearCookie(cookies);
		return null;
	}
	if (row.expiresAt <= now) {
		db().delete(sessions).where(eq(sessions.id, row.sessionId)).run();
		clearCookie(cookies);
		return null;
	}
	if (row.status !== 'active') return null;
	if (now - row.lastSeenAt >= SLIDE_AFTER_MS) {
		db()
			.update(sessions)
			.set({ lastSeenAt: now, expiresAt: now + SESSION_IDLE_MS })
			.where(eq(sessions.id, row.sessionId))
			.run();
		setCookie(cookies, token);
	}
	return {
		sessionId: row.sessionId,
		user: { id: row.id, username: row.username, role: row.role, kind: row.kind }
	};
}

export function destroySession(cookies: Cookies, sessionId?: string): void {
	if (sessionId) db().delete(sessions).where(eq(sessions.id, sessionId)).run();
	clearCookie(cookies);
}

/** Deletes every session of a user, optionally keeping one (the current one after a passphrase change). */
export function revokeAllSessions(userId: string, exceptSessionId?: string): void {
	db()
		.delete(sessions)
		.where(
			exceptSessionId
				? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
				: eq(sessions.userId, userId)
		)
		.run();
}

export function pruneExpiredSessions(now = Date.now()): void {
	db().delete(sessions).where(lt(sessions.expiresAt, now)).run();
}
