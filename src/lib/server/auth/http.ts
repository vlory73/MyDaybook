import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { logLine } from '../db/log';
import { recordEvent } from './events';
import { resolveClientAddress } from './proxy';
import { limiters } from './rate-limit';
import { isObject } from './validate';

/** Thrown inside handlers; `api()` turns it into a generic `{ error: code }` response. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly headers: Record<string, string> = {}
	) {
		super(code);
	}
}

const NO_STORE = { 'cache-control': 'no-store' };

export function reply(data: unknown, status = 200): Response {
	return json(data, { status, headers: NO_STORE });
}

export function errorResponse(status: number, code: string, headers: Record<string, string> = {}): Response {
	return json({ error: code }, { status, headers: { ...NO_STORE, ...headers } });
}

/** Wraps a handler: ApiError becomes its response; anything else is a bare 500 (logged without details). */
export function api(handler: (event: RequestEvent) => Response | Promise<Response>): RequestHandler {
	return async (event) => {
		try {
			return await handler(event);
		} catch (err) {
			if (err instanceof ApiError) return errorResponse(err.status, err.code, err.headers);
			logLine({ event: 'api_error', route: event.route.id ?? 'unmatched' });
			return errorResponse(500, 'server_error');
		}
	};
}

/** Parses the JSON body, which must be an object. The origin guard in hooks has already checked the content type. */
export async function readJson(event: RequestEvent): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw new ApiError(400, 'bad_request');
	}
	if (!isObject(body)) throw new ApiError(400, 'bad_request');
	return body;
}

export function requireUser(event: RequestEvent) {
	if (!event.locals.user || !event.locals.sessionId) throw new ApiError(401, 'unauthenticated');
	return { user: event.locals.user, sessionId: event.locals.sessionId };
}

export function requireAdmin(event: RequestEvent) {
	const s = requireUser(event);
	if (s.user.role !== 'admin') throw new ApiError(403, 'forbidden');
	return s;
}

/** Address of the client; X-Forwarded-For is believed only from TRUSTED_PROXY (proxy.ts). Never logged. */
export function clientIp(event: RequestEvent): string | null {
	try {
		return resolveClientAddress(event.getClientAddress(), event.request.headers.get('x-forwarded-for'));
	} catch {
		return null;
	}
}

type Scope = 'prelogin' | 'login' | 'recover' | 'invite' | 'signup' | 'sensitive';

function keys(event: RequestEvent, scope: Scope, username: string | null) {
	const ip = clientIp(event) ?? 'unknown';
	return { ip: `${scope}:ip:${ip}`, user: username ? `${scope}:user:${username}` : null };
}

/**
 * Takes a token from the IP bucket and the user-name bucket (VPN users may share one NAT address, so both exist).
 * Throws 429 with Retry-After when either is empty.
 */
export function rateGuard(event: RequestEvent, scope: Scope, username: string | null = null): void {
	const k = keys(event, scope, username);
	const results = [limiters.ip.take(k.ip), k.user ? limiters.user.take(k.user) : ({ ok: true } as const)];
	const blocked = results.find((r) => !r.ok);
	if (blocked && !blocked.ok) {
		if (results.some((r) => !r.ok && r.firstBlock)) {
			recordEvent('rate_limited', null, clientIp(event));
		}
		throw new ApiError(429, 'rate_limited', { 'retry-after': String(blocked.retryAfterSec) });
	}
}

/** Counts a failed attempt towards the user's lock-out. */
export function noteFailure(scope: Scope, event: RequestEvent, username: string | null): void {
	const k = keys(event, scope, username);
	limiters.ip.fail(k.ip);
	if (k.user) limiters.user.fail(k.user);
}

export function noteSuccess(scope: Scope, event: RequestEvent, username: string | null): void {
	const k = keys(event, scope, username);
	limiters.ip.succeed(k.ip);
	if (k.user) limiters.user.succeed(k.user);
}
