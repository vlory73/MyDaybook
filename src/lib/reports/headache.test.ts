import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '$lib/records/codec';
import type { PainPayload, PainPoint } from '$lib/records/pain';
import type { Payload } from '$lib/records/types';
import { dayRange } from '$lib/trends/range';
import { translate } from '$lib/i18n/core';
import {
	buildHeadacheReport,
	dayMonthLabel,
	mergeYesNo,
	numericDayMonth,
	periodLabel,
	weekdayLabel
} from './headache';

// Synthetic data only.
let n = 0;
const rec = (payload: Payload, id = `r${++n}`): StoredRecord => ({ id, rev: 1, updatedAt: 1, payload });
const point = (intensity: number, side = 'right', qualities: string[] = []) =>
	({
		region: 'temple',
		side,
		space: '2d-head-front-v2',
		u: 0.5,
		v: 0.5,
		intensity,
		qualities
	}) as unknown as PainPoint;
const pain = (at: string, points: PainPoint[], headache?: object) =>
	rec({ v: 1, type: 'pain', at, points, headache } as unknown as PainPayload);
const med = (id: string, name: string, kind: 'as_needed' | 'daily') =>
	rec(
		{
			v: 1,
			type: 'medication',
			name,
			form: 'tablet',
			schedule: { kind },
			times: kind === 'daily' ? [{ time: '08:00', amount: '1' }] : [],
			start: '2026-10-01',
			reminders: false,
			archived: false,
			strength: 500,
			unit: 'mg'
		} as Payload,
		id
	);
const dose = (medicationId: string, at: string, status = 'taken', amount?: string) =>
	rec({ v: 1, type: 'dose', at, medicationId, status, ...(amount ? { amount } : {}) } as Payload);

const days = dayRange('2026-10-13', '2026-10-19');

