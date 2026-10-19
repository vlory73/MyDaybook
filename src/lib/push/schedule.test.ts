import { describe, expect, it } from 'vitest';
import type { MedicationPayload } from '$lib/records/types';
import { buildReminderSchedule, scheduleKey } from './schedule';

// Synthetic data only.
const med = (over: Partial<MedicationPayload> = {}): MedicationPayload => ({
	v: 1,
	type: 'medication',
	name: 'Synthol',
	strength: 50,
	unit: 'mg',
	form: 'tablet',
	schedule: { kind: 'daily' },
	times: [{ time: '08:00', amount: '1 tablet' }],
	start: '2026-10-01',
	reminders: true,
	archived: false,
	...over
});
const TODAY = '2026-10-19';
const build = (meds: MedicationPayload[]) => buildReminderSchedule(meds, 'Europe/Copenhagen', TODAY);
const ALL = [0, 1, 2, 3, 4, 5, 6];

describe('buildReminderSchedule', () => {
	it('turns a daily medication into one slot per time on every day', () => {
		expect(
			build([
				med({
					times: [
						{ time: '20:00', amount: '1' },
						{ time: '08:00', amount: '1' }
					]
				})
			])
		).toEqual({
			tz: 'Europe/Copenhagen',
			slots: [
				{ time: '08:00', days: ALL },
				{ time: '20:00', days: ALL }
			]
		});
	});

	it('uses the chosen weekdays', () => {
		expect(build([med({ schedule: { kind: 'weekdays', days: [5, 1, 3] } })]).slots).toEqual([
			{ time: '08:00', days: [1, 3, 5] }
		]);
	});

	it('merges the same time across medicines (union of weekdays) so no slot maps to one medicine', () => {
		const s = build([
			med({ name: 'A', schedule: { kind: 'weekdays', days: [1] } }),
			med({ name: 'B', schedule: { kind: 'weekdays', days: [3] } }),
			med({
				name: 'C',
				schedule: { kind: 'weekdays', days: [3, 4] },
				times: [{ time: '08:00', amount: '2' }]
			})
		]);
		expect(s.slots).toEqual([{ time: '08:00', days: [1, 3, 4] }]);
	});

	it('leaves out archived, reminders-off, as-needed, every-N-days and ended medicines', () => {
		expect(
			build([
				med({ archived: true }),
				med({ reminders: false }),
				med({ schedule: { kind: 'as_needed' }, times: [] }),
				med({ schedule: { kind: 'every_n_days', n: 3, from: '2026-10-01' } }),
				med({ end: '2026-10-18' })
			]).slots
		).toEqual([]);
		expect(build([med({ end: TODAY })]).slots).toHaveLength(1);
		expect(build([med({ end: '2026-12-31', start: '2027-01-01' })]).slots).toHaveLength(1);
	});

	it('contains nothing that identifies a medicine', () => {
		const text = scheduleKey(
			build([
				med({
					name: 'Synthol',
					strength: 50,
					unit: 'mg',
					note: 'with food',
					times: [{ time: '08:00', amount: '1 tablet' }]
				})
			])
		);
		for (const secret of ['Synthol', '50', 'mg', 'tablet', 'food', 'medication'])
			expect(text).not.toContain(secret);
		expect(Object.keys(JSON.parse(text)).sort()).toEqual(['slots', 'tz']);
		expect(Object.keys(JSON.parse(text).slots[0]).sort()).toEqual(['days', 'time']);
	});

	it('gives the same key for the same schedule regardless of medicine order', () => {
		const a = med({ times: [{ time: '08:00', amount: '1' }] });
		const b = med({ times: [{ time: '12:00', amount: '1' }] });
		expect(scheduleKey(build([a, b]))).toBe(scheduleKey(build([b, a])));
		expect(scheduleKey(build([a]))).not.toBe(scheduleKey(build([a, b])));
	});
});
