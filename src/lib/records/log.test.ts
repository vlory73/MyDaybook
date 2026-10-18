import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import {
	againOptions,
	againPayload,
	lastMeasurement,
	lastUsedMeasureType,
	median,
	nightFor,
	parseNumber,
	sleepProblem,
	stepValue,
	usualNight
} from './log';
import { minutesBetween } from './time';
import { parsePayload, type MeasurementPayload, type Payload, type SleepPayload } from './types';

// Synthetic data only.
const sleep = (asleepAt: string, at: string): SleepPayload => ({ v: 1, type: 'sleep', asleepAt, at });
const rec = (id: string, payload: Payload): StoredRecord => ({ id, rev: 1, updatedAt: 1, payload });
const weight = (at: string, value: number): MeasurementPayload => ({
	v: 1,
	type: 'measurement',
	at,
	typeId: 'weight',
	values: [value],
	unit: 'kg',
	context: []
});

describe('usual night', () => {
	it('falls back to 23:00 to 07:00 without records', () => {
		expect(usualNight([])).toEqual({ asleep: '23:00', wake: '07:00' });
	});

	it('uses the median of the last 7 nights', () => {
		const nights = [
			sleep('2026-10-10T22:00:00+02:00', '2026-10-11T06:00:00+02:00'), // too old: ignored below
			sleep('2026-10-11T23:00:00+02:00', '2026-10-12T07:00:00+02:00'),
			sleep('2026-10-12T23:30:00+02:00', '2026-10-13T07:30:00+02:00'),
			sleep('2026-10-13T23:15:00+02:00', '2026-10-14T07:15:00+02:00'),
			sleep('2026-10-14T23:30:00+02:00', '2026-10-15T07:30:00+02:00'),
			sleep('2026-10-15T23:00:00+02:00', '2026-10-16T07:00:00+02:00'),
			sleep('2026-10-16T23:45:00+02:00', '2026-10-17T07:45:00+02:00'),
			sleep('2026-10-17T23:30:00+02:00', '2026-10-18T07:30:00+02:00')
		];
		expect(usualNight(nights)).toEqual({ asleep: '23:30', wake: '07:30' });
	});

	it('treats times either side of midnight as neighbours', () => {
		const nights = [
			sleep('2026-10-16T23:40:00+02:00', '2026-10-17T07:00:00+02:00'),
			sleep('2026-10-17T00:20:00+02:00', '2026-10-17T07:00:00+02:00'),
			sleep('2026-10-17T23:50:00+02:00', '2026-10-18T07:00:00+02:00')
		];
		expect(usualNight(nights).asleep).toBe('23:50');
	});

	it('builds the night that ended on a day, across midnight', () => {
		expect(nightFor('2026-10-18', '23:50', '07:10', 120)).toEqual({
			asleepAt: '2026-10-17T23:50:00+02:00',
			at: '2026-10-18T07:10:00+02:00'
		});
		// Falling asleep earlier on the clock than waking means the same day (an early-morning sleep).
		expect(nightFor('2026-10-18', '01:00', '07:00', 120)?.asleepAt).toBe('2026-10-18T01:00:00+02:00');
	});
});

describe('durations', () => {
	it('counts across midnight', () => {
		expect(minutesBetween('2026-10-17T23:50:00+02:00', '2026-10-18T07:10:00+02:00')).toBe(440);
	});
	it('counts across the autumn DST change (25 Oct 2026, 03:00 to 02:00)', () => {
		expect(minutesBetween('2026-10-24T23:00:00+02:00', '2026-10-25T07:00:00+01:00')).toBe(9 * 60);
	});
	it('counts across the spring DST change (29 Mar 2026, 02:00 to 03:00)', () => {
		expect(minutesBetween('2026-03-28T23:00:00+01:00', '2026-03-29T07:00:00+02:00')).toBe(7 * 60);
	});
});

describe('sleep validation', () => {
	const a = '2026-10-17T23:00:00+02:00';
	const b = '2026-10-18T07:00:00+02:00';
	it('accepts a normal night and rejects bad ranges', () => {
		expect(sleepProblem(a, b, [])).toBeNull();
		expect(sleepProblem(b, a, [])).toBe('range');
		expect(sleepProblem(a, a, [])).toBe('range');
		expect(sleepProblem(a, '2026-10-19T07:00:00+02:00', [])).toBe('range');
		expect(sleepProblem(null, b, [])).toBe('times');
	});
	it('checks naps', () => {
		const nap = { from: '2026-10-18T13:00:00+02:00', to: '2026-10-18T13:30:00+02:00' };
		expect(sleepProblem(a, b, [nap])).toBeNull();
		expect(sleepProblem(a, b, [{ from: nap.to, to: nap.from }])).toBe('nap');
		expect(sleepProblem(a, b, [{ from: nap.from, to: null }])).toBe('nap');
	});
});

