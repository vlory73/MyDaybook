import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		files: ['src/**/*.{ts,js,svelte}'],
		rules: {
			// Decrypted content must never reach a console (CLAUDE.md non-negotiables).
			'no-console': 'error',
			// User text is never rendered as HTML (threat model T8).
			'svelte/no-at-html-tags': 'error'
		}
	},
	{
		ignores: [
			'.claude/',
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'design/',
			'test-results/',
			'playwright-report/'
		]
	}
);
