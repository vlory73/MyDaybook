import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '$lib/records/codec';
import type { PainPayload, PainPoint } from '$lib/records/pain';
import {
	FACES,
	mainScene,
	partsOf,
	zoomScene,
	type RegionId,
	type Side,
	type Space
} from '$lib/bodymap/catalogue';
import {
	bestFace,
	buckets,
	fitsNumber,
	heatKey,
	heatmap,
	rankPlaces,
	roundAvg,
	thumbDots,
	tokenFor,
	zoomOf
} from './heatmap';

// Synthetic data only.
let n = 0;
const pt = (region: RegionId, side: Side, space: Space, intensity: number | undefined): PainPoint =>
	({ region, side, space, u: 0.5, v: 0.5, intensity, qualities: [] }) as PainPoint;
const rec = (at: string, ...points: PainPoint[]): StoredRecord => ({
	id: `r${++n}`,
	rev: 1,
	updatedAt: 1,
	payload: { v: 1, type: 'pain', at, points } as PainPayload
});
const F = '2d-front-v1';
const B = '2d-back-v1';
const days = ['2026-10-20', '2026-10-21', '2026-10-22'];
const at = (d: number, h = 9) => `2026-10-${d}T${String(h).padStart(2, '0')}:00:00+02:00`;

describe('partsOf', () => {
	const keys = (r: RegionId, s: Side) =>
		partsOf(r, s)
			.map((p) => `${p.region}:${p.side}`)
			.sort();
	it('a narrow place is its own part', () => {
		expect(keys('knee', 'right')).toEqual(['knee:right']);
		expect(keys('upper_belly', 'left')).toEqual(['upper_belly:left']);
	});
	it('belly and back wider areas', () => {
		expect(keys('belly', 'midline')).toEqual([
			'lower_belly:left',
			'lower_belly:right',
			'upper_belly:left',
			'upper_belly:right'
		]);
		expect(keys('upper_belly', 'midline')).toEqual(['upper_belly:left', 'upper_belly:right']);
		expect(keys('back', 'midline')).toEqual(['lower_back:midline', 'mid_back:midline', 'upper_back:midline']);
	});
	it('whole arm and whole leg count towards each of their parts, on their own side', () => {
		expect(keys('whole_arm', 'left')).toEqual(['elbow:left', 'forearm:left', 'upper_arm:left', 'wrist:left']);
		expect(keys('whole_arm', 'right')).toEqual([
			'elbow:right',
			'forearm:right',
			'upper_arm:right',
			'wrist:right'
		]);
		expect(keys('whole_leg', 'right')).toEqual([
			'ankle:right',
			'back_of_thigh:right',
			'calf:right',
			'knee:right',
			'shin:right',
			'thigh:right'
		]);
		expect(keys('whole_leg', 'left')).toContain('calf:left');
	});
	it('head areas', () => {
		expect(keys('head_front_side', 'right')).toEqual([
			'around_eye:right',
			'behind_eye:right',
			'forehead:right',
			'temple:right'
		]);
		expect(keys('head_back_side', 'left')).toEqual(['rear_head:left', 'rear_neck:left']);
		const side = keys('head_side', 'right');
		expect(side).toContain('top_of_head:midline');
		expect(side).toContain('jaw:right');
		expect(side).toContain('rear_head:right');
		expect(side.some((k) => k.endsWith(':left'))).toBe(false);
		expect(keys('whole_head', 'midline')).toContain('cheek:left');
		expect(keys('whole_head', 'midline')).toContain('top_of_head:midline');
	});
	it('the band covers the zones it crosses, both sides, not cheeks, jaw or the top', () => {
		const band = keys('head_band', 'midline');
		for (const k of ['forehead', 'temple', 'around_eye', 'behind_eye', 'rear_head'])
			for (const s of ['left', 'right']) expect(band).toContain(`${k}:${s}`);
		for (const k of ['cheek', 'jaw', 'rear_neck', 'top_of_head'])
			expect(band.some((x) => x.startsWith(k))).toBe(false);
	});
});

