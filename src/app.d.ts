// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	/** The app version from package.json, set in vite.config.ts. */
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		interface Locals {
			/** Set by hooks.server.ts when a valid session cookie is present. */
			user: {
				id: string;
				username: string | null;
				role: 'member' | 'admin';
				kind: 'adult' | 'dependent';
			} | null;
			sessionId: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