describe('numbers', () => {
	it('steps by the type decimals without float noise', () => {
		expect(stepValue(72.3, 1, 1)).toBe(72.4);
		expect(stepValue(0.1 + 0.2, 1, 1)).toBe(0.4);
		expect(stepValue(72.4, -1, 1)).toBe(72.3);
		expect(stepValue(120, 1, 0)).toBe(121);
		expect(stepValue(1.01, 1, 2)).toBe(1.02);
		expect(stepValue(null, 1, 1)).toBe(0.1);
	});
	it('never steps below zero', () => {
		expect(stepValue(0, -1, 1)).toBe(0);
		expect(stepValue(0.05, -1, 1)).toBe(0);
	});
	it('parses plain numbers with a point or a comma', () => {
		expect(parseNumber('72.4')).toBe(72.4);
		expect(parseNumber(' 72,4 ')).toBe(72.4);
		expect(parseNumber('120')).toBe(120);
		for (const bad of ['', 'abc', '-3', '1e3', '7.', '.5', '1,2,3', '9999999']) {
			expect(parseNumber(bad), bad).toBeNull();
		}
	});
	it('takes the median of even and odd lists', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([1, 2, 3, 4])).toBe(3); // 2.5 rounds up to a whole minute
	});
});

describe('last values and Again?', () => {
	const records = [
		rec('a', weight('2026-10-14T07:25:00+02:00', 72.6)),
		rec('b', weight('2026-10-16T07:25:00+02:00', 72.4)),
		rec('c', sleep('2026-10-16T23:00:00+02:00', '2026-10-17T07:00:00+02:00'))
	];
	it('finds the newest measurement of a type', () => {
		expect(lastMeasurement(records, 'weight')?.values).toEqual([72.4]);
		expect(lastMeasurement(records, 'nope')).toBeUndefined();
	});
	it('opens the Measure tile on the last non-weight type, else weight', () => {
		expect(lastUsedMeasureType(records)).toBe('weight');
		const bp: MeasurementPayload = {
			...weight('2026-10-15T08:00:00+02:00', 120),
			typeId: 'bp-id',
			values: [120, 80],
			unit: 'mmHg'
		};
		expect(lastUsedMeasureType([...records, rec('d', bp)])).toBe('bp-id');
	});
	it('offers the usual night and the last weight, and nothing for a fresh diary', () => {
		const now = new Date(2026, 9, 18, 9, 0);
		expect(againOptions([], now)).toEqual([]);
		expect(againOptions(records, now)).toEqual([
			{ kind: 'sleep', asleep: '23:00', wake: '07:00' },
			{ kind: 'weight', value: 72.4, unit: 'kg' }
		]);
	});
	it('does not repeat what is already logged today', () => {
		const now = new Date(2026, 9, 18, 9, 0);
		const today = [
			...records,
			rec('e', sleep('2026-10-17T23:00:00+02:00', '2026-10-18T07:00:00+02:00')),
			rec('f', weight('2026-10-18T07:30:00+02:00', 72.2))
		];
		expect(againOptions(today, now)).toEqual([]);
	});
	it('builds valid payloads for each option', () => {
		const now = new Date(2026, 9, 18, 9, 0);
		for (const option of againOptions(records, now)) {
			const p = againPayload(option, now);
			expect(p && parsePayload(p)).not.toBeNull();
		}
	});
});

describe('payloads from the sheets', () => {
	it('accepts feelings with optional symptom severity and a two-value measurement', () => {
		const at = '2026-10-18T08:10:00+02:00';
		expect(
			parsePayload({
				v: 1,
				type: 'feeling',
				at,
				mood: 4,
				symptoms: [{ tag: 'Headache' }, { tag: 'Tired', severity: 2 }]
			})
		).not.toBeNull();
		expect(
			parsePayload({
				v: 1,
				type: 'measurement',
				at,
				typeId: 'x',
				values: [120, 80],
				unit: 'mmHg',
				context: ['morning']
			})
		).not.toBeNull();
		expect(parsePayload({ v: 1, type: 'bowel', at, bristol: 8, flags: [] })).toBeNull();
	});
});
