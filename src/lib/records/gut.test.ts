import { describe, expect, it } from 'vitest';
import { parsePayload } from './types';

// Synthetic data only.
const at = '2026-10-18T08:10:00+02:00';
const gut = (extra: Record<string, unknown>) => ({
	v: 1,
	type: 'gut',
	at,
	symptoms: [{ kind: 'nausea', intensity: 3 }],
	flags: [],
	...extra
});

describe('gut payload', () => {
	it('accepts nausea, heartburn or both, with context flags and a note', () => {
		expect(parsePayload(gut({}))).not.toBeNull();
		expect(parsePayload(gut({ symptoms: [{ kind: 'heartburn', intensity: 1 }] }))).not.toBeNull();
		const both = gut({
			symptoms: [
				{ kind: 'nausea', intensity: 3 },
				{ kind: 'heartburn', intensity: 5 }
			],
			flags: ['vomited', 'after_meal', 'lying_down', 'at_night'],
			note: 'Synthetic note'
		});
		expect(parsePayload(both)).not.toBeNull();
	});

	it('rejects a missing, empty, duplicate or unknown symptom', () => {
		expect(parsePayload(gut({ symptoms: [] }))).toBeNull();
		expect(parsePayload(gut({ symptoms: undefined }))).toBeNull();
		expect(
			parsePayload(
				gut({
					symptoms: [
						{ kind: 'nausea', intensity: 2 },
						{ kind: 'nausea', intensity: 3 }
					]
				})
			)
		).toBeNull();
		expect(parsePayload(gut({ symptoms: [{ kind: 'cough', intensity: 2 }] }))).toBeNull();
	});

	it('rejects a bad intensity', () => {
		for (const intensity of [0, 6, 2.5, '3', undefined]) {
			expect(parsePayload(gut({ symptoms: [{ kind: 'nausea', intensity }] })), String(intensity)).toBeNull();
		}
	});

	it('rejects "vomited" without nausea, and unknown flags', () => {
		const heartburn = [{ kind: 'heartburn', intensity: 2 }];
		expect(parsePayload(gut({ symptoms: heartburn, flags: ['vomited'] }))).toBeNull();
		expect(parsePayload(gut({ symptoms: heartburn, flags: ['after_meal'] }))).not.toBeNull();
		expect(parsePayload(gut({ flags: ['nonsense'] }))).toBeNull();
	});

	it('rejects an oversize note and a missing time', () => {
		expect(parsePayload(gut({ note: 'x'.repeat(2000) }))).not.toBeNull();
		expect(parsePayload(gut({ note: 'x'.repeat(2001) }))).toBeNull();
		expect(parsePayload(gut({ at: 'yesterday' }))).toBeNull();
	});
});
