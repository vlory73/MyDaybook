import { describe, expect, it } from 'vitest';
import { translate } from '$lib/i18n/core';
import { en } from '$lib/i18n/en';
import { da } from '$lib/i18n/da';
import {
	REGIONS,
	REGION_IDS,
	SIDES,
	VIEWS,
	allChoices,
	edgeSides,
	findRegions,
	findShape,
	isPlace,
	regionKey,
	regionName,
	shapesOf,
	sidesOf,
	spaceOf,
	toLocal,
	toView,
	viewOf,
	type RegionId
} from './catalogue';

describe('catalogue', () => {
	it('has unique region IDs, about thirty of them', () => {
		expect(new Set(REGION_IDS).size).toBe(REGION_IDS.length);
		expect(REGION_IDS.length).toBeGreaterThanOrEqual(24);
		expect(REGION_IDS.length).toBeLessThanOrEqual(32);
		for (const id of REGION_IDS) expect(id).toMatch(/^[a-z]+(_[a-z]+)*$/);
	});

	it('names every region on every side in en and da', () => {
		for (const def of REGIONS) {
			for (const side of sidesOf(def.id as RegionId)) {
				const key = regionKey(def.id as RegionId, side);
				expect(en, key).toHaveProperty([key]);
				expect(da, key).toHaveProperty([key]);
				expect(regionName('en', def.id as RegionId, side).length).toBeGreaterThan(2);
				expect(regionName('da', def.id as RegionId, side).length).toBeGreaterThan(2);
			}
		}
	});

	it('names paired regions from the person own side, midline regions without a side', () => {
		expect(regionName('en', 'knee', 'right')).toBe('Your right knee');
		expect(regionName('da', 'knee', 'right')).toBe('Dit højre knæ');
		expect(regionName('da', 'shoulder', 'left')).toBe('Din venstre skulder');
		expect(regionName('en', 'lower_back', 'midline')).toBe('Lower back');
		for (const def of REGIONS.filter((r) => !r.paired)) {
			expect(regionName('en', def.id as RegionId, 'midline')).not.toMatch(/\b(left|right)\b/i);
		}
	});

	it('uses only valid sides, with paired regions on left and right and others on the midline', () => {
		for (const def of REGIONS) {
			const sides = sidesOf(def.id as RegionId);
			for (const s of sides) expect(SIDES).toContain(s);
			expect(sides).toEqual(def.paired ? ['right', 'left'] : ['midline']);
		}
	});

	it('draws every region in each view it lists, on each of its sides, and nothing else', () => {
		for (const view of VIEWS) {
			const shapes = shapesOf(view);
			const keys = shapes.map((s) => s.key);
			expect(new Set(keys).size).toBe(keys.length);
			for (const def of REGIONS) {
				for (const side of sidesOf(def.id as RegionId)) {
					const found = findShape(view, def.id, side);
					expect(!!found, `${def.id}/${side}/${view}`).toBe(def.views.includes(view));
				}
			}
			for (const s of shapes) {
				expect(s.x).toBeGreaterThanOrEqual(0);
				expect(s.x + s.w).toBeLessThanOrEqual(200);
				expect(s.y + s.h).toBeLessThanOrEqual(440);
			}
		}
	});

	it('mirrors sides in the front view only', () => {
		expect(edgeSides('front')).toEqual({ screenLeft: 'right', screenRight: 'left' });
		expect(edgeSides('back')).toEqual({ screenLeft: 'left', screenRight: 'right' });
		const front = findShape('front', 'knee', 'right')!;
		expect(front.x + front.w / 2).toBeLessThan(100); // the person's right is on the screen's left
		const back = findShape('back', 'knee', 'right')!;
		expect(back.x + back.w / 2).toBeGreaterThan(100);
		for (const view of VIEWS)
			for (const s of shapesOf(view).filter((s) => s.side !== 'midline')) {
				const onLeft = s.x + s.w / 2 < 100;
				expect(s.side).toBe(onLeft ? edgeSides(view).screenLeft : edgeSides(view).screenRight);
			}
	});

	it('keeps spaces and views in step', () => {
		for (const v of VIEWS) expect(viewOf(spaceOf(v))).toBe(v);
		expect(isPlace('knee', 'right', '2d-front-v1')).toBe(true);
		expect(isPlace('knee', 'midline', '2d-front-v1')).toBe(false);
		expect(isPlace('head', 'midline', '2d-back-v1')).toBe(false); // the back view has back_of_head
		expect(isPlace('back_of_head', 'midline', '2d-back-v1')).toBe(true);
		expect(isPlace('nose', 'midline', '2d-front-v1')).toBe(false);
		expect(isPlace('knee', 'right', '3d-mesh-v1')).toBe(false);
	});

	it('turns a position into region-local (u, v) and back, also for rotated arms', () => {
		for (const view of VIEWS)
			for (const s of shapesOf(view)) {
				for (const [u, v] of [
					[0.5, 0.5],
					[0.2, 0.8],
					[0.9, 0.1]
				] as const) {
					const p = toView(s, u, v);
					const back = toLocal(s, p.x, p.y);
					expect(back.u).toBeCloseTo(u, 6);
					expect(back.v).toBeCloseTo(v, 6);
				}
			}
		const knee = findShape('front', 'knee', 'right')!;
		expect(toLocal(knee, knee.x, knee.y)).toEqual({ u: 0, v: 0 });
		expect(toLocal(knee, -50, 900)).toEqual({ u: 0, v: 1 }); // clamped into 0..1
	});
});

