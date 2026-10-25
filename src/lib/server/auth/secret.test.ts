import { describe, expect, it } from 'vitest';
import { assertSessionSecret } from './secret';

describe('assertSessionSecret', () => {
	it('refuses a missing or empty secret in production', () => {
		expect(() => assertSessionSecret({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
		expect(() => assertSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: '' })).toThrow();
		expect(() => assertSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: '  ' })).toThrow();
	});

	it('accepts a secret in production and anything outside production', () => {
		expect(() =>
			assertSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) })
		).not.toThrow();
		expect(() => assertSessionSecret({ NODE_ENV: 'development' })).not.toThrow();
		expect(() => assertSessionSecret({})).not.toThrow();
	});
});
