/**
 * Which push endpoints we are willing to POST to (SSRF guard). A subscription's endpoint is chosen by the client, so
 * accepting any URL would let a signed-in user make the server call arbitrary hosts. Only https URLs on the standard
 * port, on the hosts of the browsers' push services, pass.
 */
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);
const HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export const MAX_ENDPOINT_LENGTH = 2048;

export function isAllowedHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}

/** The parsed URL when the endpoint is acceptable, else null. */
export function parseEndpoint(value: unknown): URL | null {
	if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_LENGTH) return null;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
	return isAllowedHost(url.hostname) ? url : null;
}
