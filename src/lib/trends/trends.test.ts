import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '$lib/records/codec';
import type { PainPayload, PainPoint } from '$lib/records/pain';
import type { Payload } from '$lib/records/types';
import { mealsWithItem } from './afterMeals';
import { bandPath, linePath, runs, spread, tickIndices } from './paths';
import { customRange, dayRange, lastDays, parsePeriod } from './range';
import {
	bowelDots,
	doseSeries,
	feelingSeries,
	fluidSeries,
	gutSeries,
	measurementSeries,
	measurementTypesWithData,
	painSeries,
	sleepSeries
} from './series';

// Synthetic data only.
let n = 0;
const rec = (payload: Payload): StoredRecord => ({ id: `r${++n}`, rev: 1, updatedAt: 1, payload });
const point = (intensity: number): PainPoint => ({
	region: 'knee',
	side: 'right',
	space: '2d-front-v1',
	u: 0.5,
	v: 0.5,
	intensity,
	qualities: []
});
const pain = (at: string, ...intensities: number[]) =>
	rec({ v: 1, type: 'pain', at, points: intensities.map(point) } as PainPayload);

const days = lastDays(7, '2026-10-22'); // 16 to 22 Oct

describe('range', () => {
	it('builds the last n days, oldest first', () => {
		expect(days).toHaveLength(7);
		expect(days[0]).toBe('2026-10-16');
		expect(days[6]).toBe('2026-10-22');
		expect(lastDays(30, '2026-10-22')).toHaveLength(30);
		expect(lastDays(90, '2026-10-22')).toHaveLength(90);
	});
	it('does not drop or repeat a day across the autumn and spring clock changes', () => {
		const autumn = dayRange('2026-10-20', '2026-11-02'); // Danish clocks go back on 25 Oct
		expect(autumn).toHaveLength(14);
		expect(new Set(autumn).size).toBe(14);
		expect(dayRange('2026-03-25', '2026-04-01')).toHaveLength(8); // and forward on 29 Mar
		expect(lastDays(90, '2026-11-15')[0]).toBe('2026-08-18');
	});
	it('validates custom ranges', () => {
		expect(customRange('2026-10-01', '2026-10-03')).toEqual({
			ok: true,
			days: ['2026-10-01', '2026-10-02', '2026-10-03']
		});
		expect(customRange('2026-10-03', '2026-10-01')).toEqual({ ok: false, problem: 'order' });
		expect(customRange('', '2026-10-01')).toEqual({ ok: false, problem: 'invalid' });
		expect(customRange('2026-02-30', '2026-03-01')).toEqual({ ok: false, problem: 'invalid' });
		expect(customRange('2026-01-01', '2027-01-01').ok).toBe(true); // 366 days
		expect(customRange('2026-01-01', '2027-01-02')).toEqual({ ok: false, problem: 'long' }); // 367 days
	});
	it('reads a remembered period and falls back to 30', () => {
		expect(parsePeriod('7')).toBe(7);
		expect(parsePeriod('90')).toBe(90);
		expect(parsePeriod('12')).toBe(30);
		expect(parsePeriod(null)).toBe(30);
	});
});

