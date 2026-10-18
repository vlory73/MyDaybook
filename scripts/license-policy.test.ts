import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { ASSET, SHIPPED, TOOLING_EXTRA, satisfies, union } from './license-policy.mjs';

describe('licence policy', () => {
	it('accepts allowed licences and rejects others for shipped code', () => {
		expect(satisfies('MIT', SHIPPED)).toBe(true);
		expect(satisfies('MPL-2.0', SHIPPED)).toBe(false);
		expect(satisfies('GPL-3.0-only', SHIPPED)).toBe(false);
		expect(satisfies('BlueOak-1.0.0', SHIPPED)).toBe(false);
	});

	it('evaluates OR and AND expressions', () => {
		expect(satisfies('(MIT OR GPL-3.0)', SHIPPED)).toBe(true);
		expect(satisfies('(MIT AND CC-BY-3.0)', SHIPPED)).toBe(false);
		expect(satisfies('(MIT AND CC-BY-3.0)', union(SHIPPED, ASSET))).toBe(true);
		expect(satisfies('MIT AND (Apache-2.0 OR MPL-2.0)', SHIPPED)).toBe(true);
	});

	it('allows the extra permissive licences for tooling only', () => {
		expect(satisfies('BlueOak-1.0.0', union(SHIPPED, ASSET, TOOLING_EXTRA))).toBe(true);
		expect(satisfies('UNKNOWN', union(SHIPPED, ASSET, TOOLING_EXTRA))).toBe(false);
	});
});
