/**
 * Whether a navigation response may be stored as the offline app shell: a successful HTML page that is not under
 * the API path (a redirect target, an error page or JSON must never become the shell).
 */
export function isCacheableShell(pathname: string, response: Pick<Response, 'ok' | 'headers'>): boolean {
	if (!response.ok) return false;
	if (pathname === '/api' || pathname.startsWith('/api/')) return false;
	return (response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html');
}
