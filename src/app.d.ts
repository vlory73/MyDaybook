// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
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
