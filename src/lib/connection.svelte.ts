/**
 * Whether the server can be reached right now. Starts from `navigator.onLine`, follows the browser's own
 * online/offline events, goes false on any network failure of an API call and true on any answer from the server.
 * No polling. When the state goes from offline to online, registered hooks run (the session refreshes quietly).
 */
export const connection = $state({ online: true });

let reconnectHooks: (() => void)[] = [];
let watching = false;

/** Sets the state; returns true when this was a change from offline to online (and the hooks ran). */
export function setOnline(online: boolean): boolean {
	const was = connection.online;
	connection.online = online;
	if (online && !was) {
		for (const hook of reconnectHooks) {
			try {
				hook();
			} catch {
				// A failing hook must not stop the others.
			}
		}
		return true;
	}
	return false;
}

/** Register work for the moment the connection comes back. Returns an unsubscribe. */
export function onReconnect(hook: () => void): () => void {
	reconnectHooks.push(hook);
	return () => {
		reconnectHooks = reconnectHooks.filter((h) => h !== hook);
	};
}

/** Starts following the browser's own online/offline state (once). */
export function watchConnection(): void {
	if (watching || typeof window === 'undefined') return;
	watching = true;
	if (typeof navigator !== 'undefined' && navigator.onLine === false) connection.online = false;
	window.addEventListener('online', () => setOnline(true));
	window.addEventListener('offline', () => setOnline(false));
}