describe('Find', () => {
	it('lists every region on every side when the query is empty', () => {
		const sidedCount = REGIONS.reduce((n, r) => n + (r.paired ? 2 : 1), 0);
		expect(findRegions('', 'en')).toHaveLength(sidedCount);
		expect(findRegions('   ', 'da')).toHaveLength(sidedCount);
	});

	it('filters by the English name, every word must match', () => {
		const names = findRegions('knee', 'en').map((c) => c.name);
		expect(names).toEqual(['Your right knee', 'Your left knee']);
		expect(findRegions('RIGHT knee', 'en').map((c) => c.name)).toEqual(['Your right knee']);
		expect(findRegions('zzz', 'en')).toEqual([]);
	});

	it('filters by the Danish name', () => {
		expect(findRegions('højre knæ', 'da').map((c) => c.name)).toEqual(['Dit højre knæ']);
		expect(findRegions('lyske', 'da')).toHaveLength(2);
		expect(findRegions('knee', 'da')).toEqual([]);
	});

	it('returns region, side, space and the region centre', () => {
		const [pick] = findRegions('your right knee', 'en');
		expect(pick!.place).toEqual({
			region: 'knee',
			side: 'right',
			space: '2d-front-v1',
			u: 0.5,
			v: 0.5
		});
	});

	it('prefers the current view for regions both views draw, and the only view otherwise', () => {
		expect(findRegions('shoulder', 'en', 'back')[0]!.place.space).toBe('2d-back-v1');
		expect(findRegions('shoulder', 'en', 'front')[0]!.place.space).toBe('2d-front-v1');
		expect(findRegions('buttock', 'en', 'front')[0]!.place.space).toBe('2d-back-v1');
		expect(findRegions('chest', 'en', 'back')[0]!.place.space).toBe('2d-front-v1');
		for (const view of VIEWS)
			for (const c of allChoices('en', view))
				expect(isPlace(c.place.region, c.place.side, c.place.space)).toBe(true);
	});

	it('has the same entries in both languages', () => {
		expect(allChoices('en').map((c) => c.place)).toEqual(allChoices('da').map((c) => c.place));
		expect(translate('da', 'bodymap.find.label')).not.toBe(translate('en', 'bodymap.find.label'));
	});
});
