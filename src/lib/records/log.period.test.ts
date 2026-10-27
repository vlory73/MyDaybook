import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { againOptions, againPayload } from './log';
import type { Payload } from './types';

// Synthetic data only.
const rec = (id: string, payload: Payload): StoredRecord =>
	({ id, rev: 1, updatedAt: 1, payload }) as StoredRecord;
const now = new Date(2026, 9, 27, 9, 41);
const yesterday = rec('y', {
	v: 1,
	type: 'period',
	at: '2026-10-26T08:00:00+01:00',
	flow: 'light',
	extras: ['cramps'],
	note: 'private'
});

describe('"Period as yesterday" in the Again? row', () => {
	it('is offered when yesterday has an entry and today has none', () => {
		const options = againOptions([yesterday], now);
		expect(options.map((o) => o.kind)).toEqual(['period']);
	});

	it('is not offered when today already has one, or yesterday has none', () => {
		const today = rec('t', { v: 1, type: 'period', at: '2026-10-27T07:00:00+01:00', flow: 'heavy' });
		expect(againOptions([yesterday, today], now)).toEqual([]);
		expect(againOptions([], now)).toEqual([]);
	});

	it('saves yesterday’s flow and extras for today, without the note', () => {
		const option = againOptions([yesterday], now)[0]!;
		const payload = againPayload(option, now);
		expect(payload).toMatchObject({ type: 'period', flow: 'light', extras: ['cramps'] });
		expect(payload && 'note' in payload).toBe(false);
		expect((payload as { at: string }).at.startsWith('2026-10-27T09:41')).toBe(true);
	});
});