describe('heatmap', () => {
	it('counts days, not entries or points', () => {
		const h = heatmap(
			[
				rec(at(20, 8), pt('knee', 'right', F, 4), pt('knee', 'right', F, 6)),
				rec(at(20, 18), pt('knee', 'right', F, 2)),
				rec(at(22), pt('knee', 'right', F, 8))
			],
			days
		);
		const knee = h.places.get(heatKey('knee', 'right'))!;
		expect(knee.days).toBe(2);
		expect(knee.avg).toBe(5); // (4 + 6 + 2 + 8) / 4: the mean of the points
		expect(h.maxDays).toBe(2);
		expect(h.daysWithPain).toBe(2);
	});
	it('ignores days outside the period', () => {
		const h = heatmap([rec(at(10), pt('knee', 'right', F, 4))], days);
		expect(h.places.size).toBe(0);
		expect(h.daysWithPain).toBe(0);
	});
	it('a wider area counts towards each part', () => {
		const h = heatmap(
			[rec(at(20), pt('back', 'midline', B, 6)), rec(at(21), pt('lower_back', 'midline', B, 2))],
			days
		);
		expect(h.places.get(heatKey('lower_back', 'midline'))).toMatchObject({ days: 2, avg: 4 });
		expect(h.places.get(heatKey('upper_back', 'midline'))).toMatchObject({ days: 1, avg: 6 });
		expect(h.places.has(heatKey('back', 'midline'))).toBe(false);
	});
	it('a close-up point counts for the whole head, hand or foot on the body', () => {
		const h = heatmap(
			[
				rec(at(20), pt('temple', 'right', '2d-head-front-v2', 6)),
				rec(
					at(21),
					pt('rear_head', 'left', '2d-head-back-v2', 4),
					pt('temple', 'right', '2d-head-front-v2', 2)
				),
				rec(at(22), pt('thumb', 'left', '2d-hand-v1', 5), pt('big_toe', 'right', '2d-foot-v1', 3))
			],
			days
		);
		expect(h.roll.get(heatKey('head', 'midline'))).toMatchObject({ days: 2, avg: 4 });
		expect(h.roll.get(heatKey('hand', 'left'))).toMatchObject({ days: 1, avg: 5 });
		expect(h.roll.get(heatKey('foot', 'right'))).toMatchObject({ days: 1, avg: 3 });
		expect(h.places.get(heatKey('temple', 'right'))!.days).toBe(2);
		expect(h.maxDays).toBe(2);
	});
	it('a point without an intensity counts for the day but not for the average', () => {
		const h = heatmap(
			[
				rec(at(20), pt('knee', 'left', F, undefined)),
				rec(at(21), pt('knee', 'left', F, 4)),
				rec(at(21, 12), pt('shin', 'left', F, undefined))
			],
			days
		);
		expect(h.places.get(heatKey('knee', 'left'))).toMatchObject({ days: 2, avg: 4 });
		expect(h.places.get(heatKey('shin', 'left'))).toMatchObject({ days: 1, avg: null });
		expect(roundAvg(null)).toBeNull();
		expect(roundAvg(4.5)).toBe(5);
	});
	it('zoomOf and bestFace', () => {
		expect(zoomOf('temple')).toBe('head');
		expect(zoomOf('palm')).toBe('hand');
		expect(zoomOf('heel')).toBe('foot');
		expect(zoomOf('knee')).toBeNull();
		const h = heatmap(
			[
				rec(at(20), pt('back_of_hand', 'right', '2d-hand-v1', 3)),
				rec(at(21), pt('palm', 'left', '2d-hand-v1', 3))
			],
			days
		);
		expect(bestFace(h, 'hand', 'right')).toBe(FACES.hand[1]);
		expect(bestFace(h, 'hand', 'left')).toBe(FACES.hand[0]);
		expect(bestFace(h, 'foot', 'left')).toBe(FACES.foot[0]);
	});
});

