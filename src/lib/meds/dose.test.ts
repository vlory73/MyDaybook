import { describe, expect, it } from 'vitest';
import { parsePayload } from '$lib/records/types';

// Synthetic data only.
const valid = {
	v: 1,
	type: 'dose',
	at: '2026-10-18T08:12:00+02:00',
	medicationId: '5b0c6e4e-6d52-4a8c-9a56-0d7f8c1f0a11',
	slot: { date: '2026-10-18', time: '08:00' },
	status: 'taken',
	amount: '1 tablet'
};
const merge = (over: Record<string, unknown>) => ({ ...valid, ...over });

describe('dose validator', () => {
	it('accepts scheduled, late, skipped and as-needed doses', () => {
		const ok: unknown[] = [
			valid,
			merge({ status: 'skipped', amount: undefined }),
			merge({ status: 'late', at: '2026-10-18T13:40:00+02:00', note: 'Was out' }),
			merge({ slot: undefined, amount: undefined }),
			merge({ slot: undefined, amount: '2 puffs' })
		];
		for (const p of ok) expect(parsePayload(p), JSON.stringify(p)).not.toBeNull();
	});

	it('rejects a bad status, time, slot or medication id', () => {
		const bad: unknown[] = [
			merge({ status: 'missed' }),
			merge({ status: undefined }),
			merge({ at: 'yesterday' }),
			merge({ at: undefined }),
			merge({ medicationId: '' }),
			merge({ medicationId: 7 }),
			merge({ slot: { date: '2026-02-30', time: '08:00' } }),
			merge({ slot: { date: '2026-10-18', time: '24:00' } }),
			merge({ slot: { date: '2026-10-18' } }),
			merge({ slot: 'now' })
		];
		for (const p of bad) expect(parsePayload(p), JSON.stringify(p)).toBeNull();
	});

	it('bounds the free text', () => {
		expect(parsePayload(merge({ amount: 'x'.repeat(101) }))).toBeNull();
		expect(parsePayload(merge({ amount: 'x'.repeat(100) }))).not.toBeNull();
		expect(parsePayload(merge({ note: 'x'.repeat(2001) }))).toBeNull();
		expect(parsePayload(merge({ medicationId: 'x'.repeat(101) }))).toBeNull();
	});
});
