import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
	version: string;
};

export default defineConfig({
	plugins: [sveltekit()],
	// The app version from package.json, shown on Me (bumped by the release tooling).
	define: { __APP_VERSION__: JSON.stringify(version) },
	test: {
		include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
		environment: 'node'
	}
});
