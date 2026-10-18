import { describe, expect, it } from 'vitest';
import { resolveClientAddress, trustedProxies } from './proxy';

describe('trusted proxy', () => {
	const trusted = trustedProxies('172.30.90.1');

	it('believes X-Forwarded-For (last entry) only from the trusted peer', () => {
		expect(resolveClientAddress('172.30.90.1', '203.0.113.9', trusted)).toBe('203.0.113.9');
		expect(resolveClientAddress('172.30.90.1', '198.51.100.1, 203.0.113.9', trusted)).toBe('203.0.113.9');
		expect(resolveClientAddress('::ffff:172.30.90.1', '203.0.113.9', trusted)).toBe('203.0.113.9');
	});

	it('ignores the header from other peers and when it is absent', () => {
		expect(resolveClientAddress('192.0.2.7', '203.0.113.9', trusted)).toBe('192.0.2.7');
		expect(resolveClientAddress('172.30.90.1', null, trusted)).toBe('172.30.90.1');
	});

	it('trusts nobody when TRUSTED_PROXY is empty', () => {
		const none = trustedProxies('');
		expect(none.size).toBe(0);
		expect(resolveClientAddress('172.30.90.1', '203.0.113.9', none)).toBe('172.30.90.1');
	});

	it('accepts a comma-separated list', () => {
		const two = trustedProxies('10.0.0.1, 172.30.90.1');
		expect(resolveClientAddress('10.0.0.1', '203.0.113.9', two)).toBe('203.0.113.9');
	});
});
