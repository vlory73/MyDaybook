/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, prerendered, version } from '$service-worker';
import { brand } from '$lib/brand';
import { isCacheableShell } from '$lib/pwa-shell';
import { PREFS_CACHE, TEXT_KEY } from '$lib/push/locale';

// Caches the app shell only: every build chunk is precached so that navigating between screens
// causes no network request the server could learn from (THREAT_MODEL §3.2). API responses are
// never cached here; the encrypted record cache lives in IndexedDB (M2).
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `shell-${version}`;
const ASSETS = [...build, ...files, ...prerendered];
const ASSET_SET = new Set(ASSETS);
const SHELL_KEY = '/__shell';

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE && k !== PREFS_CACHE).map((k) => caches.delete(k)))
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (ASSET_SET.has(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}
	// App navigations: network first; the last good shell is the fallback when offline.
	// The shell holds no user data (rendering is client-side), so caching it is safe.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then(async (response) => {
					if (isCacheableShell(url.pathname, response))
						await (await caches.open(CACHE)).put(SHELL_KEY, response.clone());
					return response;
				})
				.catch(async () => (await caches.match(SHELL_KEY)) ?? Response.error())
		);
	}
});

// ---- Reminders (D7) ----
// The push is empty and the text is fixed: nothing about medicines or health. The worker never touches keys or records;
// the only thing it reads is the one sentence, in the person's language, that the app left in the prefs cache (push/locale.ts).
async function notificationText(): Promise<string> {
	try {
		return (await (await caches.open(PREFS_CACHE)).match(TEXT_KEY))?.text() ?? '';
	} catch {
		return '';
	}
}

sw.addEventListener('push', (event) => {
	event.waitUntil(
		notificationText().then((body) =>
			sw.registration.showNotification(brand.displayName, {
				body,
				tag: 'reminder',
				icon: '/icon-192.png'
			})
		)
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			const open = clients.find((c) => new URL(c.url).origin === sw.location.origin);
			return open ? open.focus() : sw.clients.openWindow('/');
		})
	);
});
