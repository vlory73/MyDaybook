import { describe as suite, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { describe } from './format';
import type { TimedPayload } from './types';

const rec = (typeId: string, values: number[], unit: string): StoredRecord<TimedPayload> => ({
	id: 'r1',
	rev: 1,
	updatedAt: 1,
	payload: { v: 1, type: 'measurement', at: '2026-10-18T08:10:00+02:00', typeId, values, unit, context: [] }
});

suite('timeline text for measurements', () => {
	it('reads "Blood pressure 128/82 mmHg" and "Pulse 64 bpm"', () => {
		expect(describe(rec('blood_pressure', [128, 82], 'mmHg')).title).toBe('Blood pressure 128/82 mmHg');
		expect(describe(rec('pulse', [64], 'bpm')).title).toBe('Pulse 64 bpm');
		expect(describe(rec('pulse', [64], 'bpm')).category).toBe('measure');
	});
});
