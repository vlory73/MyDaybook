import { describe, expect, it } from 'vitest';
import { da } from '$lib/i18n/da';
import type { MessageKey } from '$lib/i18n/en';
import { translate } from '$lib/i18n/core';
import type { MedicationPayload } from '$lib/records/types';
import { daysBetween, isDueOn, scheduleSummary, slotsOn, weekdayOf } from './schedule';

// Synthetic data only.
const med = (over: Partial<MedicationPayload> = {}): MedicationPayload => ({
	v: 1,
	type: 'medication',
	name: 'Synthol',
	form: 'tablet',
	schedule: { kind: 'daily' },
	times: [{ time: '08:00', amount: '1 tablet' }],
	start: '2026-10-01',
	reminders: false,
	archived: false,
	...over
});
const due = (m: MedicationPayload, from: string, count: number) =>
	Array.from({ length: count }, (_, i) => {
		const [y, mo, d] = from.split('-').map(Number) as [number, number, number];
		return new Date(Date.UTC(y, mo - 1, d + i)).toISOString().slice(0, 10);
	}).filter((day) => isDueOn(m, day));

describe('calendar helpers', () => {
	it('counts whole days across DST changes and year ends', () => {
		expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // Europe DST starts 2026-03-29
		expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // and ends 2026-10-25
		expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
		expect(daysBetween('2026-10-18', '2026-10-17')).toBe(-1);
		expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // leap year
	});
	it('numbers weekdays like getDay()', () => {
		expect(weekdayOf('2026-10-18')).toBe(0); // Sunday
		expect(weekdayOf('2026-10-19')).toBe(1);
		expect(weekdayOf('2026-10-24')).toBe(6);
	});
});

describe('isDueOn and slotsOn', () => {
	it('daily: every day from the start date, none before', () => {
		const m = med();
		expect(isDueOn(m, '2026-09-30')).toBe(false);
		expect(isDueOn(m, '2026-10-01')).toBe(true);
		expect(isDueOn(m, '2027-01-01')).toBe(true);
	});

	it('respects the end date, inclusive', () => {
		const m = med({ end: '2026-10-05' });
		expect(isDueOn(m, '2026-10-05')).toBe(true);
		expect(isDueOn(m, '2026-10-06')).toBe(false);
		expect(due(m, '2026-10-01', 10)).toHaveLength(5);
	});

	it('weekdays: only the chosen days', () => {
		const m = med({ schedule: { kind: 'weekdays', days: [1, 3, 5] } });
		expect(due(m, '2026-10-12', 7)).toEqual(['2026-10-12', '2026-10-14', '2026-10-16']);
		const sunday = med({ schedule: { kind: 'weekdays', days: [0] } });
		expect(due(sunday, '2026-10-12', 7)).toEqual(['2026-10-18']);
	});

	it('every N days counts from `from`, not from the start date', () => {
		const m = med({ schedule: { kind: 'every_n_days', n: 3, from: '2026-10-02' }, start: '2026-10-01' });
		expect(due(m, '2026-10-01', 10)).toEqual(['2026-10-02', '2026-10-05', '2026-10-08']);
	});

	it('every N days: days before `from` are not due, even when they fit the pattern', () => {
		const m = med({ schedule: { kind: 'every_n_days', n: 2, from: '2026-10-10' } });
		expect(isDueOn(m, '2026-10-08')).toBe(false);
		expect(isDueOn(m, '2026-10-10')).toBe(true);
		expect(isDueOn(m, '2026-10-11')).toBe(false);
		expect(isDueOn(m, '2026-10-12')).toBe(true);
	});

	it('every N days stays on pattern across DST changes and a year end', () => {
		const m = med({ schedule: { kind: 'every_n_days', n: 7, from: '2026-03-01' }, start: '2026-03-01' });
		expect(isDueOn(m, '2026-03-29')).toBe(true); // DST day itself
		expect(isDueOn(m, '2026-10-25')).toBe(true); // 238 days = 34 weeks
		const yearEnd = med({
			schedule: { kind: 'every_n_days', n: 5, from: '2026-12-29' },
			start: '2026-12-01'
		});
		expect(due(yearEnd, '2026-12-29', 10)).toEqual(['2026-12-29', '2027-01-03']);
	});

	it('is never due when as needed or archived', () => {
		const asNeeded = med({ schedule: { kind: 'as_needed' }, times: [] });
		expect(isDueOn(asNeeded, '2026-10-18')).toBe(false);
		expect(slotsOn(asNeeded, '2026-10-18')).toEqual([]);
		const archived = med({ archived: true });
		expect(isDueOn(archived, '2026-10-18')).toBe(false);
		expect(slotsOn(archived, '2026-10-18')).toEqual([]);
	});

	it('slotsOn returns the times earliest first with the amounts exactly as typed', () => {
		const m = med({
			times: [
				{ time: '20:00', amount: '2 tablets' },
				{ time: '08:00', amount: ' one and a half ' },
				{ time: '13:30', amount: '5 ml' }
			]
		});
		expect(slotsOn(m, '2026-10-18')).toEqual([
			{ time: '08:00', amount: ' one and a half ' },
			{ time: '13:30', amount: '5 ml' },
			{ time: '20:00', amount: '2 tablets' }
		]);
		expect(m.times[0]!.time).toBe('20:00'); // input not mutated
		expect(slotsOn(m, '2026-09-01')).toEqual([]);
	});
});

describe('scheduleSummary', () => {
	const tEn = (key: MessageKey, vars?: Record<string, string | number>) => translate('en', key, vars);
	const tDa = (key: MessageKey, vars?: Record<string, string | number>) => translate('da', key, vars);

	it('describes each schedule kind', () => {
		const two = [
			{ time: '20:00', amount: 'x' },
			{ time: '08:00', amount: 'y' }
		];
		expect(scheduleSummary(med({ times: two }), tEn, 'en')).toBe('Every day · 08:00, 20:00');
		expect(scheduleSummary(med({ schedule: { kind: 'weekdays', days: [5, 1, 3] } }), tEn, 'en')).toBe(
			'Mon, Wed, Fri · 08:00'
		);
		expect(scheduleSummary(med({ schedule: { kind: 'weekdays', days: [0, 6] } }), tEn, 'en')).toBe(
			'Sat, Sun · 08:00'
		);
		expect(
			scheduleSummary(med({ schedule: { kind: 'every_n_days', n: 3, from: '2026-10-01' } }), tEn, 'en')
		).toBe('Every 3 days · 08:00');
		expect(scheduleSummary(med({ schedule: { kind: 'as_needed' }, times: [] }), tEn, 'en')).toBe(
			'When needed'
		);
	});

	it('is translated', () => {
		expect(scheduleSummary(med(), tDa, 'da')).toBe(`${da['meds.sum.daily']} · 08:00`);
		expect(scheduleSummary(med({ schedule: { kind: 'as_needed' }, times: [] }), tDa, 'da')).toBe(
			da['meds.sum.asNeeded']
		);
	});
});
