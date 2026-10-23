import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '$lib/records/codec';
import type { PainPayload, PainPoint } from '$lib/records/pain';
import type { Payload } from '$lib/records/types';
import { WEIGHT_ID } from '$lib/records/log';
import { lastDays } from '$lib/trends/range';
import {
	buildDoctorReport,
	DOCTOR_SECTIONS,
	doctorOverview,
	medicinesBlock,
	paginate,
	resolveInclude,
	runsOf,
	unitsOf,
	type Include
} from './doctor';

// Synthetic data only.
let n = 0;
const rec = (payload: Payload, id = `r${++n}`): StoredRecord => ({ id, rev: 1, updatedAt: 1, payload });
const point = (intensity: number, region = 'knee', side = 'right'): PainPoint =>
	({ region, side, space: '2d-front-v1', u: 0.5, v: 0.5, intensity, qualities: [] }) as unknown as PainPoint;
const pain = (at: string, ...points: PainPoint[]) =>
	rec({ v: 1, type: 'pain', at, points } as unknown as PainPayload);
const med = (
	id: string,
	name: string,
	kind: 'as_needed' | 'daily',
	extra: Partial<Extract<Payload, { type: 'medication' }>> = {}
) =>
	rec(
		{
			v: 1,
			type: 'medication',
			name,
			form: 'tablet',
			schedule: { kind },
			times: kind === 'daily' ? [{ time: '08:00', amount: '1' }] : [],
			start: '2026-09-01',
			reminders: false,
			archived: false,
			strength: 250,
			unit: 'mg',
			...extra
		} as Payload,
		id
	);
const dose = (medicationId: string, at: string, status: string, slotDate?: string) =>
	rec({
		v: 1,
		type: 'dose',
		at,
		medicationId,
		status,
		...(slotDate ? { slot: { date: slotDate, time: '08:00' } } : {})
	} as Payload);

const days = lastDays(30, '2026-10-22'); // 23 Sep to 22 Oct
const all: Include = Object.fromEntries(DOCTOR_SECTIONS.map((s) => [s, true])) as Include;

describe('medicinesBlock', () => {
	const records = [
		med('m1', 'Magnesium', 'daily'),
		med('m2', 'Old tablet', 'daily', { archived: true }),
		med('m3', 'Archived but taken', 'daily', { archived: true }),
		med('m4', 'Paracetamol', 'as_needed'),
		med('m5', 'Unused as needed', 'as_needed'),
		dose('m1', '2026-10-10T08:00:00+02:00', 'taken', '2026-10-10'),
		dose('m1', '2026-10-11T09:30:00+02:00', 'late', '2026-10-11'),
		dose('m1', '2026-10-12T08:00:00+02:00', 'skipped', '2026-10-12'),
		dose('m1', '2026-08-01T08:00:00+02:00', 'taken', '2026-08-01'), // before the period
		dose('m3', '2026-10-05T08:00:00+02:00', 'taken', '2026-10-05'),
		dose('m4', '2026-10-15T22:15:00+02:00', 'taken'),
		dose('m4', '2026-10-18T12:00:00+02:00', 'taken')
	];

	it('counts taken, skipped and late inside the period, by the dose day', () => {
		const m = medicinesBlock(records, days, 'en');
		const row = m.regular.find((r) => r.name === 'Magnesium')!;
		expect([row.taken, row.skipped, row.late]).toEqual([1, 1, 1]);
		expect(row.strength).toBe('250 mg');
		expect(row.form).toBe('Tablet');
		expect(row.schedule).toBe('Every day · 08:00');
	});
	it('lists archived medicines only when they have doses in the period', () => {
		const names = medicinesBlock(records, days, 'en').regular.map((r) => r.name);
		expect(names).toEqual(['Archived but taken', 'Magnesium']);
	});
	it('lists as-needed medicines that were taken, with times and the last time', () => {
		const m = medicinesBlock(records, days, 'en');
		expect(m.asNeeded).toEqual([
			{ name: 'Paracetamol', strength: '250 mg', times: 2, last: '18 Oct, 12:00' }
		]);
	});
	it('does not start a medicine that begins after the period', () => {
		const m = medicinesBlock([med('x', 'Future', 'daily', { start: '2026-11-01' })], days, 'en');
		expect(m.regular).toEqual([]);
	});
});

