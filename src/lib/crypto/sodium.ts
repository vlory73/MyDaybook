import type sodiumType from 'libsodium-wrappers-sumo';

export type Sodium = typeof sodiumType;

let instance: Sodium | null = null;
let loading: Promise<Sodium> | null = null;

/**
 * Loads libsodium (WASM) once. Imported dynamically so the ~200 KB library is a separate chunk,
 * fetched by the service worker precache rather than on first paint. Requires 'wasm-unsafe-eval' in the CSP;
 * without it libsodium falls back to slow asm.js (ARCHITECTURE §2.2).
 */
export function initCrypto(): Promise<Sodium> {
	loading ??= import('libsodium-wrappers-sumo').then(async (mod) => {
		const sodium = (mod.default ?? mod) as Sodium;
		await sodium.ready;
		instance = sodium;
		return sodium;
	});
	return loading;
}

/** The loaded library. Call initCrypto() first. */
export function sodium(): Sodium {
	if (!instance) throw new Error('crypto not initialised: await initCrypto() first');
	return instance;
}