describe('buckets', () => {
	const shape = (max: number) => buckets(max).map((b) => [b.from, b.to]);
	it('is the 1 · 2-3 · 4-6 · 7-9 · 10+ ladder for 11 days', () => {
		expect(shape(11)).toEqual([
			[1, 1],
			[2, 3],
			[4, 6],
			[7, 9],
			[10, null]
		]);
		expect(buckets(11).map((b) => b.token)).toEqual([1, 2, 3, 4, 5]);
		expect(shape(10)).toEqual(shape(11));
	});
	it('drops steps that start above the maximum', () => {
		expect(shape(0)).toEqual([]);
		expect(shape(1)).toEqual([[1, null]]);
		expect(shape(2)).toEqual([
			[1, 1],
			[2, null]
		]);
		expect(shape(3)).toEqual([
			[1, 1],
			[2, null]
		]);
		expect(shape(5)).toEqual([
			[1, 1],
			[2, 3],
			[4, null]
		]);
		expect(shape(7).length).toBe(4);
	});
	it('spreads the colours when there are fewer steps', () => {
		expect(buckets(1).map((b) => b.token)).toEqual([3]);
		expect(buckets(2).map((b) => b.token)).toEqual([1, 5]);
		expect(buckets(5).map((b) => b.token)).toEqual([1, 3, 5]);
		expect(buckets(8).map((b) => b.token)).toEqual([1, 2, 4, 5]);
	});
	it('scales the steps for a long period and keeps them rising', () => {
		const long = buckets(40);
		expect(long).toHaveLength(5);
		expect(long[0]!.from).toBe(1);
		expect(long[4]!.from).toBe(36);
		const froms = long.map((b) => b.from);
		expect(froms).toEqual([...froms].sort((a, b) => a - b));
		expect(new Set(froms).size).toBe(5);
	});
	it('gives each day count one token, 0 for not logged', () => {
		const steps = buckets(11);
		expect([0, 1, 2, 3, 4, 6, 7, 9, 10, 11].map((d) => tokenFor(d, steps))).toEqual([
			0, 1, 2, 2, 3, 3, 4, 4, 5, 5
		]);
		expect(tokenFor(1, buckets(1))).toBe(3);
	});
});

describe('list and numbers', () => {
	it('orders by days, then average, then name, and skips unlogged places', () => {
		const heats = [
			{ region: 'knee', side: 'left', days: 3, avg: 4 },
			{ region: 'shin', side: 'left', days: 5, avg: 2 },
			{ region: 'ankle', side: 'left', days: 3, avg: 6 },
			{ region: 'calf', side: 'left', days: 3, avg: 4 },
			{ region: 'thigh', side: 'left', days: 3, avg: null },
			{ region: 'foot', side: 'left', days: 0, avg: null }
		] as const;
		const out = rankPlaces(heats, (h) => h.region).map((h) => h.region);
		expect(out).toEqual(['shin', 'ankle', 'calf', 'knee', 'thigh']);
	});
	it('puts numbers only on shapes big enough', () => {
		const shapes = mainScene('front').shapes;
		const by = (r: string) => shapes.find((s) => s.region === r)!;
		expect(fitsNumber(by('head'))).toBe(true);
		expect(fitsNumber(by('chest'))).toBe(true);
		expect(fitsNumber(by('neck'))).toBe(true);
		expect(fitsNumber(by('wrist'))).toBe(false); // 15 wide
		expect(zoomScene({ zoom: 'head', face: 'front' }).shapes.some((s) => fitsNumber(s))).toBe(true);
	});
});

describe('thumbDots', () => {
	it('splits points by view and puts close-up points on the head, hand or foot', () => {
		const d = thumbDots([
			pt('knee', 'right', F, 3),
			pt('lower_back', 'midline', B, 3),
			pt('temple', 'right', '2d-head-front-v2', 3),
			pt('rear_head', 'left', '2d-head-back-v2', 3),
			pt('thumb', 'left', '2d-hand-v1', 3)
		]);
		expect(d.front).toHaveLength(3);
		expect(d.back).toHaveLength(2);
	});
	it('puts a wider area at its centre and drops duplicates', () => {
		const d = thumbDots([
			pt('belly', 'midline', F, 3),
			pt('temple', 'left', '2d-head-front-v2', 1),
			pt('jaw', 'right', '2d-head-front-v2', 2)
		]);
		expect(d.front).toHaveLength(2);
		expect(d.back).toHaveLength(0);
	});
});
