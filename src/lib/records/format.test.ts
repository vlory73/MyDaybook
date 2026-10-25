import { describe as suite, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { describe } from './format';
import { setLocale } from '../i18n/index.svelte';
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

suite('timeline text for sleep', () => {
	const sleepRec = (extra: Record<string, unknown>): StoredRecord<TimedPayload> => ({
		id: 's1',
		rev: 1,
		updatedAt: 1,
		payload: {
			v: 1,
			type: 'sleep',
			asleepAt: '2026-10-18T13:20:00+02:00',
			at: '2026-10-18T14:05:00+02:00',
			...extra
		} as TimedPayload
	});
	it('reads "Nap 45 min" with the clock times and the quality when set', () => {
		const d = describe(sleepRec({ kind: 'nap' }));
		expect(d.title).toBe('Nap 45 min');
		expect(d.summary).toBe('13:20 to 14:05');
		expect(d.nap).toBe(true);
		expect(describe(sleepRec({ kind: 'nap', quality: 4 })).summary).toBe('13:20 to 14:05 · Quality 4');
	});
	it('keeps nights as they were', () => {
		const d = describe(sleepRec({ asleepAt: '2026-10-17T23:50:00+02:00', at: '2026-10-18T07:10:00+02:00' }));
		expect(d.title).toBe('Slept 7 h 20 min');
		expect(d.nap).toBeUndefined();
	});
});

suite('timeline tags for watch-list items', () => {
	const food: StoredRecord<TimedPayload> = {
		id: 'f1',
		rev: 1,
		updatedAt: 1,
		payload: {
			v: 1,
			type: 'food',
			at: '2026-10-18T08:10:00+02:00',
			meal: 'lunch',
			text: 'Soup',
			tags: [],
			exposures: [
				{ id: 'g', state: 'no' },
				{ id: 'l', state: 'yes' },
				{ id: 'm', state: 'unsure' }
			]
		} as TimedPayload
	};
	const names = { sensitivity: (id: string) => ({ g: 'Gluten', l: 'Lactose', m: 'Milk' })[id] };
	it('keeps the capital in English and lowercases mid-sentence names in Danish', () => {
		try {
			setLocale('en');
			expect(describe(food, names).tags).toEqual(['Gluten-free', 'Contains lactose', 'Maybe milk']);
			setLocale('da');
			expect(describe(food, names).tags).toEqual(['Uden gluten', 'Indeholder lactose', 'Måske milk']);
		} finally {
			setLocale('en');
		}
	});
});
