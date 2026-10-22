import { describe, expect, it } from 'vitest';
import {
	dailySeverity,
	hasHeadacheAnswers,
	headacheSides,
	isHeadacheDetails,
	isHeadacheEntry,
	isHeadPoint,
	nauseaLevel,
	nauseaZone,
	pulsatingOrConstant,
	zoneOf
} from './headache';
import type { PainPayload, PainPoint } from './pain';
import type { GutPayload } from './types';

// Synthetic data only.
const point = (region: string, side: string, intensity: number, qualities: string[] = []) =>
	({ region, side, space: '2d-head-v1', u: 0.5, v: 0.5, intensity, qualities }) as unknown as PainPoint;
const entry = (points: PainPoint[], headache?: object) =>
	({ v: 1, type: 'pain', at: '2026-10-18T08:00:00+02:00', points, headache }) as unknown as PainPayload;
const gut = (...symptoms: [string, number][]) =>
	({
		v: 1,
		type: 'gut',
		at: '2026-10-18T09:00:00+02:00',
		symptoms: symptoms.map(([kind, intensity]) => ({ kind, intensity })),
		flags: []
	}) as unknown as GutPayload;

describe('zones', () => {
	it('puts 1-3 in mild, 4-6 in moderate, 7-10 in severe and 0 nowhere', () => {
		expect([0, 1, 3, 4, 6, 7, 10].map(zoneOf)).toEqual([
			null,
			'mild',
			'mild',
			'moderate',
			'moderate',
			'severe',
			'severe'
		]);
		expect(zoneOf(NaN)).toBeNull();
	});
});

describe('head points and headache entries', () => {
	it('knows the head regions, close-up regions and back of head', () => {
		for (const region of ['head', 'back_of_head', 'temple', 'forehead', 'jaw'])
			expect(isHeadPoint({ region } as never)).toBe(true);
		for (const region of ['neck', 'knee', 'palm']) expect(isHeadPoint({ region } as never)).toBe(false);
	});
	it('is a headache entry with a head point or with details, even an empty object', () => {
		expect(isHeadacheEntry(entry([point('temple', 'right', 4)]))).toBe(true);
		expect(isHeadacheEntry(entry([point('knee', 'right', 4)]))).toBe(false);
		expect(isHeadacheEntry(entry([point('knee', 'right', 4)], {}))).toBe(true);
		expect(isHeadacheEntry(gut(['nausea', 2]))).toBe(false);
	});
});

describe('dailySeverity', () => {
	it('is null without head points or when the average rounds to 0', () => {
		expect(dailySeverity([])).toBeNull();
		expect(dailySeverity([entry([point('knee', 'left', 9)])])).toBeNull();
		expect(dailySeverity([entry([point('temple', 'left', 0)])])).toBeNull();
		// 1 / 3 = 0.33 rounds to 0.
		expect(
			dailySeverity([entry([point('temple', 'left', 0), point('eye', 'left', 0), point('ear', 'left', 1)])])
		).toBeNull();
	});
	it('averages head points only, across the whole day, and rounds before zoning', () => {
		// Knee is ignored. (2 + 3) / 2 = 2.5 rounds to 3: mild.
		expect(
			dailySeverity([
				entry([point('temple', 'left', 2), point('knee', 'left', 10)]),
				entry([point('head', 'midline', 3)])
			])
		).toBe('mild');
		// (3 + 4) / 2 = 3.5 rounds to 4: moderate.
		expect(dailySeverity([entry([point('temple', 'left', 3)]), entry([point('temple', 'right', 4)])])).toBe(
			'moderate'
		);
		// 20 / 3 = 6.67 rounds to 7: severe.
		expect(
			dailySeverity([entry([point('temple', 'left', 6), point('eye', 'left', 7), point('ear', 'left', 7)])])
		).toBe('severe');
		// 0.5 rounds to 1: mild.
		expect(dailySeverity([entry([point('temple', 'left', 0), point('eye', 'left', 1)])])).toBe('mild');
	});
});

describe('headacheSides', () => {
	it('reads right, left, both and none from the head points', () => {
		expect(headacheSides([])).toBe('none');
		expect(headacheSides([point('knee', 'left', 3)])).toBe('none');
		expect(headacheSides([point('temple', 'right', 3), point('knee', 'left', 3)])).toBe('right');
		expect(headacheSides([point('temple', 'left', 3), point('eye', 'left', 3)])).toBe('left');
		expect(headacheSides([point('temple', 'left', 3), point('eye', 'right', 3)])).toBe('both');
	});
	it('counts a midline point as both sides', () => {
		expect(headacheSides([point('forehead', 'midline', 3)])).toBe('both');
		expect(headacheSides([point('temple', 'right', 3), point('back_of_head', 'midline', 3)])).toBe('both');
	});
});

describe('pulsatingOrConstant', () => {
	it('reports the head qualities only', () => {
		expect(pulsatingOrConstant([])).toBeNull();
		expect(pulsatingOrConstant([point('temple', 'left', 3, ['dull'])])).toBeNull();
		expect(pulsatingOrConstant([point('temple', 'left', 3, ['throbbing'])])).toBe('pulsating');
		expect(pulsatingOrConstant([point('temple', 'left', 3, ['constant'])])).toBe('constant');
		expect(
			pulsatingOrConstant([point('temple', 'left', 3, ['throbbing']), point('eye', 'left', 3, ['constant'])])
		).toBe('both');
		expect(pulsatingOrConstant([point('knee', 'left', 3, ['throbbing'])])).toBeNull();
	});
});

describe('nausea conversion', () => {
	it('maps 1-2 mild, 3 moderate, 4-5 severe', () => {
		expect([1, 2, 3, 4, 5].map(nauseaZone)).toEqual(['mild', 'mild', 'moderate', 'severe', 'severe']);
	});
	it('takes the strongest nausea of the day, ignores heartburn, and says none otherwise', () => {
		expect(nauseaLevel([])).toBe('none');
		expect(nauseaLevel([gut(['heartburn', 5])])).toBe('none');
		expect(nauseaLevel([gut(['nausea', 2]), gut(['heartburn', 5], ['nausea', 3])])).toBe('moderate');
		expect(nauseaLevel([gut(['nausea', 1]), gut(['nausea', 5])])).toBe('severe');
	});
});

describe('details', () => {
	it('accepts a stop on the next day or in the same hour, and a headache that is still going', () => {
		const started = '2026-10-18T23:00:00+02:00';
		expect(isHeadacheDetails({ started, stopped: '2026-10-19T02:00:00+02:00' })).toBe(true);
		expect(isHeadacheDetails({ started, stopped: started })).toBe(true);
		expect(isHeadacheDetails({ started, stillGoing: true })).toBe(true);
		expect(hasHeadacheAnswers({})).toBe(false);
		expect(hasHeadacheAnswers({ light: false })).toBe(true);
	});
});
