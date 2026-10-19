import { describe, expect, it } from 'vitest';
import { CATCH_UP_MINUTES, dueKeys, localParts, parseSchedule, type PushSchedule } from './schedule';

const at = (iso: string) => new Date(iso);
const daily = (tz: string, ...times: string[]): PushSchedule => ({
	tz,
	slots: times.map((time) => ({ time, days: [0, 1, 2, 3, 4, 5, 6] }))
});

describe('parseSchedule', () => {
	it('accepts a schedule and puts it in canonical form', () => {
		expect(
			parseSchedule({
				tz: 'Europe/Copenhagen',
				slots: [
					{ time: '20:00', days: [3, 1, 1] },
					{ time: '08:00', days: [0, 1] },
					{ time: '08:00', days: [1, 0] }
				]
			})
		).toEqual({
			tz: 'Europe/Copenhagen',
			slots: [
				{ time: '08:00', days: [0, 1] },
				{ time: '20:00', days: [1, 3] }
			]
		});
		expect(parseSchedule({ tz: 'UTC', slots: [] })).toEqual({ tz: 'UTC', slots: [] });
	});

	it('rejects bad shapes', () => {
		const ok = { time: '08:00', days: [1] };
		for (const bad of [
			null,
			[],
			'x',
			{ slots: [] },
			{ tz: 'Mars/Olympus', slots: [] },
			{ tz: 'UTC' },
			{ tz: 'UTC', slots: [{ time: '8:00', days: [1] }] },
			{ tz: 'UTC', slots: [{ time: '24:00', days: [1] }] },
			{ tz: 'UTC', slots: [{ time: '08:60', days: [1] }] },
			{ tz: 'UTC', slots: [{ time: '08:00', days: [] }] },
			{ tz: 'UTC', slots: [{ time: '08:00', days: [7] }] },
			{ tz: 'UTC', slots: [{ time: '08:00', days: [1.5] }] },
			{ tz: 'UTC', slots: [{ time: '08:00', days: ['1'] }] },
			{ tz: 'UTC', slots: Array.from({ length: 101 }, () => ok) }
		]) {
			expect(parseSchedule(bad), JSON.stringify(bad)).toBeNull();
		}
	});
});

describe('localParts', () => {
	it('gives the wall clock and weekday of the time zone', () => {
		// 2026-10-19 is a Monday; Copenhagen is UTC+2 until 25 October.
		expect(localParts(at('2026-10-19T22:30:00Z'), 'Europe/Copenhagen')).toEqual({
			date: '2026-10-20',
			time: '00:30',
			weekday: 2
		});
		expect(localParts(at('2026-10-19T22:30:00Z'), 'America/New_York')).toEqual({
			date: '2026-10-19',
			time: '18:30',
			weekday: 1
		});
	});
});

