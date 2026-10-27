import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import {
	copyForToday,
	daysLogged,
	flowSize,
	periodByDay,
	periodCalendar,
	periodOnDay,
	yesterdayOffer,
	type PeriodPayload
} from './period';
import { weekStart } from './time';
import { parsePayload, type Payload } from './types';

// Synthetic data only.
const at = (day: string, time = '08:10') => `${day}T${time}:00+02:00`;
const period = (day: string, extra: Partial<PeriodPayload> = {}): PeriodPayload => ({
	v: 1,
	type: 'period',
	at: at(day),
	flow: 'medium',
	...extra
});
const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord =>
	({ id, rev: 1, updatedAt, payload }) as StoredRecord;

describe('period payload', () => {
	it('accepts the four flow steps, extras and a note', () => {
		for (const flow of ['spotting', 'light', 'medium', 'heavy'])
			expect(parsePayload({ ...period('2026-10-20'), flow })).not.toBeNull();
		expect(
			parsePayload(period('2026-10-20', { extras: ['cramps', 'clots', 'back_pain'], note: 'Synthetic' }))
		).not.toBeNull();
	});

	it('rejects an unknown flow, extra or duplicate extras, a missing flow and a bad time', () => {
		expect(parsePayload({ ...period('2026-10-20'), flow: 'none' })).toBeNull();
		expect(parsePayload({ ...period('2026-10-20'), flow: undefined })).toBeNull();
		expect(parsePayload({ ...period('2026-10-20'), extras: ['pain'] })).toBeNull();
		expect(parsePayload({ ...period('2026-10-20'), extras: ['cramps', 'cramps'] })).toBeNull();
		expect(parsePayload({ ...period('2026-10-20'), at: 'yesterday' })).toBeNull();
		expect(parsePayload({ ...period('2026-10-20'), note: 'x'.repeat(2001) })).toBeNull();
	});

	it('sizes the dots one to four, in the order of the steps', () => {
		expect((['spotting', 'light', 'medium', 'heavy'] as const).map(flowSize)).toEqual([1, 2, 3, 4]);
	});
});

describe('one entry per day', () => {
	const all = [
		rec('a', period('2026-10-20'), 1),
		rec('b', period('2026-10-20', { flow: 'heavy' }), 5),
		rec('c', period('2026-10-21', { flow: 'light' }), 1)
	];
	it('picks the most recently changed entry of a day', () => {
		expect(periodOnDay(all, '2026-10-20')?.id).toBe('b');
		expect(periodOnDay(all, '2026-10-22')).toBeUndefined();
		expect(periodByDay(all, '2026-10-01', '2026-10-31').get('2026-10-20')?.flow).toBe('heavy');
		expect(daysLogged(all, '2026-10-01', '2026-10-31')).toBe(2);
		expect(daysLogged(all, '2026-10-21', '2026-10-31')).toBe(1);
	});
});

describe('same as yesterday', () => {
	it('is offered only when yesterday has an entry and the day has none', () => {
		const y = rec('y', period('2026-10-26', { extras: ['cramps'], note: 'private' }));
		expect(yesterdayOffer([y], '2026-10-27')?.id).toBe('y');
		expect(yesterdayOffer([y, rec('t', period('2026-10-27'))], '2026-10-27')).toBeUndefined();
		expect(yesterdayOffer([y], '2026-10-28')).toBeUndefined();
		expect(yesterdayOffer([], '2026-10-27')).toBeUndefined();
	});

	it('copies the flow and extras but not the note', () => {
		const copy = copyForToday(
			period('2026-10-26', { extras: ['clots', 'cramps'], note: 'private' }),
			at('2026-10-27', '09:41')
		);
		expect(copy).toEqual({
			v: 1,
			type: 'period',
			at: at('2026-10-27', '09:41'),
			flow: 'medium',
			extras: ['cramps', 'clots']
		});
		expect(parsePayload(copy)).not.toBeNull();
		expect('extras' in copyForToday(period('2026-10-26'), at('2026-10-27'))).toBe(false);
	});
});

describe('calendar', () => {
	it('lays the days out in whole weeks, Monday first, and marks days with an entry', () => {
		const all = [
			rec('a', period('2026-10-22', { flow: 'light' })),
			rec('b', period('2026-10-27', { flow: 'heavy' }))
		];
		const weeks = periodCalendar(all, '2026-10-20', '2026-10-28', weekStart);
		expect(weeks).toHaveLength(2);
		expect(weeks[0]![0]!.day).toBe('2026-10-19');
		expect(weeks[0]![0]!.inRange).toBe(false);
		expect(weeks[0]![3]).toEqual({ day: '2026-10-22', inRange: true, flow: 'light' });
		expect(weeks[1]![1]).toEqual({ day: '2026-10-27', inRange: true, flow: 'heavy' });
		expect(weeks[1]![2]!.flow).toBeUndefined();
		expect(weeks.every((w) => w.length === 7)).toBe(true);
	});

	it('ignores entries outside the range and other record types', () => {
		const note = rec('n', { v: 1, type: 'note', at: at('2026-10-22'), text: 'x', tags: [] });
		const weeks = periodCalendar(
			[note, rec('a', period('2026-09-01'))],
			'2026-10-20',
			'2026-10-26',
			weekStart
		);
		expect(weeks.flat().some((c) => c.flow)).toBe(false);
	});
});
