import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '$lib/records/codec';
import type { DosePayload, MedicationPayload, Payload } from '$lib/records/types';
import { asNeededMedications, defaultAt, dueSlots, pending, slotDose } from './due';

// Synthetic data only.
const DAY = '2026-10-19'; // a Monday

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
const rec = <P extends Payload>(id: string, payload: P, updatedAt = 1): StoredRecord<P> => ({
	id,
	rev: 1,
	updatedAt,
	payload
});
const dose = (medicationId: string, time: string, over: Partial<DosePayload> = {}): DosePayload => ({
	v: 1,
	type: 'dose',
	at: `${DAY}T08:10:00+02:00`,
	medicationId,
	slot: { date: DAY, time },
	status: 'taken',
	...over
});

describe('dueSlots', () => {
	it('groups doses by time, earliest first, then by name', () => {
		const all = [
			rec('b', med({ name: 'Bravol', times: [{ time: '20:00', amount: '2 tablets' }] })),
			rec(
				'a',
				med({
					name: 'Alfol',
					times: [
						{ time: '20:00', amount: '1 tablet' },
						{ time: '08:00', amount: '5 ml' }
					]
				})
			),
			rec('c', med({ name: 'Charlol', times: [{ time: '08:00', amount: '' }] }))
		];
		const slots = dueSlots(all, DAY);
		expect(slots.map((s) => s.time)).toEqual(['08:00', '20:00']);
		expect(slots[0]!.doses.map((d) => d.medication.name)).toEqual(['Alfol', 'Charlol']);
		expect(slots[1]!.doses.map((d) => d.medication.name)).toEqual(['Alfol', 'Bravol']);
		// Amounts pass through verbatim, including the empty one.
		expect(slots[0]!.doses.map((d) => d.amount)).toEqual(['5 ml', '']);
		expect(slots[1]!.doses.map((d) => d.amount)).toEqual(['1 tablet', '2 tablets']);
		expect(slots[0]!.doses[0]!.slot).toEqual({ date: DAY, time: '08:00' });
	});

	it('follows weekdays, every-N-days and the start and end dates', () => {
		const all = [
			rec('w', med({ name: 'Weekly', schedule: { kind: 'weekdays', days: [1, 3] } })),
			rec('t', med({ name: 'Tuesdays', schedule: { kind: 'weekdays', days: [2] } })),
			rec('e', med({ name: 'Every3', schedule: { kind: 'every_n_days', n: 3, from: '2026-10-10' } })),
			rec('n', med({ name: 'Notyet', start: '2026-10-20' })),
			rec('o', med({ name: 'Over', end: '2026-10-18' })),
			rec('last', med({ name: 'Lastday', end: DAY }))
		];
		const names = (day: string) => dueSlots(all, day).flatMap((s) => s.doses.map((d) => d.medication.name));
		// 2026-10-10 + 9 days = 2026-10-19, so Every3 is due.
		expect(names(DAY)).toEqual(['Every3', 'Lastday', 'Weekly']);
		expect(names('2026-10-20')).toEqual(['Notyet', 'Tuesdays']);
	});

	it('leaves out as-needed and archived medication, and days with nothing due', () => {
		const all = [
			rec('p', med({ name: 'Spray', schedule: { kind: 'as_needed' }, times: [] })),
			rec('x', med({ name: 'Old', archived: true }))
		];
		expect(dueSlots(all, DAY)).toEqual([]);
		expect(asNeededMedications(all).map((m) => m.medication.name)).toEqual(['Spray']);
	});

	it('attaches the dose logged for that day and slot only', () => {
		const all = [
			rec(
				'm',
				med({
					times: [
						{ time: '08:00', amount: '1 tablet' },
						{ time: '20:00', amount: '1 tablet' }
					]
				})
			),
			rec('d1', dose('m', '08:00')),
			rec('d2', dose('m', '20:00', { slot: { date: '2026-10-18', time: '20:00' } })), // yesterday's
			rec('d3', dose('other', '20:00'))
		];
		const slots = dueSlots(all, DAY);
		expect(slots[0]!.doses[0]!.dose?.id).toBe('d1');
		expect(slots[1]!.doses[0]!.dose).toBeNull();
		expect(pending(slots[0]!)).toEqual([]);
		expect(pending(slots[1]!)).toHaveLength(1);
	});

	it('uses the most recently updated record when two devices logged the same slot', () => {
		const all = [
			rec('m', med()),
			rec('old', dose('m', '08:00', { status: 'skipped' }), 5),
			rec('new', dose('m', '08:00', { status: 'taken' }), 9)
		];
		expect(dueSlots(all, DAY)[0]!.doses[0]!.dose?.id).toBe('new');
	});

	it('lists a time that a medication repeats only once', () => {
		const all = [
			rec(
				'm',
				med({
					times: [
						{ time: '08:00', amount: '1 tablet' },
						{ time: '08:00', amount: '2 tablets' }
					]
				})
			)
		];
		const slots = dueSlots(all, DAY);
		expect(slots).toHaveLength(1);
		expect(slots[0]!.doses.map((d) => d.amount)).toEqual(['1 tablet']);
	});

	it('keeps history when a medication is archived after doses were logged', () => {
		const logged = rec('d', dose('m', '08:00'));
		const before = dueSlots([rec('m', med()), logged], DAY);
		expect(before[0]!.doses[0]!.dose?.id).toBe('d');
		const after = dueSlots([rec('m', med({ archived: true })), logged], DAY);
		expect(after).toEqual([]);
		// The dose record itself is untouched: it is a separate record the timeline still lists.
		expect(logged.payload.status).toBe('taken');
	});

	it('does not rewrite history when the schedule changes', () => {
		const logged = rec('d', dose('m', '08:00'));
		// The 08:00 time moves to 09:00: the old record no longer matches a slot, and nothing is invented for it.
		const moved = dueSlots([rec('m', med({ times: [{ time: '09:00', amount: '1 tablet' }] })), logged], DAY);
		expect(moved.map((s) => s.time)).toEqual(['09:00']);
		expect(moved[0]!.doses[0]!.dose).toBeNull();
		// A past day keeps its own record when the schedule later becomes weekdays-only.
		const past = '2026-10-18'; // a Sunday
		const sunday = rec('s', dose('m', '08:00', { slot: { date: past, time: '08:00' } }));
		const daily = dueSlots([rec('m', med()), sunday], past);
		expect(daily[0]!.doses[0]!.dose?.id).toBe('s');
		const weekdaysOnly = dueSlots(
			[rec('m', med({ schedule: { kind: 'weekdays', days: [1] } })), sunday],
			past
		);
		expect(weekdaysOnly).toEqual([]);
	});
});

describe('slotDose and defaultAt', () => {
	it('copies the amount verbatim and leaves it out when empty', () => {
		const slot = { date: DAY, time: '08:00' };
		const a = slotDose({ medicationId: 'm', slot, amount: '1,5 tablets' }, 'taken', `${DAY}T08:00:00+02:00`);
		expect(a).toMatchObject({ type: 'dose', status: 'taken', amount: '1,5 tablets', slot });
		const b = slotDose({ medicationId: 'm', slot, amount: '' }, 'skipped', `${DAY}T08:00:00+02:00`);
		expect('amount' in b).toBe(false);
	});

	it('uses now for today and the slot time for another day', () => {
		const now = new Date(2026, 9, 19, 9, 5, 0);
		expect(defaultAt({ date: '2026-10-19', time: '08:00' }, now, '2026-10-19').slice(0, 16)).toBe(
			'2026-10-19T09:05'
		);
		expect(defaultAt({ date: '2026-10-17', time: '20:00' }, now, '2026-10-19').slice(0, 16)).toBe(
			'2026-10-17T20:00'
		);
	});
});
