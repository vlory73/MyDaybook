import { describe, expect, it } from 'vitest';
import { isNewer, retag } from './release-prep.mjs';

describe('retag', () => {
	it('moves every pinned tag and counts them', () => {
		const text = 'image: ghcr.io/vlory73/mydaybook:0.1.0\nrun ghcr.io/vlory73/mydaybook:0.1.0 gen-secrets\n';
		expect(retag(text, '0.1.0', '0.2.0')).toEqual({
			text: 'image: ghcr.io/vlory73/mydaybook:0.2.0\nrun ghcr.io/vlory73/mydaybook:0.2.0 gen-secrets\n',
			count: 2
		});
	});
	it('leaves other versions and :edge alone', () => {
		expect(retag('mydaybook:0.1.01 mydaybook:0.1.0.1 mydaybook:edge', '0.1.0', '0.2.0').count).toBe(0);
		expect(retag('pin mydaybook:0.1.0.', '0.1.0', '0.2.0').text).toBe('pin mydaybook:0.2.0.');
		expect(retag('mydaybook:edge', '0.1.0', '0.2.0').count).toBe(0);
	});
});

describe('isNewer', () => {
	it('compares numerically, part by part', () => {
		expect(isNewer('0.1.0', '0.2.0')).toBe(true);
		expect(isNewer('0.9.0', '0.10.0')).toBe(true);
		expect(isNewer('0.2.0', '0.1.9')).toBe(false);
		expect(isNewer('0.2.0', '0.2.0')).toBe(false);
	});
});