describe('buildHeadacheReport', () => {
	it('puts a headache on the day it started and every other day as "no headache"', () => {
		const r = buildHeadacheReport(
			[pain('2026-10-14T20:00:00+02:00', [point(5)], { started: '2026-10-14T18:00:00+02:00' })],
			days,
			'table'
		);
		expect(r.pages).toHaveLength(1);
		expect(r.pages[0]!.map((c) => c.headache !== null)).toEqual([
			false,
			true,
			false,
			false,
			false,
			false,
			false
		]);
		expect(r.pages[0]![1]!.headache!.started).toBe('18:00');
	});

	it('uses the day the entry was logged when no start was entered', () => {
		const r = buildHeadacheReport([pain('2026-10-15T09:00:00+02:00', [point(2)])], days, 'table');
		expect(r.pages[0]![2]!.headache).not.toBeNull();
		expect(r.pages[0]![2]!.headache!.started).toBeNull();
	});

	it('merges several entries of one day', () => {
		const a = pain('2026-10-15T09:00:00+02:00', [point(2, 'left', ['throbbing'])], {
			started: '2026-10-15T08:00:00+02:00',
			stopped: '2026-10-15T10:00:00+02:00',
			before: ['speech'],
			worseWithActivity: false,
			light: true,
			trigger: 'Poor sleep'
		});
		const b = pain('2026-10-15T15:00:00+02:00', [point(8, 'right', ['constant'])], {
			started: '2026-10-15T14:00:00+02:00',
			stopped: '2026-10-15T16:00:00+02:00',
			before: ['vision'],
			worseWithActivity: true,
			light: false,
			sound: false,
			trigger: 'Noise'
		});
		const h = buildHeadacheReport([b, a], days, 'table').pages[0]![2]!.headache!;
		expect(h).toMatchObject({
			started: '08:00',
			stopped: { time: '16:00', plusDays: 0 },
			before: ['vision', 'speech'],
			side: 'both',
			quality: 'both',
			severity: 'moderate', // (2 + 8) / 2 = 5
			worse: true,
			light: true,
			sound: false,
			trigger: 'Poor sleep; Noise'
		});
	});

	it('counts days after midnight and keeps "still going"', () => {
		const over = pain('2026-10-15T22:00:00+02:00', [point(5)], {
			started: '2026-10-15T21:00:00+02:00',
			stopped: '2026-10-16T02:00:00+02:00'
		});
		const long = pain('2026-10-17T22:00:00+02:00', [point(5)], {
			started: '2026-10-17T21:00:00+02:00',
			stopped: '2026-10-19T09:00:00+02:00'
		});
		const going = pain('2026-10-18T08:00:00+02:00', [point(5)], {
			started: '2026-10-18T07:00:00+02:00',
			stillGoing: true
		});
		const cols = buildHeadacheReport([over, long, going], days, 'table').pages[0]!;
		expect(cols[2]!.headache!.stopped).toEqual({ time: '02:00', plusDays: 1 });
		expect(cols[4]!.headache!.stopped).toEqual({ time: '09:00', plusDays: 2 });
		expect(cols[5]!.headache!.stillGoing).toBe(true);
		expect(cols[5]!.headache!.stopped).toBeNull();
	});

	it('takes nausea from the same day, "none" when not logged', () => {
		const gut = rec({
			v: 1,
			type: 'gut',
			at: '2026-10-15T12:00:00+02:00',
			symptoms: [{ kind: 'nausea', intensity: 4 }],
			flags: []
		} as Payload);
		const cols = buildHeadacheReport(
			[pain('2026-10-15T09:00:00+02:00', [point(5)]), pain('2026-10-16T09:00:00+02:00', [point(5)]), gut],
			days,
			'table'
		).pages[0]!;
		expect(cols[2]!.headache!.nausea).toBe('severe');
		expect(cols[3]!.headache!.nausea).toBe('none');
	});

	it('leaves unanswered questions empty', () => {
		const h = buildHeadacheReport([pain('2026-10-15T09:00:00+02:00', [point(0)])], days, 'table')
			.pages[0]![2]!.headache!;
		expect(h).toMatchObject({
			started: null,
			stopped: null,
			before: [],
			quality: null,
			severity: null,
			worse: null,
			light: null,
			sound: null,
			trigger: null,
			medicines: []
		});
	});

	it('lists only as-needed and one-off doses that were taken or taken late', () => {
		const prn = med('m-prn', 'Paracetamol', 'as_needed');
		const daily = med('m-daily', 'Vitamin', 'daily');
		const records = [
			pain('2026-10-15T09:00:00+02:00', [point(5)]),
			prn,
			daily,
			dose('m-prn', '2026-10-15T22:15:00+02:00'),
			dose('m-prn', '2026-10-15T09:10:00+02:00', 'late', '1 tablet'),
			dose('m-prn', '2026-10-15T11:00:00+02:00', 'skipped'),
			dose('m-daily', '2026-10-15T08:05:00+02:00'),
			dose('m-prn', '2026-10-16T08:05:00+02:00')
		];
		const h = buildHeadacheReport(records, days, 'table').pages[0]![2]!.headache!;
		expect(h.medicines).toEqual([
			{ name: 'Paracetamol', amount: '1 tablet', time: '09:10' },
			{ name: 'Paracetamol', amount: '500 mg', time: '22:15' }
		]);
	});

	it('pages seven columns at a time: every day in the table, headache days only in the form', () => {
		const long = dayRange('2026-10-01', '2026-10-19'); // 19 days
		const records = [1, 3, 5, 7, 9, 11, 13, 15, 17].map((d) =>
			pain(`2026-10-${String(d).padStart(2, '0')}T09:00:00+02:00`, [point(4)])
		);
		const table = buildHeadacheReport(records, long, 'table');
		expect(table.pages.map((p) => p.length)).toEqual([7, 7, 5]);
		expect(table.pageCount).toBe(3);
		const form = buildHeadacheReport(records, long, 'form');
		expect(form.pages.map((p) => p.length)).toEqual([7, 2]);
		expect(form.pages.flat().every((c) => c.headache)).toBe(true);
		expect(form.pageCount).toBe(2);
	});

	it('is empty (one page) when the period has no headache', () => {
		for (const layout of ['table', 'form'] as const) {
			const r = buildHeadacheReport(
				[
					pain('2026-09-01T09:00:00+02:00', [point(5)]),
					rec({ v: 1, type: 'note', at: '2026-10-14T09:00:00+02:00', text: 'x', tags: [] })
				],
				days,
				layout
			);
			expect(r).toMatchObject({ empty: true, pages: [], pageCount: 1, from: '2026-10-13', to: '2026-10-19' });
		}
	});
});

describe('mergeYesNo', () => {
	it('is Yes with any yes, No with only noes, otherwise unanswered', () => {
		expect(mergeYesNo([false, true, undefined])).toBe(true);
		expect(mergeYesNo([undefined, false])).toBe(false);
		expect(mergeYesNo([undefined])).toBeNull();
		expect(mergeYesNo([])).toBeNull();
	});
});

// ICU versions differ in the spacing around the range dash.
const tight = (s: string) => s.replace(/\s*–\s*/, '–');

describe('report language', () => {
	it('formats dates in the chosen language', () => {
		expect(weekdayLabel('2026-10-13', 'en')).toBe('Tue');
		expect(weekdayLabel('2026-10-13', 'da')).toBe('Tir');
		expect(dayMonthLabel('2026-10-13', 'en')).toBe('13 Oct');
		expect(dayMonthLabel('2026-10-13', 'da')).toBe('13. okt.');
		expect(tight(periodLabel('2026-10-13', '2026-10-19', 'en'))).toBe('13–19 Oct 2026');
		expect(tight(periodLabel('2026-10-13', '2026-10-19', 'da'))).toBe('13.–19. okt. 2026');
		expect(numericDayMonth('2026-10-03')).toBe('3/10');
	});

	it('translates report strings independent of the app language', () => {
		expect(translate('da', 'rep.none')).toBe('Ingen hovedpine');
		expect(translate('en', 'rep.none')).toBe('No headache');
		expect(translate('da', 'rep.page', { page: 1, total: 2 })).toBe('Side 1 af 2');
	});
});
