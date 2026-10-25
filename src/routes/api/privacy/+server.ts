import { json } from '@sveltejs/kit';
import { privacySettings } from '$lib/server/settings';

/**
 * Public and read-only: the retention periods and the operator's contact line that the Privacy page shows, also to
 * people who are not signed in yet (the sign-up consent step links to it). No user data. Cacheable for a minute.
 */
export function GET() {
	return json(privacySettings(), { headers: { 'cache-control': 'public, max-age=60' } });
}
