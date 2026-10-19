import { describe, expect, it } from 'vitest';
import { parsePayload } from '$lib/records/types';

// Synthetic data only.
const valid = {
	v: 1,
	type: 'medication',
	name: 'Synthol',
	strength: 20,
	unit: 'µg',
	form: 'tablet',
	schedule: { kind: 'daily' },
	times: [{ time: '08:00', amount: '1 tablet' }],
	start: '2026-10-18',
	reminders: false,
	archived: false
};
const merge = (over: Record<string, unknown>) => ({ ...valid, ...over });

describe('medication validator', () => {
	it('accepts each schedule kind', () => {
		const ok: unknown[] = [
			valid,
			merge({ schedule: { kind: 'weekdays', days: [1, 3, 5] } }),
			merge({ schedule: { kind: 'every_n_days', n: 3, from: '2026-10-01' }, end: '2026-12-31', note: 'x' }),
			merge({ schedule: { kind: 'as_needed' }, times: [], strength: undefined, unit: undefined }),
			merge({ form: 'sachet' })
		];
		for (const p of ok) expect(parsePayload(p), JSON.stringify(p)).not.toBeNull();
	});

	it('rejects malformed medications', () => {
		const long = 'x'.repeat(101);
		const bad: unknown[] = [
			merge({ name: '' }),
			merge({ name: '   ' }),
			merge({ name: long }),
			merge({ strength: -1 }),
			merge({ strength: Number.NaN }),
			merge({ strength: '20' }),
			merge({ unit: 'x'.repeat(41) }),
			merge({ form: 'syrup' }),
			merge({ schedule: { kind: 'hourly' } }),
			merge({ schedule: { kind: 'weekdays', days: [] } }),
			merge({ schedule: { kind: 'weekdays', days: [7] } }),
			merge({ schedule: { kind: 'weekdays', days: [1, 1] } }),
			merge({ schedule: { kind: 'every_n_days', n: 1, from: '2026-10-01' } }),
			merge({ schedule: { kind: 'every_n_days', n: 3, from: '2026-02-30' } }),
			merge({ times: [] }),
			merge({ schedule: { kind: 'as_needed' } }),
			merge({ times: [{ time: '8:00', amount: 'x' }] }),
			merge({ times: [{ time: '24:00', amount: 'x' }] }),
			merge({ times: [{ time: '08:00', amount: long }] }),
			merge({ times: Array.from({ length: 13 }, () => ({ time: '08:00', amount: 'x' })) }),
			merge({ start: '2026-13-01' }),
			merge({ start: undefined }),
			merge({ end: '2026-10-17' }),
			merge({ end: 'later' }),
			merge({ reminders: 'yes' }),
			merge({ archived: undefined }),
			merge({ note: 'x'.repeat(2001) })
		];
		for (const p of bad) expect(parsePayload(p), JSON.stringify(p)).toBeNull();
	});
});
