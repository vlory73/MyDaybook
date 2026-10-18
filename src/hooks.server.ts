import type { Handle, ServerInit } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dataDir, migrationsFolder, sqliteHandle } from '$lib/server/db';
import { migrateWithBackup } from '$lib/server/db/migrate';
import { scheduleNightlyBackup } from '$lib/server/db/backup';
import { logLine } from '$lib/server/db/log';

/**
 * Security headers that are not part of the CSP (svelte.config.js) and a minimal access log.
 * The log never contains request bodies, query strings or IP addresses (ARCHITECTURE §8).
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
		const sqlite = sqliteHandle();
		await migrateWithBackup(sqlite, dataDir(), migrationsFolder());
		scheduleNightlyBackup(() => ({ sqlite, dataDir: dataDir() }));
	} catch (err) {
		logLine({ event: 'startup_failed', reason: err instanceof Error ? err.message : String(err) });
		process.exit(1);
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	const started = performance.now();
	const response = await resolve(event);

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
