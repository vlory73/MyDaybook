import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '$lib/records/codec';
import { parsePayload, type MedicationPayload, type Payload } from '$lib/records/types';
import { adhocMedication, findByName, medicationNames } from './adhoc';

// Synthetic data only.
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
const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord => ({
	id,
	rev: 1,
	updatedAt,
	payload
});

describe('medicationNames', () => {
	it('lists active and archived names once, case-insensitively, sorted', () => {
		const all = [
			rec('1', med('Zetol')),
			rec('2', med('alfol', { archived: true })),
			rec('3', med('ALFOL')),
			rec('4', med('  Betol  ')),
			rec('5', { v: 1, type: 'tag', name: 'Other' } as Payload)
		];
		expect(medicationNames(all)).toEqual(['alfol', 'Betol', 'Zetol']);
	});
});

describe('findByName', () => {
	it('matches case-insensitively and trimmed, and returns null otherwise', () => {
		const all = [rec('1', med('Synthol'))];
		expect(findByName(all, '  synthol ')?.id).toBe('1');
		expect(findByName(all, 'Synth')).toBeNull();
		expect(findByName(all, '   ')).toBeNull();
	});
	it('prefers active over archived, then newest, then id', () => {
		const all = [
			rec('a', med('Synthol', { archived: true }), 9),
			rec('b', med('Synthol'), 1),
			rec('c', med('Synthol'), 5)
		];
		expect(findByName(all, 'synthol')?.id).toBe('c');
		expect(findByName([all[0]!], 'synthol')?.medication.archived).toBe(true);
		const ties = [rec('y', med('Synthol'), 3), rec('x', med('Synthol'), 3)];
		expect(findByName(ties, 'Synthol')?.id).toBe('x');
	});
});

describe('adhocMedication', () => {
	it('builds a trimmed when-needed medication that passes the validator', () => {
		const kept = adhocMedication('  Synthol  ', '2026-10-19', true);
		expect(kept).toMatchObject({ name: 'Synthol', start: '2026-10-19', archived: false, times: [] });
		expect(kept.schedule).toEqual({ kind: 'as_needed' });
		expect(parsePayload(kept)).not.toBeNull();
		const dropped = adhocMedication('Synthol', '2026-10-19', false);
		expect(dropped.archived).toBe(true);
		expect(parsePayload(dropped)).not.toBeNull();
	});
});
