/**
 * The service worker cannot read localStorage or the app's translations (bundling both catalogs into it would put every
 * string of the app in the worker), so the app leaves the text of the notification, already in the chosen language, in
 * the Cache API. The worker reads that one sentence when a push arrives. Nothing else is shared this way.
 */
export const PREFS_CACHE = 'prefs';
export const TEXT_KEY = '/__reminder-text';

export async function saveNotificationText(text: string): Promise<void> {
	try {
		const cache = await caches.open(PREFS_CACHE);
		await cache.put(TEXT_KEY, new Response(text));
	} catch {
		// No Cache API (private mode): the notification then has no body text.
	}
}
