import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dataDir, migrationsFolder, sqliteHandle } from '$lib/server/db';
import { migrateWithBackup } from '$lib/server/db/migrate';
import { scheduleNightlyBackup } from '$lib/server/db/backup';
import { logLine } from '$lib/server/db/log';
import { startPushScheduler } from '$lib/server/push/scheduler';
import { startHousekeeping } from '$lib/server/auth/events';
import { checkApiRequest, isApiPath } from '$lib/server/auth/guard';
import { errorResponse } from '$lib/server/auth/http';
import { trustedProxies } from '$lib/server/auth/proxy';
import { assertSessionSecret, sessionSecret } from '$lib/server/auth/secret';
import { validateSession } from '$lib/server/auth/sessions';

// Files and folders the server creates (database, photos, backups) are owner-only.
try {
	process.umask(0o077);
} catch {
	/* not available in a worker */
}

/**
 * Security headers that are not part of the CSP (svelte.config.js), the API origin guard, session lookup and a
 * minimal access log. The log never contains request bodies, query strings, cookies, user names or IP addresses
 * (ARCHITECTURE §8).
 */
const hstsMaxAge = Number.parseInt(env.HSTS_MAX_AGE ?? '0', 10);

const STATIC_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'no-referrer',
	'x-frame-options': 'DENY',
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin',
	'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
};

/**
 * Opens the database and applies pending migrations (after a pre-migration backup) before the first request.
 * Any failure aborts startup. The Docker image must contain `drizzle/` in the working directory (or set MIGRATIONS_DIR).
 */
export const init: ServerInit = async () => {
	try {
		assertSessionSecret();
		const sqlite = sqliteHandle();
		await migrateWithBackup(sqlite, dataDir(), migrationsFolder());
		sessionSecret(); // dev/test only: warns once and generates one when SESSION_SECRET is missing
		startHousekeeping();
		startPushScheduler();
		scheduleNightlyBackup(() => ({ sqlite, dataDir: dataDir() }));
	} catch (err) {
		logLine({ event: 'startup_failed', reason: err instanceof Error ? err.message : String(err) });
		process.exit(1);
	}
};

// Unexpected errors: log the route only, answer with a generic body (never a stack trace).
export const handleError: HandleServerError = ({ event, status }) => {
	if (status !== 404) logLine({ event: 'error', route: event.route.id ?? 'unmatched' });
	return { message: 'error' };
};

let peerLogged = false;

export const handleError: HandleServerError = ({ event, status }) => {
	if (status !== 404) logLine({ event: 'error', route: event.route.id ?? 'unmatched' });
	return { message: 'error' };
};

let peerLogged = false;

export const handle: Handle = async ({ event, resolve }) => {
	const started = performance.now();
	// Once per process: whether the socket peer of the first real request is a trusted proxy, so the owner can check
	// TRUSTED_PROXY (HOME_DEPLOYMENT.md). Only the yes/no is logged, never an address.
	if (!peerLogged && event.route.id !== '/healthz') {
		peerLogged = true;
		try {
			const peer = event.getClientAddress();
			logLine({ event: 'first_peer', trusted: trustedProxies().has(peer.replace(/^::ffff:/, '')) });
		} catch {
			/* no peer address available */
		}
	}
	const api = isApiPath(event.url.pathname);

	event.locals.user = null;
	event.locals.sessionId = null;

	let response: Response;
	const rejected = api
		? checkApiRequest(event.request.method, event.request.headers, event.url.origin, event.url.pathname)
		: null;
	if (rejected) {
		response = errorResponse(403, rejected);
	} else {
		const session = validateSession(event.cookies);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = session.sessionId;
		}
		response = await resolve(event);
	}

	// Responses from resolve() can have immutable headers; copy when needed.
	if (api && !response.headers.has('cache-control')) {
		response = new Response(response.body, response);
		response.headers.set('cache-control', 'no-store');
	}

	for (const [name, value] of Object.entries(STATIC_HEADERS)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	// Never includeSubDomains or preload: duckdns.org-style shared domains (HOME_DEPLOYMENT.md).
	if (hstsMaxAge > 0) response.headers.set('strict-transport-security', `max-age=${hstsMaxAge}`);

	if (env.ACCESS_LOG !== 'off' && event.route.id !== '/healthz') {
		process.stdout.write(
			JSON.stringify({
				t: new Date().toISOString(),
				method: event.request.method,
				route: event.route.id ?? 'unmatched',
				status: response.status,
				ms: Math.round(performance.now() - started)
			}) + '\n'
		);
	}
	return response;
};
