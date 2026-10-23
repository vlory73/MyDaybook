import { describe, expect, it } from 'vitest';
import type { Payload } from '$lib/records/types';
import { BOM } from './csv';
import { buildTables, tableCsv, type ExportRecord } from './tables';

// Synthetic data only.
let n = 0;
const rec = (payload: Payload, id = `rec-${++n}`): ExportRecord => ({
	id,
	updatedAt: 1_760_000_000_000,
	payload
});
const find = (records: ExportRecord[], file: string) => {
	const table = buildTables(records).find((t) => t.file === file);
	if (!table) throw new Error(`no ${file}`);
	return table;
};
const AT = '2026-10-23T08:10:00+02:00';

describe('buildTables', () => {
	it('makes no table for kinds without data and keeps settings out of the CSV files', () => {
		expect(buildTables([])).toEqual([]);
		const tables = buildTables([
			rec({ v: 1, type: 'profile', firstName: 'Sam' }),
			rec({ v: 1, type: 'note', at: AT, text: 'Hello', tags: [] })
		]);
		expect(tables.map((t) => t.file)).toEqual(['notes.csv']);
	});

	it('writes meals with the watch list resolved to names and times as stored', () => {
		const lactose = rec(
			{ v: 1, type: 'sensitivity', label: 'sug:lactose', icon: 'milk', kind: 'intolerance', order: 0 },
			's1'
		);
		const own = rec(
			{ v: 1, type: 'sensitivity', label: 'Kiwi', icon: 'leaf', kind: 'other', order: 1 },
			's2'
		);
		const meal = rec({
			v: 1,
			type: 'food',
			at: AT,
			meal: 'breakfast',
			text: 'Porridge, with "honey"',
			tags: ['oats', 'sweet'],
			where: 'home',
			exposures: [
				{ id: 's1', state: 'yes' },
				{ id: 's2', state: 'no' }
			]
		});
		const t = find([lactose, own, meal], 'meals.csv');
		expect(t.columns).toEqual(['id', 'at', 'meal', 'where', 'description', 'tags', 'watch_list', 'photos']);
		expect(t.rows[0]).toEqual([
			meal.id,
			AT,
			'breakfast',
			'home',
			'Porridge, with "honey"',
			'oats; sweet',
			'Lactose: yes; Kiwi: no',
			''
		]);
		const csv = tableCsv(t);
		expect(csv.startsWith(BOM + 'id,at,meal,')).toBe(true);
		expect(csv).toContain('"Porridge, with ""honey"""');
		expect(csv.endsWith('\r\n')).toBe(true);
	});

	it('writes doses with the medicine name, and measurements with their type and joined values', () => {
		const med = rec(
			{
				v: 1,
				type: 'medication',
				name: 'Magnesium',
				strength: 250,
				unit: 'mg',
				form: 'tablet',
				schedule: { kind: 'weekdays', days: [1, 3] },
				times: [{ time: '08:00', amount: '1 tablet' }],
				start: '2026-10-01',
				reminders: false,
				archived: false
			},
			'm1'
		);
		const dose = rec({
			v: 1,
			type: 'dose',
			at: AT,
			medicationId: 'm1',
			status: 'taken',
			slot: { date: '2026-10-23', time: '08:00' },
			amount: '1 tablet'
		});
		const bp = rec({
			v: 1,
			type: 'measurement',
			at: AT,
			typeId: 'blood_pressure',
			values: [128, 82],
			unit: 'mmHg',
			context: ['morning', 'after a walk']
		});
		const all = [med, dose, bp];
		expect(find(all, 'doses.csv').rows[0]).toEqual([
			dose.id,
			AT,
			'Magnesium',
			'taken',
			'2026-10-23',
			'08:00',
			'1 tablet',
			undefined,
			''
		]);
		expect(find(all, 'measurements.csv').rows[0]).toEqual([
			bp.id,
			AT,
			'Blood pressure',
			'128; 82',
			'mmHg',
			'Morning; after a walk',
			undefined,
			''
		]);
		const meds = find(all, 'medications.csv').rows[0]!;
		expect(meds[5]).toBe('weekdays: Monday; Wednesday');
		expect(meds[6]).toBe('08:00 1 tablet');
	});

	it('writes one pain row per point, with the entry columns repeated and photos on the first row', () => {
		const pain = rec({
			v: 1,
			type: 'pain',
			at: AT,
			note: 'After a walk',
			points: [
				{
					region: 'knee',
					side: 'right',
					space: '2d-front-v1',
					u: 0.5,
					v: 0.5,
					intensity: 6,
					qualities: ['aching', 'dull']
				},
				{
					region: 'knee',
					side: 'left',
					space: '2d-front-v1',
					u: 0.5,
					v: 0.5,
					intensity: 3,
					qualities: [],
					note: 'slight'
				}
			]
		} as Payload);
		const t = find([pain], 'pain.csv');
		expect(t.rows).toHaveLength(2);
		const col = (name: string) => t.columns.indexOf(name);
		expect(t.rows.map((r) => r[col('point')])).toEqual([1, 2]);
		expect(t.rows.map((r) => r[col('side')])).toEqual(['right', 'left']);
		expect(t.rows[0]![col('place')]).toBe('Your right knee');
		expect(t.rows[0]![col('qualities')]).toBe('aching; dull');
		expect(t.rows[1]![col('point_note')]).toBe('slight');
		expect(t.rows.every((r) => r[col('entry_note')] === 'After a walk')).toBe(true);
		expect(t.rows.every((r) => r.length === t.columns.length)).toBe(true);

		const withPhotos = buildTables([pain], () => ['photos/a.jpg', 'photos/b.jpg']).find(
			(x) => x.file === 'pain.csv'
		)!;
		expect(withPhotos.rows[0]![col('photos')]).toBe('photos/a.jpg; photos/b.jpg');
		expect(withPhotos.rows[1]![col('photos')]).toBe('');
	});

	it('names episodes and links pain rows to them', () => {
		const ep = rec({ v: 1, type: 'pain_episode', name: 'Knee, October', started: AT }, 'e1');
		const pain = rec({
			v: 1,
			type: 'pain',
			at: AT,
			episode: 'e1',
			points: [
				{ region: 'knee', side: 'right', space: '2d-front-v1', u: 0.5, v: 0.5, intensity: 4, qualities: [] }
			]
		} as Payload);
		const t = find([ep, pain], 'pain.csv');
		expect(t.rows[0]![t.columns.indexOf('episode')]).toBe('Knee, October');
		expect(find([ep, pain], 'pain_episodes.csv').rows[0]).toEqual(['e1', 'Knee, October', AT, undefined]);
	});

	it('resolves built-in drink names and sorts rows by time', () => {
		const later = rec({
			v: 1,
			type: 'drink',
			at: '2026-10-23T12:00:00+02:00',
			drink: 'def:coffee',
			size: 'def:cup',
			sizeMl: 150,
			count: 2,
			totalMl: 300
		});
		const earlier = rec({
			v: 1,
			type: 'drink',
			at: '2026-10-23T07:00:00+02:00',
			drink: 'My tea',
			size: '',
			sizeMl: 250,
			count: 1,
			totalMl: 250
		});
		const t = find([later, earlier], 'drinks.csv');
		expect(t.rows.map((r) => r[2])).toEqual(['My tea', 'Coffee']);
		expect(t.rows[1]![3]).toBe('Cup');
	});
});