describe('paths', () => {
	it('splits runs at gaps', () => {
		expect(runs([1, 2, null, 3, null, null, 4, 5])).toEqual([
			{ start: 0, items: [1, 2] },
			{ start: 3, items: [3] },
			{ start: 6, items: [4, 5] }
		]);
		expect(runs([null, null])).toEqual([]);
	});
	it('writes line and band paths', () => {
		expect(linePath([{ x: 0, y: 1 }])).toBe('');
		expect(
			linePath([
				{ x: 0, y: 1 },
				{ x: 2, y: 3 }
			])
		).toBe('M0 1 L2 3');
		expect(
			bandPath(
				[
					{ x: 0, y: 1 },
					{ x: 2, y: 1 }
				],
				[
					{ x: 0, y: 4 },
					{ x: 2, y: 4 }
				]
			)
		).toBe('M0 1 L2 1 L2 4 L0 4 Z');
	});
	it('picks a few evenly spread ticks including both ends', () => {
		expect(tickIndices(7, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(tickIndices(30, 4)).toEqual([0, 10, 19, 29]);
		expect(tickIndices(1, 4)).toEqual([0]);
		expect(tickIndices(0, 4)).toEqual([]);
	});
});

describe('label spreading', () => {
	it('leaves distant labels alone and separates close ones', () => {
		expect(spread([10, 50], 13)).toEqual([10, 50]);
		const out = spread([40, 40, 41], 13);
		expect(Math.min(out[1]! - out[0]!, out[2]! - out[1]!)).toBeGreaterThanOrEqual(13 - 1e-9);
		expect(out.reduce((a, b) => a + b, 0) / 3).toBeCloseTo(40.333, 2);
	});
});

describe('feeling', () => {
	it('averages the day and leaves gaps', () => {
		const s = feelingSeries(
			[
				rec({ v: 1, type: 'feeling', at: '2026-10-20T08:00:00+02:00', mood: 4, symptoms: [] }),
				rec({ v: 1, type: 'feeling', at: '2026-10-20T20:00:00+02:00', mood: 2, energy: 5, symptoms: [] }),
				rec({ v: 1, type: 'feeling', at: '2026-10-01T20:00:00+02:00', mood: 1, symptoms: [] })
			],
			days
		);
		expect(s.mood[4]).toBe(3);
		expect(s.energy[4]).toBe(5);
		expect(s.stress[4]).toBeNull();
		expect(s.mood[0]).toBeNull();
		expect(s.mood.filter((x) => x !== null)).toHaveLength(1);
	});
});

describe('sleep', () => {
	const night = (at: string, asleepAt: string, quality?: number) =>
		rec({ v: 1, type: 'sleep', at, asleepAt, ...(quality ? { quality } : {}) });
	it('puts a night on the wake-up day and counts qualities', () => {
		const s = sleepSeries(
			[
				night('2026-10-21T07:00:00+02:00', '2026-10-20T23:00:00+02:00', 4), // 8 h, wakes on 21st
				night('2026-10-22T06:30:00+02:00', '2026-10-21T23:30:00+02:00', 4), // 7 h
				night('2026-10-19T07:00:00+02:00', '2026-10-18T23:00:00+02:00') // 8 h, no quality
			],
			days
		);
		expect(s.minutes[5]).toBe(480);
		expect(s.minutes[6]).toBe(420);
		expect(s.minutes[3]).toBe(480);
		expect(s.minutes[4]).toBeNull();
		expect(s.quality[5]).toBe(4);
		expect(s.quality[3]).toBeNull();
		expect(s.qualityCounts).toEqual([0, 0, 0, 2, 0]);
		expect(s.averageMinutes).toBeCloseTo((480 + 420 + 480) / 3);
	});
	it('adds several sleeps on one day and takes the quality of the longest rated one', () => {
		const s = sleepSeries(
			[
				night('2026-10-22T07:00:00+02:00', '2026-10-21T23:00:00+02:00', 2),
				night('2026-10-22T15:00:00+02:00', '2026-10-22T14:00:00+02:00', 5)
			],
			days
		);
		expect(s.minutes[6]).toBe(540);
		expect(s.quality[6]).toBe(2);
	});
	it('has no average without nights', () => {
		expect(sleepSeries([], days).averageMinutes).toBeNull();
	});
});

describe('measurements', () => {
	const m = (typeId: string, at: string, values: number[], unit = 'kg') =>
		rec({ v: 1, type: 'measurement', at, typeId, values, unit, context: [] });
	it('takes the last value of the day and the first number of several', () => {
		const s = measurementSeries(
			[
				m('weight', '2026-10-22T07:00:00+02:00', [72.4]),
				m('weight', '2026-10-22T21:00:00+02:00', [72.9]),
				m('bp', '2026-10-22T21:00:00+02:00', [120, 80], 'mmHg')
			],
			days,
			'weight'
		);
		expect(s.values[6]).toBe(72.9);
		expect(s.unit).toBe('kg');
	});
	it('follows the upper and the lower blood pressure value as two lines', () => {
		const recs = [
			m('blood_pressure', '2026-10-21T08:00:00+02:00', [128, 82], 'mmHg'),
			m('blood_pressure', '2026-10-22T08:00:00+02:00', [126, 80], 'mmHg'),
			m('pulse', '2026-10-22T08:00:00+02:00', [64], 'bpm')
		];
		const up = measurementSeries(recs, days, 'blood_pressure', 0);
		const low = measurementSeries(recs, days, 'blood_pressure', 1);
		expect(up.values.slice(-2)).toEqual([128, 126]);
		expect(low.values.slice(-2)).toEqual([82, 80]);
		expect(up.unit).toBe('mmHg');
		expect(measurementSeries(recs, days, 'pulse').values[6]).toBe(64);
	});
	it('lists own types that have data in the period', () => {
		const used = rec({
			v: 1,
			type: 'measurement_type',
			name: 'Blood pressure',
			unit: 'mmHg',
			valueCount: 2,
			decimals: 0
		});
		const unused = rec({
			v: 1,
			type: 'measurement_type',
			name: 'Unused',
			unit: 'x',
			valueCount: 1,
			decimals: 0
		});
		const old = rec({ v: 1, type: 'measurement_type', name: 'Old', unit: 'x', valueCount: 1, decimals: 0 });
		const withData = measurementTypesWithData(
			[
				used,
				unused,
				old,
				m(used.id, '2026-10-22T21:00:00+02:00', [120, 80], 'mmHg'),
				m(old.id, '2026-01-02T21:00:00+02:00', [1], 'x')
			],
			days
		);
		expect(withData).toEqual([{ id: used.id, name: 'Blood pressure', unit: 'mmHg' }]);
	});
});

describe('fluids', () => {
	it('adds the day and averages only days with drinks', () => {
		const drink = (at: string, totalMl: number) =>
			rec({
				v: 1,
				type: 'drink',
				at,
				drink: 'def:water',
				size: 'def:glass',
				sizeMl: totalMl,
				count: 1,
				totalMl
			});
		const s = fluidSeries(
			[
				drink('2026-10-22T08:00:00+02:00', 200),
				drink('2026-10-22T12:00:00+02:00', 300),
				drink('2026-10-20T12:00:00+02:00', 700)
			],
			days
		);
		expect(s.totalMl[6]).toBe(500);
		expect(s.totalMl[4]).toBe(700);
		expect(s.totalMl[5]).toBeNull();
		expect(s.averageMl).toBe(600);
	});
});

describe('doses', () => {
	const dose = (status: 'taken' | 'late' | 'skipped', at: string, slotDate?: string) =>
		rec({
			v: 1,
			type: 'dose',
			medicationId: 'm1',
			status,
			at,
			...(slotDate ? { slot: { date: slotDate, time: '08:00' } } : {})
		});
	it('counts per day by slot day, and as-needed doses by the day logged', () => {
		const s = doseSeries(
			[
				dose('taken', '2026-10-22T08:05:00+02:00', '2026-10-22'),
				dose('late', '2026-10-22T10:00:00+02:00', '2026-10-22'),
				dose('skipped', '2026-10-22T09:00:00+02:00', '2026-10-21'),
				dose('taken', '2026-10-21T00:10:00+02:00', '2026-10-20'),
				dose('taken', '2026-10-19T13:00:00+02:00')
			],
			days
		);
		expect(s.days[6]).toEqual({ taken: 1, late: 1, skipped: 0 });
		expect(s.days[5]).toEqual({ taken: 0, late: 0, skipped: 1 });
		expect(s.days[4]).toEqual({ taken: 1, late: 0, skipped: 0 });
		expect(s.days[3]).toEqual({ taken: 1, late: 0, skipped: 0 });
		expect(s.totals).toEqual({ taken: 3, late: 1, skipped: 1 });
		expect(s.any).toBe(true);
		expect(doseSeries([], days).any).toBe(false);
	});
});

describe('bowel and gut', () => {
	it('places bowel dots inside their day', () => {
		const dots = bowelDots(
			[
				rec({ v: 1, type: 'bowel', at: '2026-10-22T12:00:00+02:00', bristol: 6, flags: [] }),
				rec({ v: 1, type: 'bowel', at: '2026-10-16T00:00:00+02:00', bristol: 4, flags: [] }),
				rec({ v: 1, type: 'bowel', at: '2026-10-01T12:00:00+02:00', bristol: 2, flags: [] })
			],
			days
		);
		expect(dots).toEqual([
			{ dayIndex: 0, frac: 0, type: 4 },
			{ dayIndex: 6, frac: 0.5, type: 6 }
		]);
	});
	it('keeps the strongest of the day per kind', () => {
		const g = (at: string, symptoms: { kind: 'nausea' | 'heartburn'; intensity: number }[]) =>
			rec({ v: 1, type: 'gut', at, symptoms, flags: [] });
		const s = gutSeries(
			[
				g('2026-10-22T08:00:00+02:00', [{ kind: 'nausea', intensity: 2 }]),
				g('2026-10-22T18:00:00+02:00', [
					{ kind: 'nausea', intensity: 4 },
					{ kind: 'heartburn', intensity: 1 }
				]),
				g('2026-10-20T18:00:00+02:00', [{ kind: 'heartburn', intensity: 3 }])
			],
			days
		);
		expect(s.nausea[6]).toBe(4);
		expect(s.heartburn[6]).toBe(1);
		expect(s.heartburn[4]).toBe(3);
		expect(s.nausea[4]).toBeNull();
		expect(s.nauseaDays).toBe(1);
		expect(s.heartburnDays).toBe(2);
	});
});

describe('pain', () => {
	it('averages all points of the day and keeps the lowest and highest', () => {
		const s = painSeries(
			[pain('2026-10-22T08:00:00+02:00', 2, 6), pain('2026-10-22T20:00:00+02:00', 4)],
			days
		);
		expect(s.days[6]).toEqual({ avg: 4, min: 2, max: 6, points: 3 });
		expect(s.entries).toBe(2);
		expect(s.daysWithPain).toBe(1);
	});
	it('marks a single point as min = max and leaves days without entries empty (never zero)', () => {
		const s = painSeries(
			[
				pain('2026-10-20T08:00:00+02:00', 7),
				pain('2026-10-22T08:00:00+02:00', 0),
				pain('2026-10-01T08:00:00+02:00', 9)
			],
			days
		);
		expect(s.days[4]).toEqual({ avg: 7, min: 7, max: 7, points: 1 });
		expect(s.days[5]).toBeNull();
		expect(s.days[6]).toEqual({ avg: 0, min: 0, max: 0, points: 1 }); // a logged 0 is a value, not a gap
		expect(s.entries).toBe(2);
		expect(s.daysWithPain).toBe(2);
		expect(runs(s.days).map((r) => [r.start, r.items.length])).toEqual([
			[4, 1],
			[6, 1]
		]);
	});
});

describe('after meals', () => {
	const meal = (id: string, at: string, state: 'yes' | 'no' | 'unsure', item = 'gluten', text = 'Pasta') =>
		({
			id,
			rev: 1,
			updatedAt: 1,
			payload: { v: 1, type: 'food', at, meal: 'lunch', text, tags: [], exposures: [{ id: item, state }] }
		}) as StoredRecord;
	const gut = (id: string, at: string, intensity = 3) =>
		({
			id,
			rev: 1,
			updatedAt: 1,
			payload: { v: 1, type: 'gut', at, symptoms: [{ kind: 'nausea', intensity }], flags: [] }
		}) as StoredRecord;

	it('lists meals with the item, newest first, and skips "no" and other items', () => {
		const out = mealsWithItem(
			[
				meal('a', '2026-10-20T12:00:00+02:00', 'yes'),
				meal('b', '2026-10-22T12:00:00+02:00', 'unsure'),
				meal('c', '2026-10-21T12:00:00+02:00', 'no'),
				meal('d', '2026-10-21T13:00:00+02:00', 'yes', 'lactose'),
				meal('e', '2026-10-01T12:00:00+02:00', 'yes') // outside the period
			],
			'gluten',
			days,
			24
		);
		expect(out.map((m) => [m.id, m.state])).toEqual([
			['b', 'unsure'],
			['a', 'yes']
		]);
	});

	it('includes entries from the meal up to the window end, both ends included', () => {
		const all = [
			meal('m', '2026-10-22T08:00:00+02:00', 'yes'),
			gut('same', '2026-10-22T08:00:00+02:00'),
			gut('end6', '2026-10-22T14:00:00+02:00'),
			gut('late', '2026-10-22T14:01:00+02:00'),
			gut('before', '2026-10-22T07:59:00+02:00')
		];
		const six = mealsWithItem(all, 'gluten', days, 6)[0]!;
		expect(six.after.map((a) => a.id)).toEqual(['same', 'end6']);
		const day = mealsWithItem(all, 'gluten', days, 24)[0]!;
		expect(day.after.map((a) => a.id)).toEqual(['same', 'end6', 'late']);
	});

	it('looks across midnight and across a clock change using real elapsed time', () => {
		// 25 Oct 2026: clocks go back at 03:00 in Denmark, so 23:00 on the 24th to 23:00 on the 25th is 25 hours.
		const all = [meal('m', '2026-10-24T23:00:00+02:00', 'yes'), gut('x', '2026-10-25T23:00:00+01:00')];
		const wide = lastDays(7, '2026-10-26');
		expect(mealsWithItem(all, 'gluten', wide, 24)[0]!.after).toEqual([]);
		expect(mealsWithItem(all, 'gluten', wide, 48)[0]!.after.map((a) => a.id)).toEqual(['x']);
	});

	it('describes bowel, pain and symptom entries, and ignores feelings without symptoms', () => {
		const all = [
			meal('m', '2026-10-22T08:00:00+02:00', 'yes'),
			rec({ v: 1, type: 'bowel', at: '2026-10-22T11:00:00+02:00', bristol: 6, flags: [] }),
			pain('2026-10-22T12:00:00+02:00', 3, 8),
			rec({ v: 1, type: 'feeling', at: '2026-10-22T13:00:00+02:00', mood: 3, symptoms: [{ tag: 'Tired' }] }),
			rec({ v: 1, type: 'feeling', at: '2026-10-22T13:30:00+02:00', mood: 3, symptoms: [] })
		];
		const after = mealsWithItem(all, 'gluten', days, 24)[0]!.after;
		expect(after.map((a) => a.kind)).toEqual(['bowel', 'pain', 'feeling']);
		expect(after[1]).toMatchObject({ regions: 1, max: 8, minutes: 240 });
	});

	it('returns an empty list for a meal with nothing after it', () => {
		expect(
			mealsWithItem([meal('m', '2026-10-22T08:00:00+02:00', 'yes')], 'gluten', days, 6)[0]!.after
		).toEqual([]);
	});
});