describe('doctorOverview and resolveInclude', () => {
	const records = [
		med('m1', 'Magnesium', 'daily'),
		dose('m1', '2026-10-10T08:00:00+02:00', 'taken', '2026-10-10'),
		pain('2026-10-10T10:00:00+02:00', point(4)),
		pain('2026-10-12T10:00:00+02:00', point(6)),
		rec({ v: 1, type: 'note', at: '2026-10-11T12:00:00+02:00', text: 'A note', tags: [] } as Payload)
	];
	it('counts what the period holds', () => {
		const o = doctorOverview(records, days, '2026-10-22');
		expect(o.medicines).toBe(1);
		expect(o.pain).toBe(2);
		expect(o.notes).toBe(1);
		expect(o.sleep).toBe(0);
		expect(o.headache).toBe(0);
	});
	it('ticks sections with data except Notes and the headache pages; empty ones stay off', () => {
		const o = doctorOverview(records, days, '2026-10-22');
		const inc = resolveInclude(o, {});
		expect(inc.medicines).toBe(true);
		expect(inc.pain).toBe(true);
		expect(inc.notes).toBe(false);
		expect(inc.headachePages).toBe(false);
		expect(inc.sleep).toBe(false);
		// The person's own choice wins, but never for an empty section.
		const own = resolveInclude(o, { notes: true, pain: false, sleep: true });
		expect(own.notes).toBe(true);
		expect(own.pain).toBe(false);
		expect(own.sleep).toBe(false);
	});
});

describe('buildDoctorReport', () => {
	const records = [
		med('m1', 'Magnesium', 'daily'),
		dose('m1', '2026-10-10T08:00:00+02:00', 'taken', '2026-10-10'),
		pain('2026-10-10T10:00:00+02:00', point(4), point(2, 'lower_back', 'midline')),
		pain('2026-10-11T10:00:00+02:00', point(6)),
		rec({ v: 1, type: 'feeling', at: '2026-10-10T09:00:00+02:00', mood: 3, energy: 4 } as Payload),
		rec({
			v: 1,
			type: 'measurement',
			at: '2026-10-10T09:00:00+02:00',
			typeId: WEIGHT_ID,
			unit: 'kg',
			values: [64.2]
		} as Payload),
		rec({
			v: 1,
			type: 'bowel',
			at: '2026-10-10T09:00:00+02:00',
			bristol: 4
		} as Payload),
		rec({ v: 1, type: 'note', at: '2026-10-11T12:00:00+02:00', text: 'A note', tags: [] } as Payload)
	];
	const build = (include: Partial<Include>, questions = '') =>
		buildDoctorReport(records, days, { questions, include: { ...all, ...include } }, 'en', '2026-10-22');

	it('builds only the ticked sections', () => {
		const r = build({ medicines: false, pain: false, notes: false });
		expect(r.medicines).toBeNull();
		expect(r.pain).toBeNull();
		expect(r.notes).toBeNull();
		expect(r.feeling).not.toBeNull();
		expect(r.dayCount).toBe(30);
	});
	it('ranks places by days with whole-number averages and at most 8', () => {
		const r = build({});
		expect(r.pain!.entries).toBe(2);
		expect(r.pain!.days).toBe(2);
		expect(r.pain!.rows[0]).toMatchObject({ days: 2, avg: 5 });
		expect(r.pain!.rows.length).toBeLessThanOrEqual(8);
	});
	it('charts have value axes and keep days without an entry blank', () => {
		const r = build({});
		expect(r.feeling!.yTicks).toEqual([1, 2, 3, 4, 5]);
		expect(r.feeling!.series[0]!.values.filter((v) => v === null)).toHaveLength(29);
		const weight = r.charts.find((c) => c.id === 'weight')!;
		expect(weight.yUnit).toBe('kg');
		expect(weight.yTicks).toHaveLength(3);
		expect(weight.yMin).toBeLessThan(64.2);
		expect(weight.yMax).toBeGreaterThan(64.2);
	});
	it('counts bowel movements and lists notes only when asked', () => {
		const r = build({ notes: true });
		expect(r.bowel).toEqual({ count: 1, days: 1 });
		expect(r.gut).toBeNull();
		expect(r.notes).toEqual([{ when: '11 Oct, 12:00', text: 'A note' }]);
	});
	it('uses the questions text only when something was typed', () => {
		expect(build({}, '   ').questions).toBe('');
		expect(build({}, ' Is it ok? ').questions).toBe('Is it ok?');
	});
	it('mentions the headache diary pages only when they are included', () => {
		const withHeadache = [
			...records,
			rec({
				v: 1,
				type: 'pain',
				at: '2026-10-12T10:00:00+02:00',
				points: [
					{
						region: 'temple',
						side: 'right',
						space: '2d-head-front-v2',
						u: 0.5,
						v: 0.5,
						intensity: 5,
						qualities: []
					}
				]
			} as unknown as Payload)
		];
		const make = (headachePages: boolean) =>
			buildDoctorReport(
				withHeadache,
				days,
				{ questions: '', include: { ...all, headachePages } },
				'en',
				'2026-10-22'
			);
		expect(make(false).headacheDays).toEqual({ count: 1, seeDiary: false });
		expect(make(true).headacheDays).toEqual({ count: 1, seeDiary: true });
	});
});

