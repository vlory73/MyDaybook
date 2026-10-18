/**
 * CSRF defence for the JSON API (ARCHITECTURE §3.2): state-changing requests under /api/ must be JSON
 * (so a plain HTML form cannot send them) and must carry an Origin header equal to our own origin.
 * SameSite=Strict on the session cookie is the second layer.
 *
 * One exception: encrypted attachments are uploaded as raw bytes (`application/octet-stream`), because wrapping up to
 * 4 MiB of ciphertext in JSON/base64 would cost a third more memory and bandwidth on a phone. That content type is
 * accepted ONLY under /api/attachments/, and the same Origin check still applies. A cross-site HTML form cannot send
 * `application/octet-stream` (forms are limited to urlencoded, multipart and text/plain), and a cross-site fetch with
 * that type needs a CORS preflight that this server never answers, so the type does not open a CSRF path.
 */
const ATTACHMENTS_PREFIX = '/api/attachments/';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isApiPath(pathname: string): boolean {
	return pathname === '/api' || pathname.startsWith('/api/');
}

/** Returns null when the request may proceed, else the error code to answer with (HTTP 403). */
export function checkApiRequest(
	method: string,
	headers: Headers,
	ownOrigin: string,
	pathname = ''
): string | null {
	if (SAFE_METHODS.has(method.toUpperCase())) return null;
	const origin = headers.get('origin');
	if (origin === null || origin !== ownOrigin) return 'bad_origin';
	const type = headers.get('content-type') ?? '';
	if (/^application\/json\s*(;|$)/i.test(type)) return null;
	if (pathname.startsWith(ATTACHMENTS_PREFIX) && /^application\/octet-stream\s*(;|$)/i.test(type))
		return null;
	return 'bad_content_type';
}
