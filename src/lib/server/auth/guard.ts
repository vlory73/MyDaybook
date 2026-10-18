/**
 * CSRF defence for the JSON API (ARCHITECTURE §3.2): state-changing requests under /api/ must be JSON
 * (so a plain HTML form cannot send them) and must carry an Origin header equal to our own origin.
 * SameSite=Strict on the session cookie is the second layer.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isApiPath(pathname: string): boolean {
	return pathname === '/api' || pathname.startsWith('/api/');
}

/** Returns null when the request may proceed, else the error code to answer with (HTTP 403). */
export function checkApiRequest(method: string, headers: Headers, ownOrigin: string): string | null {
	if (SAFE_METHODS.has(method.toUpperCase())) return null;
	const origin = headers.get('origin');
	if (origin === null || origin !== ownOrigin) return 'bad_origin';
	const type = headers.get('content-type') ?? '';
	if (!/^application\/json\s*(;|$)/i.test(type)) return 'bad_content_type';
	return null;
}
