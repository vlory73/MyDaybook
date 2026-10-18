/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, prerendered, version } from '$service-worker';

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
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
					if (response.ok) await (await caches.open(CACHE)).put(SHELL_KEY, response.clone());
					return response;
				})
				.catch(async () => (await caches.match(SHELL_KEY)) ?? Response.error())
		);
	}
});
