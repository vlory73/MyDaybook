import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import {
	bladderSummary,
	hasBladderData,
	lastVisitOnDay,
	repeatVisit,
	visitsOnDay,
	type BladderPayload
} from './bladder';
import { parsePayload, type Payload } from './types';

// Synthetic data only.
const at = (day: string, time = '08:10') => `${day}T${time}:00+02:00`;
const bladder = (day: string, time: string, extra: Partial<BladderPayload> = {}): BladderPayload => ({
	v: 1,
	type: 'bladder',
	at: at(day, time),
	visit: true,
	...extra
});
const rec = (id: string, payload: Payload): StoredRecord =>
	({ id, rev: 1, updatedAt: 1, payload }) as StoredRecord;

describe('bladder payload', () => {
	it('accepts a plain visit, a detailed visit and a leak on its own', () => {
		expect(parsePayload(bladder('2026-10-27', '09:00'))).not.toBeNull();
		expect(
			parsePayload(
				bladder('2026-10-27', '09:00', {
					urgency: 'strong',
					discomfort: true,
					leak: { amount: 3, when: 'moving' },
					note: 'Synthetic'
				})
			)
		).not.toBeNull();
		expect(
			parsePayload(bladder('2026-10-27', '09:00', { visit: false, leak: { amount: 1 } }))
		).not.toBeNull();
	});

	it('rejects a leak-only entry without a leak, and unknown or out-of-range values', () => {
		const base = bladder('2026-10-27', '09:00');
		expect(parsePayload(bladder('2026-10-27', '09:00', { visit: false }))).toBeNull();
		expect(parsePayload({ ...base, visit: 'yes' })).toBeNull();
		expect(parsePayload({ ...base, urgency: 'urgent' })).toBeNull();
		expect(parsePayload({ ...base, discomfort: false })).toBeNull();
		expect(parsePayload({ ...base, leak: { amount: 4 } })).toBeNull();
		expect(parsePayload({ ...base, leak: { amount: 2, when: 'sometimes' } })).toBeNull();
		expect(parsePayload({ ...base, note: 'x'.repeat(2001) })).toBeNull();
	});
});

describe('visits of a day', () => {
	const all = [
		rec('a', bladder('2026-10-27', '07:10')),
		rec('b', bladder('2026-10-27', '08:12', { urgency: 'some', leak: { amount: 2, when: 'afterwards' } })),
		rec('c', bladder('2026-10-27', '08:40', { visit: false, leak: { amount: 1, when: 'moving' } })),
		rec('d', bladder('2026-10-26', '23:50'))
	];
	it('counts visits only, never leak-only entries', () => {
		expect(visitsOnDay(all, '2026-10-27')).toBe(2);
		expect(visitsOnDay(all, '2026-10-26')).toBe(1);
		expect(visitsOnDay(all, '2026-10-25')).toBe(0);
	});
	it('finds the last visit by event time, ignoring a later leak-only entry', () => {
		expect(lastVisitOnDay(all, '2026-10-27')?.id).toBe('b');
		expect(lastVisitOnDay(all, '2026-10-25')).toBeUndefined();
	});
	it('repeats a visit at the new time with its details but not its note', () => {
		const copy = repeatVisit(
			bladder('2026-10-27', '08:12', {
				urgency: 'some',
				discomfort: true,
				leak: { amount: 2, when: 'afterwards' },
				note: 'private'
			}),
			at('2026-10-27', '09:41')
		);
		expect(copy).toEqual({
			v: 1,
			type: 'bladder',
			at: at('2026-10-27', '09:41'),
			visit: true,
			urgency: 'some',
			discomfort: true,
			leak: { amount: 2, when: 'afterwards' }
		});
		expect(parsePayload(copy)).not.toBeNull();
		const fromLeak = bladder('2026-10-27', '08:12', { visit: false, leak: { amount: 1 } });
		expect(repeatVisit(fromLeak, at('2026-10-27')).visit).toBe(true);
	});
});

describe('summary for Trends', () => {
	const all = [
		rec('a', bladder('2026-10-20', '07:10')),
		rec('b', bladder('2026-10-20', '12:00', { discomfort: true })),
		rec('c', bladder('2026-10-22', '09:00', { leak: { amount: 1, when: 'afterwards' } })),
		rec('d', bladder('2026-10-22', '10:00', { visit: false, leak: { amount: 2, when: 'moving' } })),
		rec('e', bladder('2026-10-23', '10:00', { visit: false, leak: { amount: 2, when: 'moving' } })),
		rec('f', bladder('2026-09-01', '10:00', { discomfort: true }))
	];
	it('lists days with a visit and counts days (not entries) with discomfort and leaks', () => {
		const s = bladderSummary(all, '2026-10-01', '2026-10-31');
		expect(s.days).toEqual([
			{ day: '2026-10-20', visits: 2 },
			{ day: '2026-10-22', visits: 1 }
		]);
		expect(s.daysWithDiscomfort).toBe(1);
		expect(s.daysWithLeak).toBe(2);
		expect(s.leakWhen).toEqual({ on_the_way: 0, afterwards: 1, moving: 2 });
	});
	it('leaves a day with only a leak out of the bars (a gap, never a zero)', () => {
		expect(bladderSummary(all, '2026-10-23', '2026-10-23').days).toEqual([]);
		expect(bladderSummary(all, '2026-10-23', '2026-10-23').daysWithLeak).toBe(1);
	});
	it('knows when the range holds any bladder entry', () => {
		expect(hasBladderData(all, '2026-10-23', '2026-10-23')).toBe(true);
		expect(hasBladderData(all, '2026-10-24', '2026-10-30')).toBe(false);
	});
});
