import { describe, expect, it } from 'vitest';
import { isCacheableShell } from './pwa-shell';

const res = (type: string | null, ok = true) => ({
	ok,
	headers: new Headers(type ? { 'content-type': type } : {})
});

describe('isCacheableShell', () => {
	it('accepts a successful HTML page', () => {
		expect(isCacheableShell('/', res('text/html; charset=utf-8'))).toBe(true);
		expect(isCacheableShell('/me', res('Text/HTML'))).toBe(true);
	});
	it('refuses API paths, non-HTML and failures', () => {
		expect(isCacheableShell('/api/export', res('text/html'))).toBe(false);
		expect(isCacheableShell('/api', res('text/html'))).toBe(false);
		expect(isCacheableShell('/', res('application/json'))).toBe(false);
		expect(isCacheableShell('/', res(null))).toBe(false);
		expect(isCacheableShell('/', res('text/html', false))).toBe(false);
	});
});
