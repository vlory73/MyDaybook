import { describe, expect, it } from 'vitest';
import { brand, buildManifest } from './brand';

describe('manifest', () => {
	it('takes every name from brand.config.json', () => {
		const m = buildManifest('da');
		expect(m.name).toBe(brand.displayName);
		expect(m.short_name).toBe(brand.shortName);
		expect(m.description).toBe(brand.description.da);
	});

	it('is installable: standalone, root scope, 192 and 512 icons', () => {
		const m = buildManifest();
		expect(m.display).toBe('standalone');
		expect(m.start_url).toBe('/');
		expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
	});
});
