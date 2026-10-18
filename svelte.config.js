import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ precompress: true }),
		// Strict, hash-based CSP (docs/ARCHITECTURE.md §2.2, decision D2). SvelteKit adds the
		// sha256 of its own bootstrap script; nothing else may run inline.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['none'],
				'script-src': ['self', 'wasm-unsafe-eval'],
				'style-src': ['self'],
				// SvelteKit's route announcer (for screen readers) has one fixed inline style attribute.
				// Allow exactly that value by hash; e2e fails if a SvelteKit update changes it.
				'style-src-attr': ['unsafe-hashes', 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='],
				'img-src': ['self', 'blob:', 'data:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'manifest-src': ['self'],
				'worker-src': ['self'],
				'base-uri': ['none'],
				'form-action': ['self'],
				'frame-ancestors': ['none'],
				'object-src': ['none']
			}
		},
		inlineStyleThreshold: 0
	}
};

export default config;
