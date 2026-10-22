import { describe, expect, it } from 'vitest';
import { translate } from '$lib/i18n/core';
import { en } from '$lib/i18n/en';
import { da } from '$lib/i18n/da';
import {
	REGIONS,
	REGION_IDS,
	regionDef,
	SIDES,
	VIEWS,
	allChoices,
	edgeSides,
	findRegions,
	findShape,
	isPlace,
	isRegionId,
	regionKey,
	regionName,
	shapesOf,
	sidesOf,
	spaceOf,
	toLocal,
	ZOOMS,
	FACES,
	sceneShape,
	zoomScene,
	zoomFor,
	mainScene,
	wideOptions,
	activeWide,
	widen,
	viewIdOf,
	type Face,
	type ZoomState,
	toView,
	viewOf,
	type RegionId
} from './catalogue';

describe('catalogue', () => {
	it('has unique region IDs: about thirty main ones and the close-up ones', () => {
		expect(new Set(REGION_IDS).size).toBe(REGION_IDS.length);
		const main = REGIONS.filter((r) => r.views.some((v) => v === 'front' || v === 'back'));
		expect(main.length).toBeGreaterThanOrEqual(24);
		expect(main.length).toBeLessThanOrEqual(32);
		expect(REGION_IDS.length).toBeLessThanOrEqual(60);
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
			const midlineToo = 'midline' in def && def.midline === true;
			expect(sides).toEqual(
				def.paired ? (midlineToo ? ['right', 'left', 'midline'] : ['right', 'left']) : ['midline']
			);
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
		const sidedCount = REGIONS.reduce((n, r) => n + sidesOf(r.id as RegionId).length, 0);
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

const zoomStates = (): ZoomState[] => [
	{ zoom: 'head', face: 'front' },
	{ zoom: 'head', face: 'back' },
	...(['left', 'right'] as const).flatMap((side) =>
		FACES.hand.map((face) => ({ zoom: 'hand' as const, side, face }))
	),
	...(['left', 'right'] as const).flatMap((side) =>
		FACES.foot.map((face) => ({ zoom: 'foot' as const, side, face }))
	)
];

/** The view (or close-up) a close-up state draws: the head has one per face. */
const viewOfState = (z: ZoomState) =>
	z.zoom === 'head' ? (z.face === 'front' ? 'head' : 'head_back') : z.zoom;

describe('close-up views', () => {
	it('gives every close-up region a parent on the main view and a name in both languages', () => {
		const closeUps = [...ZOOMS, 'head_back'];
		for (const def of REGIONS.filter((r) => r.views.every((v) => closeUps.includes(v)))) {
			expect(def.parent, def.id).toBeTruthy();
			expect(regionDef(def.parent!)?.views.some((v) => v === 'front' || v === 'back')).toBe(true);
			expect(def.parent).toBe(def.views[0] === 'head_back' ? 'head' : def.views[0]);
		}
		for (const zoom of closeUps) {
			const count = REGIONS.filter((r) => r.views.includes(zoom as never)).length;
			expect(count, zoom).toBeGreaterThanOrEqual(zoom === 'head_back' ? 6 : 8);
			expect(count, zoom).toBeLessThanOrEqual(15);
		}
		expect(regionName('en', 'thumb', 'right')).toBe('Your right thumb');
		expect(regionName('da', 'thumb', 'right')).toBe('Din højre tommelfinger');
		expect(regionName('en', 'temple', 'left')).toBe('Your left temple');
	});

	it('has a shape in its own space for every region and side a close-up lists', () => {
		for (const z of zoomStates()) {
			const scene = zoomScene(z);
			expect(scene.space).toBe(spaceOf(viewOfState(z)));
			expect(viewIdOf(scene.space)).toBe(viewOfState(z));
			const keys = scene.shapes.map((s) => s.key);
			expect(new Set(keys).size).toBe(keys.length);
			for (const s of scene.shapes) {
				expect(s.x, s.key).toBeGreaterThanOrEqual(0);
				expect(s.x + s.w, s.key).toBeLessThanOrEqual(scene.viewBox.w);
				expect(s.y + s.h, s.key).toBeLessThanOrEqual(scene.viewBox.h);
				expect(isPlace(s.region, s.side, scene.space), `${s.region}/${s.side}`).toBe(true);
			}
			// Every region of the view appears (on its faces), on the right side(s).
			for (const def of REGIONS.filter((r) => r.views.includes(viewOfState(z)))) {
				const face = z.zoom === 'head' ? undefined : (z as { face: Face }).face;
				const faces = (def as { faces?: readonly Face[] }).faces;
				const drawn = !faces || (face !== undefined && faces.includes(face));
				const sides =
					z.zoom === 'head' ? sidesOf(def.id as RegionId) : [(z as { side: 'left' | 'right' }).side];
				for (const side of sides)
					expect(!!sceneShape(scene, def.id, side), `${def.id}/${side}/${JSON.stringify(z)}`).toBe(drawn);
			}
		}
	});

	it('mirrors the head like the front view and shows hands and feet on the side chosen', () => {
		const head = zoomScene({ zoom: 'head', face: 'front' });
		const eye = sceneShape(head, 'around_eye', 'right')!;
		expect(eye.x + eye.w / 2).toBeLessThan(100); // the person's right is on the screen's left
		expect(head.edges).toEqual({ screenLeft: 'right', screenRight: 'left' });
		// The back of the head does not mirror.
		const back = zoomScene({ zoom: 'head', face: 'back' });
		const rear = sceneShape(back, 'rear_head', 'right')!;
		expect(rear.x + rear.w / 2).toBeGreaterThan(100);
		expect(back.edges).toEqual({ screenLeft: 'left', screenRight: 'right' });
		const hand = zoomScene({ zoom: 'hand', side: 'left', face: 'palm' });
		expect(hand.edges).toBeNull();
		expect(hand.shapes.every((s) => s.side === 'left')).toBe(true);
		// Thumb on the right for the right palm, on the left for the left palm and the back of the right hand.
		const thumbX = (side: 'left' | 'right', face: Face) => {
			const t = sceneShape(zoomScene({ zoom: 'hand', side, face }), 'thumb', side)!;
			return t.x + t.w / 2;
		};
		expect(thumbX('right', 'palm')).toBeGreaterThan(100);
		expect(thumbX('left', 'palm')).toBeLessThan(100);
		expect(thumbX('right', 'back')).toBeLessThan(100);
		expect(thumbX('left', 'back')).toBeGreaterThan(100);
		const toeX = (side: 'left' | 'right', face: Face) => {
			const t = sceneShape(zoomScene({ zoom: 'foot', side, face }), 'big_toe', side)!;
			return t.x + t.w / 2;
		};
		expect(toeX('right', 'top')).toBeLessThan(100);
		expect(toeX('left', 'top')).toBeGreaterThan(100);
		// One silhouette for both faces: the inner (big toe) side is the same on the sole as on the top.
		expect(toeX('right', 'sole')).toBeLessThan(100);
		expect(toeX('left', 'sole')).toBeGreaterThan(100);
		// Five toes, big toe the largest, decreasing towards the little toe.
		const foot = zoomScene({ zoom: 'foot', side: 'right', face: 'top' });
		const sizes = ['big_toe', 'second_toe', 'third_toe', 'fourth_toe', 'little_toe'].map((r) => {
			const t = sceneShape(foot, r, 'right')!;
			return t.w * t.h;
		});
		expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
		// The inner ankle is on the big toe side.
		expect(sceneShape(foot, 'inner_ankle', 'right')!.x).toBeLessThan(
			sceneShape(foot, 'outer_ankle', 'right')!.x
		);
	});

	it('round-trips (u, v) in every close-up, also for mirrored and rotated shapes', () => {
		for (const z of zoomStates())
			for (const s of zoomScene(z).shapes)
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
	});

	it('keeps a point in place when the hand is turned over (u is stored unmirrored)', () => {
		const palm = sceneShape(
			zoomScene({ zoom: 'hand', side: 'right', face: 'palm' }),
			'index_finger',
			'right'
		)!;
		const back = sceneShape(
			zoomScene({ zoom: 'hand', side: 'right', face: 'back' }),
			'index_finger',
			'right'
		)!;
		expect(palm.flip).toBe(false);
		expect(back.flip).toBe(true);
		// The same stored u lands on the same part of the finger (nearer the thumb side) on both faces.
		const a = toView(palm, 0.9, 0.5);
		const b = toView(back, 0.9, 0.5);
		expect(a.x).toBeGreaterThan(palm.x + palm.w / 2);
		expect(b.x).toBeLessThan(back.x + back.w / 2);
	});

	it('uses the same segments for both faces and one position box for top_of_foot', () => {
		const top = zoomScene({ zoom: 'foot', side: 'left', face: 'top' });
		const sole = zoomScene({ zoom: 'foot', side: 'left', face: 'sole' });
		const toes = (sc: typeof top) =>
			sc.shapes.filter((s) => s.region.endsWith('toe')).map((s) => [s.region, s.x, s.y]);
		expect(toes(top)).toEqual(toes(sole));
		expect(toes(top)).toHaveLength(5);
		const segments = top.shapes.filter((s) => s.region === 'top_of_foot');
		expect(segments).toHaveLength(2);
		expect(segments[0]!.box).toEqual(segments[1]!.box);
		for (const s of segments) {
			const p = toView(s, 0.25, 0.75);
			const back = toLocal(s, p.x, p.y);
			expect(back.u).toBeCloseTo(0.25, 6);
			expect(back.v).toBeCloseTo(0.75, 6);
		}
	});

	it('chooses the close-up for a place, keeping the face for fingers and toes', () => {
		const at = (
			region: string,
			side: 'left' | 'right',
			space: '2d-hand-v1' | '2d-foot-v1' | '2d-head-front-v2' | '2d-head-back-v2'
		) => ({
			region,
			side,
			space
		});
		expect(zoomFor(at('temple', 'right', '2d-head-front-v2'), null)).toEqual({ zoom: 'head', face: 'front' });
		expect(zoomFor(at('rear_head', 'left', '2d-head-back-v2'), null)).toEqual({ zoom: 'head', face: 'back' });
		expect(zoomFor(at('thumb', 'left', '2d-hand-v1'), null)).toEqual({
			zoom: 'hand',
			side: 'left',
			face: 'palm'
		});
		expect(zoomFor(at('back_of_hand', 'right', '2d-hand-v1'), null)).toEqual({
			zoom: 'hand',
			side: 'right',
			face: 'back'
		});
		const onBack: ZoomState = { zoom: 'hand', side: 'right', face: 'back' };
		expect(zoomFor(at('thumb', 'right', '2d-hand-v1'), onBack)).toEqual(onBack);
		expect(zoomFor(at('thumb', 'left', '2d-hand-v1'), onBack)).toEqual({
			zoom: 'hand',
			side: 'left',
			face: 'palm'
		});
		expect(zoomFor(at('sole', 'left', '2d-foot-v1'), null)).toEqual({
			zoom: 'foot',
			side: 'left',
			face: 'sole'
		});
		expect(zoomFor(at('little_toe', 'left', '2d-foot-v1'), null)).toEqual({
			zoom: 'foot',
			side: 'left',
			face: 'top'
		});
		expect(zoomFor({ region: 'knee', side: 'left', space: '2d-front-v1' }, null)).toBeNull();
	});
});

describe('wider areas', () => {
	it('draws the wider areas on the main views, covering the quarters, with the dot at the centre', () => {
		const front = mainScene('front');
		const belly = sceneShape(front, 'belly', 'midline')!;
		for (const q of ['upper_belly', 'lower_belly'] as const)
			for (const side of ['left', 'right'] as const) {
				const s = sceneShape(front, q, side)!;
				expect(s.x).toBeGreaterThanOrEqual(belly.x);
				expect(s.x + s.w).toBeLessThanOrEqual(belly.x + belly.w);
				expect(s.y).toBeGreaterThanOrEqual(belly.y);
				expect(s.y + s.h).toBeLessThanOrEqual(belly.y + belly.h);
			}
		expect(sceneShape(front, 'upper_belly', 'midline')).toBeDefined();
		expect(sceneShape(front, 'lower_belly', 'midline')).toBeDefined();
		const back = mainScene('back');
		const whole = sceneShape(back, 'back', 'midline')!;
		for (const part of ['upper_back', 'mid_back', 'lower_back'] as const) {
			const s = sceneShape(back, part, 'midline')!;
			expect(s.x).toBeGreaterThanOrEqual(whole.x);
			expect(s.x + s.w).toBeLessThanOrEqual(whole.x + whole.w);
			expect(s.y).toBeGreaterThanOrEqual(whole.y);
			expect(s.y + s.h).toBeLessThanOrEqual(whole.y + whole.h);
		}
		const c = toView(belly, 0.5, 0.5);
		expect(c.x).toBeCloseTo(100, 6);
		// Wider areas are not tappable shapes.
		expect(front.shapes.some((s) => s.region === 'belly')).toBe(false);
	});

	it('sets the parents of the quarters and back parts, and names the wider areas', () => {
		expect(regionDef('upper_belly')?.parent).toBe('belly');
		expect(regionDef('lower_belly')?.parent).toBe('belly');
		for (const p of ['upper_back', 'mid_back', 'lower_back']) expect(regionDef(p)?.parent).toBe('back');
		expect(regionDef('chest')?.parent).toBeUndefined(); // chest is not widened (owner decision)
		expect(regionName('en', 'belly', 'midline')).toBe('Whole belly');
		expect(regionName('da', 'belly', 'midline')).toBe('Hele maven');
		expect(regionName('en', 'upper_belly', 'midline')).toBe('Upper belly');
		expect(regionName('da', 'lower_belly', 'midline')).toBe('Nedre mave');
		expect(regionName('en', 'back', 'midline')).toBe('Whole back');
		expect(regionName('da', 'back', 'midline')).toBe('Hele ryggen');
		expect(regionName('en', 'upper_belly', 'left')).toBe('Your left upper belly'); // old data keeps its name
	});

	it('offers the wider choices for a belly quarter and for a back part, and none elsewhere', () => {
		const labels = (r: string, s: 'left' | 'right' | 'midline', o?: Parameters<typeof wideOptions>[1]) =>
			wideOptions({ region: r, side: s }, o).map((x) => translate('en', x.key));
		expect(labels('upper_belly', 'left')).toEqual(['This quarter', 'Upper belly', 'Whole belly']);
		expect(labels('lower_belly', 'right')).toEqual(['This quarter', 'Lower belly', 'Whole belly']);
		// A wider area keeps the way back to the remembered quarter, and the options that contain it.
		const upperQuarter = { region: 'upper_belly', side: 'left', u: 0.3, v: 0.4 } as const;
		expect(labels('belly', 'midline', upperQuarter)).toEqual(['This quarter', 'Upper belly', 'Whole belly']);
		expect(labels('upper_belly', 'midline', upperQuarter)).toEqual([
			'This quarter',
			'Upper belly',
			'Whole belly'
		]);
		expect(labels('lower_belly', 'midline')).toEqual(['Lower belly', 'Whole belly']);
		expect(wideOptions({ region: 'lower_belly', side: 'right' })[0]).toMatchObject({
			id: 'this',
			region: 'lower_belly',
			side: 'right'
		});
		expect(labels('mid_back', 'midline')).toEqual(['This part', 'Whole back']);
		expect(translate('da', 'bodymap.wide.quarter')).toBe('Denne fjerdedel');
		expect(translate('da', 'bodymap.wide.whole_belly')).toBe('Hele maven');
		expect(translate('da', 'bodymap.wide.part')).toBe('Denne del');
		expect(translate('da', 'bodymap.wide.whole_back')).toBe('Hele ryggen');
		// A wider area that was not widened from a quarter has no "this quarter".
		expect(labels('belly', 'midline')).toEqual(['Upper belly', 'Lower belly', 'Whole belly']);
		expect(wideOptions({ region: 'knee', side: 'left' })).toEqual([]);
		expect(wideOptions({ region: 'chest', side: 'left' })).toEqual([]);
		expect(wideOptions({ region: 'head', side: 'midline' })).toEqual([]);
	});

	it('widens to the centre of the wider area and puts the quarter back', () => {
		const quarter = { region: 'upper_belly', side: 'left', u: 0.3, v: 0.7 } as const;
		const options = wideOptions(quarter);
		const whole = options.find((o) => o.id === 'whole_belly')!;
		const wide = widen(quarter, whole);
		expect(wide.place).toEqual({ region: 'belly', side: 'midline', u: 0.5, v: 0.5 });
		expect(wide.origin).toEqual(quarter);
		expect(isPlace('belly', 'midline', '2d-front-v1')).toBe(true);
		// Switching between wider areas keeps the remembered quarter.
		const upper = options.find((o) => o.id === 'upper_belly')!;
		const next = widen({ ...wide.place }, upper, wide.origin);
		expect(next.place).toMatchObject({ region: 'upper_belly', side: 'midline' });
		expect(next.origin).toEqual(quarter);
		expect(activeWide(next.place, wideOptions(next.place, next.origin))).toBe('upper_belly');
		// "This quarter" restores the original position.
		const home = wideOptions(next.place, next.origin).find((o) => o.id === 'this')!;
		expect(widen(next.place, home, next.origin)).toEqual({ place: quarter, origin: undefined });
		expect(activeWide(quarter, options)).toBe('this');
		// Back.
		const part = { region: 'lower_back', side: 'midline', u: 0.2, v: 0.4 } as const;
		const whole2 = wideOptions(part).find((o) => o.id === 'whole_back')!;
		expect(widen(part, whole2).place).toEqual({ region: 'back', side: 'midline', u: 0.5, v: 0.5 });
	});
});

describe('Find, close-ups and wider areas', () => {
	it('lists the wider areas', () => {
		expect(findRegions('whole belly', 'en').map((c) => c.name)).toEqual(['Whole belly']);
		expect(findRegions('upper belly', 'en').map((c) => c.name)).toEqual([
			'Your right upper belly',
			'Your left upper belly',
			'Upper belly'
		]);
		expect(findRegions('lower belly', 'en').map((c) => c.name)).toContain('Lower belly');
		expect(findRegions('whole back', 'en')[0]!.place).toEqual({
			region: 'back',
			side: 'midline',
			space: '2d-back-v1',
			u: 0.5,
			v: 0.5
		});
		expect(findRegions('hele maven', 'da').map((c) => c.name)).toEqual(['Hele maven']);
		expect(findRegions('hele ryggen', 'da').map((c) => c.name)).toEqual(['Hele ryggen']);
	});

	it('lists the close-up regions with their close-up space', () => {
		expect(findRegions('thumb', 'en').map((c) => c.name)).toEqual(['Your right thumb', 'Your left thumb']);
		expect(findRegions('thumb', 'en')[0]!.place).toEqual({
			region: 'thumb',
			side: 'right',
			space: '2d-hand-v1',
			u: 0.5,
			v: 0.5
		});
		expect(findRegions('tommel', 'da').map((c) => c.name)).toEqual([
			'Din højre tommelfinger',
			'Din venstre tommelfinger'
		]);
		expect(findRegions('temple', 'en')[0]!.place.space).toBe('2d-head-front-v2');
		expect(findRegions('sole', 'en')[0]!.place.space).toBe('2d-foot-v1');
		expect(findRegions('nose', 'en')).toEqual([]); // no nose, mouth, chin or ear zones any more
		// The heel is on the back view and the sole close-up: listed once.
		expect(findRegions('heel', 'en').filter((c) => c.name === 'Your right heel')).toHaveLength(1);
		for (const c of allChoices('en')) expect(isPlace(c.place.region, c.place.side, c.place.space)).toBe(true);
	});
});

describe('head zones', () => {
	const FRONT_ZONES = ['forehead', 'temple', 'around_eye', 'behind_eye', 'cheek', 'jaw'] as const;
	const front = () => zoomScene({ zoom: 'head', face: 'front' });
	const back = () => zoomScene({ zoom: 'head', face: 'back' });
	const inside = (poly: readonly (readonly [number, number])[], x: number, y: number) => {
		let hit = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const [xi, yi] = poly[i]!;
			const [xj, yj] = poly[j]!;
			if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
		}
		return hit;
	};

	it('has the two head drawings, each in its own versioned space', () => {
		expect(spaceOf('head')).toBe('2d-head-front-v2');
		expect(spaceOf('head_back')).toBe('2d-head-back-v2');
		expect(front().space).toBe('2d-head-front-v2');
		expect(back().space).toBe('2d-head-back-v2');
		expect(viewIdOf('2d-head-back-v2')).toBe('head_back');
	});

	it('lists the front zones on both sides, the back zones, and no nose, mouth, chin or ear zones', () => {
		for (const id of [...FRONT_ZONES, 'rear_head', 'rear_neck'] as const) {
			expect(regionDef(id)?.paired, id).toBe(true);
			expect(regionDef(id)?.parent, id).toBe('head');
		}
		expect(regionDef('top_of_head')?.paired).toBe(false); // one zone, no sides
		for (const id of FRONT_ZONES) expect(regionDef(id)?.views).toEqual(['head']);
		for (const id of ['top_of_head', 'rear_head', 'rear_neck'])
			expect(regionDef(id)?.views).toEqual(['head_back']);
		for (const gone of ['nose', 'mouth', 'chin', 'ear', 'eye']) expect(isRegionId(gone), gone).toBe(false);
		expect(sidesOf('top_of_head')).toEqual(['midline']);
		// The main-view head and back of head stay as they were.
		expect(regionDef('head')?.views).toEqual(['front']);
		expect(regionDef('back_of_head')?.views).toEqual(['back']);
	});

	it('names every zone and wider area in English and Danish', () => {
		expect(regionName('en', 'behind_eye', 'right')).toBe('Behind your right eye');
		expect(regionName('da', 'behind_eye', 'right')).toBe('Bag dit højre øje');
		expect(regionName('en', 'head_side', 'right')).toBe('Right side of your head');
		expect(regionName('da', 'head_side', 'right')).toBe('Højre side af hovedet');
		expect(regionName('en', 'head_front_side', 'right')).toBe('Front of the right side');
		expect(regionName('da', 'head_front_side', 'right')).toBe('Forreste del af højre side');
		expect(regionName('en', 'head_band', 'midline')).toBe('Band around the head');
		expect(regionName('da', 'head_band', 'midline')).toBe('Bånd rundt om hovedet');
		expect(regionName('en', 'whole_head', 'midline')).toBe('Whole head');
		expect(regionName('da', 'whole_head', 'midline')).toBe('Hele hovedet');
		for (const key of Object.keys(en).filter((k) =>
			/^bodymap\.(region\.(head|whole|top|rear)|wide\.head)/.test(k)
		))
			expect(da, key).toHaveProperty([key]);
	});

	it('gives every zone a soft outline, with the mirror image on the other side', () => {
		for (const scene of [front(), back()]) {
			for (const s of scene.shapes) {
				expect(s.d, s.key).toMatch(/^M.*Z$/);
				expect(s.poly!.length, s.key).toBeGreaterThanOrEqual(4);
				expect(s.x, s.key).toBeGreaterThanOrEqual(0);
				expect(s.x + s.w, s.key).toBeLessThanOrEqual(scene.viewBox.w);
				expect(s.y + s.h, s.key).toBeLessThanOrEqual(scene.viewBox.h);
			}
			for (const s of scene.shapes.filter((s) => s.side === 'right')) {
				const other = sceneShape(scene, s.region, 'left')!;
				expect(s.x + s.w / 2 + (other.x + other.w / 2)).toBeCloseTo(200, 6);
				expect(s.w).toBeCloseTo(other.w, 6);
			}
		}
		// Right is on the screen's left in the front drawing, and not in the back drawing.
		expect(sceneShape(front(), 'temple', 'right')!.x).toBeLessThan(100);
		expect(sceneShape(back(), 'rear_neck', 'right')!.x).toBeGreaterThan(100);
		expect(sceneShape(back(), 'top_of_head', 'midline')).toBeDefined();
	});

	it('draws a tappable shape for every zone, and the centre (keyboard and Find) is inside it', () => {
		for (const [scene, ids] of [
			[front(), FRONT_ZONES],
			[back(), ['top_of_head', 'rear_head', 'rear_neck'] as const]
		] as const)
			for (const id of ids)
				for (const side of sidesOf(id as RegionId)) {
					const s = scene.shapes.find((x) => x.region === id && x.side === side);
					expect(s, `${id}/${side}`).toBeDefined();
					const c = toView(s!, 0.5, 0.5);
					expect(inside(s!.poly!, c.x, c.y), `${id}/${side}`).toBe(true);
				}
		// Wider areas are never tappable shapes.
		for (const id of ['head_side', 'whole_head', 'head_band', 'head_front_side'])
			expect(front().shapes.some((s) => s.region === id)).toBe(false);
	});

	it('leaves a gap between neighbouring zones, and puts the behind-the-eye zone inside the eye area', () => {
		const around = sceneShape(front(), 'around_eye', 'right')!;
		const behind = sceneShape(front(), 'behind_eye', 'right')!;
		expect(behind.x).toBeGreaterThan(around.x);
		expect(behind.x + behind.w).toBeLessThan(around.x + around.w);
		expect(behind.y).toBeGreaterThan(around.y);
		expect(behind.y + behind.h).toBeLessThan(around.y + around.h);
		const right = sceneShape(front(), 'forehead', 'right')!;
		const left = sceneShape(front(), 'forehead', 'left')!;
		expect(left.x - (right.x + right.w)).toBeGreaterThanOrEqual(2);
	});

	it('draws faint features on the front only: brows, closed eyes, a nose line and a straight mouth', () => {
		const features = front().decor.filter((d) => d.kind === 'feature');
		expect(features).toHaveLength(4);
		// The mouth is one straight horizontal line (no curve, so no smile).
		expect(features.some((f) => /^M\d+ \d+h\d+$/.test(f.d))).toBe(true);
		expect(back().decor.some((d) => d.kind === 'feature')).toBe(false);
	});

	it('draws each wider area as a highlight over the zones it covers', () => {
		const covered = (face: 'front' | 'back', region: string, side: 'left' | 'right' | 'midline') =>
			(sceneShape(zoomScene({ zoom: 'head', face }), region, side)!.cover ?? []).map((c) => c.key);
		expect(covered('front', 'head_front_side', 'right').sort()).toEqual(
			['around_eye:right', 'behind_eye:right', 'forehead:right', 'temple:right'].sort()
		);
		expect(covered('front', 'head_side', 'right')).toHaveLength(6);
		expect(covered('front', 'whole_head', 'midline')).toHaveLength(12);
		expect(covered('back', 'head_back_side', 'left').sort()).toEqual(['rear_head:left', 'rear_neck:left']);
		// "This side" on the back also takes the near half of the top of the head.
		expect(covered('back', 'head_side', 'left')).toContain('top_of_head:left');
		expect(covered('back', 'whole_head', 'midline')).toContain('top_of_head');
		// The band is one midline area on both drawings.
		for (const face of ['front', 'back'] as const) {
			const band = sceneShape(zoomScene({ zoom: 'head', face }), 'head_band', 'midline')!;
			expect(band.cover).toHaveLength(1);
			expect(toView(band, 0.5, 0.5).x).toBeCloseTo(100, 6);
		}
		// A sided wider area exists on both sides, a front-only one only on the front.
		expect(sceneShape(back(), 'head_front_side', 'right')).toBeUndefined();
		expect(sceneShape(front(), 'head_back_side', 'right')).toBeUndefined();
	});

	const labels = (at: Parameters<typeof wideOptions>[0], origin?: Parameters<typeof wideOptions>[1]) =>
		wideOptions(at, origin).map((o) => translate('en', o.key));

	it('offers the wider choices after tapping a zone', () => {
		const space = '2d-head-front-v2';
		const backSpace = '2d-head-back-v2';
		expect(labels({ region: 'temple', side: 'right', space })).toEqual([
			'This spot',
			'Front of this side',
			'This side',
			'Whole head',
			'Band around the head'
		]);
		expect(labels({ region: 'rear_head', side: 'left', space: backSpace })).toEqual([
			'This spot',
			'Back of this side',
			'This side',
			'Whole head',
			'Band around the head'
		]);
		// The top of the head has no side.
		expect(labels({ region: 'top_of_head', side: 'midline', space: backSpace })).toEqual([
			'This spot',
			'Whole head',
			'Band around the head'
		]);
		expect(translate('da', 'bodymap.wide.head_side')).toBe('Denne side');
		expect(translate('da', 'bodymap.wide.head_band')).toBe('Bånd rundt om hovedet');
		// Other regions are not offered head areas.
		expect(wideOptions({ region: 'head', side: 'midline' })).toEqual([]);
		expect(wideOptions({ region: 'neck', side: 'midline' })).toEqual([]);
	});

	it('widens to the centre of the area, keeps the way back, and "This spot" restores the tap', () => {
		const space = '2d-head-front-v2';
		const tap = { region: 'temple', side: 'right', u: 0.3, v: 0.7 } as const;
		const options = wideOptions({ ...tap, space });
		const side = options.find((o) => o.id === 'head_side')!;
		expect(side).toMatchObject({ region: 'head_side', side: 'right' });
		const wide = widen(tap, side);
		expect(wide.place).toEqual({ region: 'head_side', side: 'right', u: 0.5, v: 0.5 });
		expect(wide.origin).toEqual(tap);
		expect(isPlace('head_side', 'right', space)).toBe(true);
		expect(isPlace('head_side', 'right', '2d-head-back-v2')).toBe(true);
		expect(isPlace('head_front_side', 'right', '2d-head-back-v2')).toBe(false);
		expect(isPlace('head_side', 'midline', space)).toBe(false);
		expect(isPlace('whole_head', 'midline', space)).toBe(true);
		// The options after widening keep "This spot" and mark the area chosen.
		const after = wideOptions({ ...wide.place, space }, wide.origin);
		expect(after.map((o) => o.id)).toEqual([
			'this',
			'head_front_side',
			'head_side',
			'whole_head',
			'head_band'
		]);
		expect(activeWide(wide.place, after)).toBe('head_side');
		expect(activeWide(tap, options)).toBe('this');
		// Switching to the whole head keeps the remembered zone; "This spot" puts the tap back.
		const whole = widen(
			wide.place,
			after.find((o) => o.id === 'whole_head')!,
			wide.origin
		);
		expect(whole.place).toEqual({ region: 'whole_head', side: 'midline', u: 0.5, v: 0.5 });
		expect(whole.origin).toEqual(tap);
		const home = wideOptions({ ...whole.place, space }, whole.origin).find((o) => o.id === 'this')!;
		expect(widen(whole.place, home, whole.origin)).toEqual({ place: tap, origin: undefined });
		// A band picked from Find has no zone to go back to.
		expect(labels({ region: 'head_band', side: 'midline', space })).toEqual([
			'Whole head',
			'Band around the head'
		]);
	});

	it('lists the zones and wider areas in Find, in the head close-up', () => {
		expect(findRegions('temple', 'en').map((c) => c.name)).toEqual(['Your right temple', 'Your left temple']);
		expect(findRegions('temple', 'en')[0]!.place).toEqual({
			region: 'temple',
			side: 'right',
			space: '2d-head-front-v2',
			u: 0.5,
			v: 0.5
		});
		expect(findRegions('behind', 'en').map((c) => c.name)).toEqual([
			'Behind your right eye',
			'Behind your left eye'
		]);
		expect(findRegions('top of your head', 'en')[0]!.place.space).toBe('2d-head-back-v2');
		expect(findRegions('band', 'en')[0]!.place).toMatchObject({
			region: 'head_band',
			space: '2d-head-front-v2'
		});
		expect(findRegions('whole head', 'en').map((c) => c.name)).toEqual(['Whole head']);
		expect(findRegions('bag dit højre øje', 'da').map((c) => c.name)).toEqual(['Bag dit højre øje']);
		expect(findRegions('tinding', 'da')).toHaveLength(2);
		expect(findRegions('side af hovedet', 'da').map((c) => c.name)).toContain('Højre side af hovedet');
		for (const c of findRegions('', 'en'))
			expect(isPlace(c.place.region, c.place.side, c.place.space)).toBe(true);
	});

	it('chooses the head drawing for a place', () => {
		expect(
			zoomFor(
				{ region: 'behind_eye', side: 'left', space: '2d-head-front-v2' },
				{ zoom: 'head', face: 'back' }
			)
		).toEqual({ zoom: 'head', face: 'front' });
		expect(zoomFor({ region: 'top_of_head', side: 'midline', space: '2d-head-back-v2' }, null)).toEqual({
			zoom: 'head',
			face: 'back'
		});
	});
});
