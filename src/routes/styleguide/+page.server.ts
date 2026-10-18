import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Developer-only component showcase, used for screenshots and e2e. Hidden unless STYLEGUIDE=1.
export function load() {
	if (env.STYLEGUIDE !== '1') error(404);
	return {};
}
