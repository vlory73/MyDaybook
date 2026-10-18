import { buildManifest } from '$lib/brand';

export const prerender = true;

export function GET() {
	return new Response(JSON.stringify(buildManifest()), {
		headers: { 'content-type': 'application/manifest+json' }
	});
}
