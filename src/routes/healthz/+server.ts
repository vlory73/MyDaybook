import { json } from '@sveltejs/kit';
import { sqliteHandle } from '$lib/server/db';

// Liveness/readiness for the Compose healthcheck. No details, no auth (ARCHITECTURE §10).
// Runs a trivial query so a broken database makes the container unhealthy.
export function GET() {
	const headers = { 'cache-control': 'no-store' };
	try {
		sqliteHandle().prepare('SELECT 1').get();
		return json({ status: 'ok' }, { headers });
	} catch {
		return json({ status: 'error' }, { status: 503, headers });
	}
}
