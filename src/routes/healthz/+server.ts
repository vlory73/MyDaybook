import { json } from '@sveltejs/kit';

// Liveness/readiness for the Compose healthcheck. No details, no auth (ARCHITECTURE §10).
// M2 adds a cheap database query here.
export function GET() {
	return json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
