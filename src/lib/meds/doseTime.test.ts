import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '$lib/records/codec';
import type { MedicationPayload, Payload } from '$lib/records/types';
import { asksForTime, initialDoseAt, medicineChoices, storedDoseAt } from './doseTime';

// Synthetic data only.
const NOW = new Date(2026, 9, 19, 10, 5, 0);
const TODAY = '2026-10-19';
const med = (name: string, over: Partial<MedicationPayload> = {}): MedicationPayload => ({
	v: 1,
	type: 'medication',
	name,
	form: 'tablet',
	schedule: { kind: 'as_needed' },
	times: [],
	start: '2026-10-01',
	reminders: false,
	archived: false,
	...over
});
const rec = (id: string, payload: Payload): StoredRecord<Payload> => ({ id, rev: 1, updatedAt: 1, payload });

describe('initialDoseAt', () => {
	it('prefers the logged time, whatever the status', () => {
		const at = '2026-10-19T07:30:00+02:00';
		expect(initialDoseAt(at, { date: TODAY, time: '08:00' }, NOW, TODAY)).toBe(at);
	});
	it('uses now for today and the planned time for a past day', () => {
		expect(initialDoseAt(undefined, { date: TODAY, time: '08:00' }, NOW, TODAY)).toContain(
			'2026-10-19T10:05'
		);
		expect(initialDoseAt(undefined, { date: '2026-10-18', time: '08:00' }, NOW, TODAY)).toContain(
			'2026-10-18T08:00'
		);
	});
});

describe('storedDoseAt / asksForTime', () => {
	const slot = { date: TODAY, time: '08:00' };
	it('asks for a time unless a scheduled dose is skipped', () => {
		expect(asksForTime(slot, 'taken')).toBe(true);
		expect(asksForTime(slot, 'late')).toBe(true);
		expect(asksForTime(slot, 'skipped')).toBe(false);
		expect(asksForTime(undefined, 'taken')).toBe(true);
	});
	it('stores the picked time for taken and late, the old or default one for skipped', () => {
		expect(storedDoseAt('taken', slot, 'P', 'E', NOW, TODAY)).toBe('P');
		expect(storedDoseAt('late', slot, 'P', undefined, NOW, TODAY)).toBe('P');
		expect(storedDoseAt('skipped', slot, 'P', 'E', NOW, TODAY)).toBe('E');
		expect(storedDoseAt('skipped', slot, 'P', undefined, NOW, TODAY)).toContain('2026-10-19T10:05');
	});
});

describe('medicineChoices', () => {
	it('lists active as-needed medicines plus the current one, by name', () => {
		const all = [
			rec('a', med('Zeta')),
			rec('b', med('Alfa')),
			rec('c', med('Old', { archived: true })),
			rec('d', med('Daily', { schedule: { kind: 'daily' } })),
			rec('e', { v: 1, type: 'note', text: 'x' } as unknown as Payload)
		];
		expect(medicineChoices(all, 'b').map((x) => x.name)).toEqual(['Alfa', 'Zeta']);
		expect(medicineChoices(all, 'c').map((x) => x.name)).toEqual(['Old', 'Alfa', 'Zeta'].sort());
		expect(medicineChoices(all, 'd').map((x) => x.name)).toEqual(['Alfa', 'Daily', 'Zeta']);
	});
});