describe('unitsOf', () => {
	it('orders the sections and keeps each heading with what follows', () => {
		const records = [
			med('m1', 'Magnesium', 'daily'),
			dose('m1', '2026-10-10T08:00:00+02:00', 'taken', '2026-10-10'),
			pain('2026-10-10T10:00:00+02:00', point(4))
		];
		const r = buildDoctorReport(records, days, { questions: 'Why?', include: all }, 'en', '2026-10-22');
		const units = unitsOf(r, 'en');
		expect(units.map((u) => u.id).slice(0, 7)).toEqual([
			'h-questions',
			'questions',
			'h-medicines',
			'meds-0',
			'fn-meds',
			'h-pain',
			'pain'
		]);
		expect(units.filter((u) => u.part.t === 'h2').every((u) => u.keepNext)).toBe(true);
	});
});

describe('paginate', () => {
	const cap = (n: number) => (n === 0 ? 100 : 120);
	it('fills a sheet, then starts the next', () => {
		const pages = paginate(
			Array.from({ length: 5 }, () => ({ h: 40 })),
			cap
		);
		expect(pages.map((p) => p.map((x) => x.i))).toEqual([
			[0, 1],
			[2, 3, 4]
		]);
	});
	it('keeps a heading with the unit after it', () => {
		const units = [{ h: 60 }, { h: 20, keepNext: true }, { h: 30 }];
		const pages = paginate(units, cap);
		expect(pages.map((p) => p.map((x) => x.i))).toEqual([[0], [1, 2]]);
	});
	it('never cuts a row: a unit moves whole to the next sheet', () => {
		const units = [{ h: 90 }, { h: 30 }];
		expect(paginate(units, cap)).toEqual([[{ i: 0, head: false }], [{ i: 1, head: false }]]);
	});
	it('repeats a table header on the sheet where the table continues', () => {
		const rows = Array.from({ length: 6 }, () => ({ h: 25, table: 'meds' }));
		const pages = paginate(rows, cap, { meds: 20 });
		// Sheet 1: header 20 + 3 rows (75) = 95 of 100. Sheet 2: header + 3 rows.
		expect(pages).toHaveLength(2);
		expect(pages[0]![0]!.head).toBe(true);
		expect(pages[1]![0]!.head).toBe(true);
		expect(pages[1]!.slice(1).every((p) => !p.head)).toBe(true);
	});
	it('gives a unit taller than a sheet a sheet of its own instead of looping', () => {
		const pages = paginate([{ h: 10 }, { h: 500 }, { h: 10 }], cap);
		expect(pages.map((p) => p.map((x) => x.i))).toEqual([[0], [1], [2]]);
	});
	it('returns one empty sheet for no units', () => {
		expect(paginate([], cap)).toEqual([[]]);
	});
});

describe('runsOf', () => {
	it('joins consecutive rows of one table and leaves other units alone', () => {
		const units = [{ h: 1 }, { h: 1, table: 'a' }, { h: 1, table: 'a' }, { h: 1, table: 'b' }, { h: 1 }];
		const placed = units.map((_, i) => ({ i, head: i === 1 || i === 3 }));
		expect(runsOf(placed, units).map((r) => [r.table, r.items.length])).toEqual([
			[null, 1],
			['a', 2],
			['b', 1],
			[null, 1]
		]);
	});
});