describe('dueKeys', () => {
	const cph = daily('Europe/Copenhagen', '08:00');

	it('fires in the minute of the slot, in the schedule time zone', () => {
		expect(dueKeys(cph, at('2026-10-19T06:00:30Z'), []).due).toEqual(['2026-10-19T08:00']);
		expect(dueKeys(cph, at('2026-10-19T08:00:00Z'), []).due).toEqual([]); // 10:00 in Copenhagen
		expect(dueKeys(cph, at('2026-10-19T05:59:59Z'), []).due).toEqual([]);
	});

	it('only on the chosen weekdays', () => {
		const mondays: PushSchedule = { tz: 'UTC', slots: [{ time: '08:00', days: [1] }] };
		expect(dueKeys(mondays, at('2026-10-19T08:00:00Z'), []).due).toHaveLength(1); // Monday
		expect(dueKeys(mondays, at('2026-10-20T08:00:00Z'), []).due).toHaveLength(0);
	});

	it('uses the local weekday, which can differ from the UTC one', () => {
		const tuesdays: PushSchedule = { tz: 'Pacific/Auckland', slots: [{ time: '07:00', days: [2] }] };
		// 2026-10-19T18:00Z is Tuesday 07:00 in Auckland (NZDT, UTC+13), while it is still Monday in UTC.
		expect(dueKeys(tuesdays, at('2026-10-19T18:00:00Z'), []).due).toEqual(['2026-10-20T07:00']);
	});

	it('catches up for a few minutes after the slot, then gives up', () => {
		expect(dueKeys(cph, at('2026-10-19T06:05:10Z'), []).due).toHaveLength(1);
		expect(CATCH_UP_MINUTES).toBe(5);
		expect(dueKeys(cph, at('2026-10-19T06:06:00Z'), []).due).toEqual([]);
	});

	it('fires each slot once per day (dedupe by local date and slot)', () => {
		const first = dueKeys(cph, at('2026-10-19T06:00:00Z'), []);
		expect(first.due).toEqual(['2026-10-19T08:00']);
		for (const minute of ['06:01', '06:02', '06:05']) {
			expect(dueKeys(cph, at(`2026-10-19T${minute}:00Z`), first.due).due).toEqual([]);
		}
		// The next day is a new key.
		expect(dueKeys(cph, at('2026-10-20T06:00:00Z'), first.due).due).toEqual(['2026-10-20T08:00']);
	});

	it('reports the whole window so old keys can be forgotten', () => {
		const r = dueKeys(cph, at('2026-10-19T06:02:00Z'), ['2026-10-19T08:00']);
		expect(r.due).toEqual([]);
		expect(r.window).toEqual(['2026-10-19T08:00']);
		expect(dueKeys(cph, at('2026-10-19T07:00:00Z'), ['2026-10-19T08:00']).window).toEqual([]);
	});

	it('handles several slots, including two inside one catch-up window', () => {
		const s = daily('UTC', '08:00', '08:03');
		expect(dueKeys(s, at('2026-10-19T08:04:00Z'), []).due.sort()).toEqual([
			'2026-10-19T08:00',
			'2026-10-19T08:03'
		]);
		expect(dueKeys(s, at('2026-10-19T08:04:00Z'), ['2026-10-19T08:00']).due).toEqual(['2026-10-19T08:03']);
	});

	describe('daylight saving time', () => {
		it('a time that is skipped in spring does not fire (Europe/Copenhagen, 2026-03-29, 02:30 does not exist)', () => {
			const s = daily('Europe/Copenhagen', '02:30');
			// 01:30Z is 03:30 local after the jump; 00:30Z is 01:30 local. 02:30 never appears.
			for (const t of ['00:30', '01:00', '01:30', '01:35', '02:30']) {
				expect(dueKeys(s, at(`2026-03-29T${t}:00Z`), []).due, t).toEqual([]);
			}
			// The day before and after are unaffected.
			expect(dueKeys(s, at('2026-03-28T01:30:00Z'), []).due).toHaveLength(1);
			expect(dueKeys(s, at('2026-03-30T00:30:00Z'), []).due).toHaveLength(1);
		});

		it('a time that happens twice in autumn fires once (2026-10-25, 02:30 local at 00:30Z and 01:30Z)', () => {
			const s = daily('Europe/Copenhagen', '02:30');
			const first = dueKeys(s, at('2026-10-25T00:30:00Z'), []);
			expect(first.due).toEqual(['2026-10-25T02:30']);
			// An hour later the wall clock shows 02:30 again; the key is the same, so nothing more is due.
			expect(dueKeys(s, at('2026-10-25T01:30:00Z'), first.due).due).toEqual([]);
		});

		it('a slot after the change fires at the right instant (08:00 on the day clocks go back)', () => {
			const s = daily('Europe/Copenhagen', '08:00');
			expect(dueKeys(s, at('2026-10-25T07:00:00Z'), []).due).toEqual(['2026-10-25T08:00']); // UTC+1 now
			expect(dueKeys(s, at('2026-10-25T06:00:00Z'), []).due).toEqual([]);
		});
	});
});
