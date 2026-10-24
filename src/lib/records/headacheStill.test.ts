import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { isHeadacheDetails, isOpenHeadache } from './headache';
import {
	NOT_NOW_KEY,
	REST_HOURS,
	floorHour,
	headacheCard,
	hourOf,
	isResting,
	openHeadache,
	readNotNow,
	stopChoices,
	stopOk,
	withLastSeen,
	withStopped,
	writeNotNow
} from './headacheStill';
import type { PainPayload, PainPoint } from './pain';
import { stillThere } from './painEntry';
import { formatAt, timeOf } from './time';
import type { Payload } from './types';

// Synthetic data only. Times are built from local dates so the tests do not depend on the machine's time zone.
const NOW = new Date(2026, 9, 23, 17, 20); // Fri 23 Oct, 17:20
const local = (day: number, hour: number, minute = 0) => formatAt(new Date(2026, 9, day, hour, minute));
const head = (intensity: number): PainPoint => ({
	region: 'temple',
	side: 'left',
	space: '2d-head-front-v2',
	u: 0.5,
	v: 0.5,
	intensity,
	qualities: ['throbbing']
});
const knee = (intensity = 4): PainPoint => ({
	region: 'knee',
	side: 'right',
	space: '2d-front-v1',
	u: 0.4,
	v: 0.6,
	intensity,
	qualities: ['aching']
});
const pain = (at: string, points: PainPoint[], headache?: object) =>
	({ v: 1, type: 'pain', at, points, ...(headache ? { headache } : {}) }) as unknown as PainPayload;
const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord => ({
	id,
	rev: 1,
	updatedAt,
	payload
});

describe('open headache selection', () => {
	it('is a headache entry without a stop time (a legacy stillGoing reads the same)', () => {
		expect(isOpenHeadache(pain(local(23, 14), [head(5)]))).toBe(true);
		expect(isOpenHeadache(pain(local(23, 14), [knee()], { started: local(23, 14) }))).toBe(true);
		expect(isOpenHeadache(pain(local(23, 14), [knee()]))).toBe(false);
		expect(isOpenHeadache(pain(local(23, 14), [head(5)], { stillGoing: true }))).toBe(true);
		expect(isOpenHeadache(pain(local(23, 14), [head(5)], { stopped: local(23, 16) }))).toBe(false);
	});

	it('picks the most recent open headache, with its start and strongest head point', () => {
		const a = rec('a', pain(local(22, 9), [head(8)]));
		const b = rec('b', pain(local(23, 14), [head(3), head(6), knee(9)]));
		const open = openHeadache([a, b], NOW)!;
		expect(open.id).toBe('b');
		expect(open.strongest).toBe(6);
		expect(open.daysAgo).toBe(0);
		expect(timeOf(open.start)).toBe('14:00');
	});

	it('uses the entered start, else the time of the entry', () => {
		const e = rec('e', pain(local(23, 9), [head(5)], { started: local(22, 22) }));
		const open = openHeadache([e], NOW)!;
		expect(open.daysAgo).toBe(1);
		expect(timeOf(open.start)).toBe('22:00');
	});

	it('still names the headache when other pain was logged after it', () => {
		const h = rec('h', pain(local(23, 9), [head(6)]));
		const k = rec('k', pain(local(23, 15), [knee()]));
		expect(openHeadache([h, k], NOW)?.id).toBe('h');
		// ... and the general card follows the knee entry, not the open headache
		expect(stillThere([h, k], NOW, null)?.id).toBe('k');
		expect(stillThere([h], NOW, null)).toBeNull();
	});

	it('lets the general card follow a headache once it has a stop time', () => {
		const h = rec('h', pain(local(23, 9), [head(6)], { stopped: local(23, 12) }));
		expect(openHeadache([h], NOW)).toBeNull();
		expect(stillThere([h], NOW, null)?.id).toBe('h');
	});

	it('ignores headaches older than two calendar days and ones in the future', () => {
		expect(openHeadache([rec('a', pain(local(20, 23), [head(5)]))], NOW)).toBeNull();
		expect(openHeadache([rec('a', pain(local(21, 0), [head(5)]))], NOW)?.daysAgo).toBe(2);
		expect(openHeadache([rec('a', pain(local(23, 19), [head(5)]))], NOW)).toBeNull();
	});

	it('has no strongest value for a ticked headache without a head point', () => {
		const e = rec('e', pain(local(23, 9), [knee()], {}));
		expect(openHeadache([e], NOW)?.strongest).toBeNull();
	});
});

describe('resting and Not now', () => {
	const open = rec('h', pain(local(23, 9), [head(5)]));

	it('rests for three hours counted from the noted hour', () => {
		expect(REST_HOURS).toBe(3);
		const seen = withLastSeen(open.payload as PainPayload, hourOf(NOW)); // 17:00
		expect(isResting(seen, NOW)).toBe(true);
		expect(isResting(seen, new Date(2026, 9, 23, 19, 59))).toBe(true);
		expect(isResting(seen, new Date(2026, 9, 23, 20, 0))).toBe(false);
		expect(isResting(open.payload as PainPayload, NOW)).toBe(false);
		expect(headacheCard([{ ...open, payload: seen }], NOW, null)).toBeNull();
		expect(headacheCard([{ ...open, payload: seen }], new Date(2026, 9, 23, 20, 5), null)?.id).toBe('h');
	});

	it('Not now hides the card for that entry today only', () => {
		const today = '2026-10-23';
		expect(headacheCard([open], NOW, null)?.id).toBe('h');
		expect(headacheCard([open], NOW, { id: 'h', day: today })).toBeNull();
		expect(headacheCard([open], NOW, { id: 'h', day: '2026-10-22' })?.id).toBe('h');
		expect(headacheCard([open], NOW, { id: 'other', day: today })?.id).toBe('h');
	});

	it('stops showing once the headache is older than the window, with nothing written', () => {
		const old = rec('o', pain(local(19, 9), [head(5)]));
		expect(headacheCard([old], NOW, null)).toBeNull();
	});

	it('keeps only an id and a day on the device', () => {
		const data: Record<string, string> = {};
		const storage = {
			getItem: (k: string) => data[k] ?? null,
			setItem: (k: string, v: string) => void (data[k] = v)
		};
		expect(readNotNow(storage)).toBeNull();
		writeNotNow(storage, { id: 'h', day: '2026-10-23' });
		expect(Object.keys(data)).toEqual([NOT_NOW_KEY]);
		expect(readNotNow(storage)).toEqual({ id: 'h', day: '2026-10-23' });
		data[NOT_NOW_KEY] = 'nonsense';
		expect(readNotNow(storage)).toBeNull();
		expect(readNotNow(undefined)).toBeNull();
	});
});

describe('stop hours', () => {
	it('offers now, then up to three earlier hours, never before the start', () => {
		const chips = stopChoices(local(23, 14), NOW).map(timeOf);
		expect(chips).toEqual(['17:00', '16:00', '15:00', '14:00']);
		expect(stopChoices(local(23, 16), NOW).map(timeOf)).toEqual(['17:00', '16:00']);
		expect(stopChoices(local(23, 17), NOW).map(timeOf)).toEqual(['17:00']);
		expect(stopChoices(local(23, 9), NOW)).toHaveLength(4);
	});

	it('treats a start in the middle of an hour as that hour', () => {
		const start = local(23, 16, 40);
		expect(timeOf(floorHour(start))).toBe('16:00');
		expect(stopChoices(start, NOW).map(timeOf)).toEqual(['17:00', '16:00']);
		expect(stopOk(start, hourOf(new Date(2026, 9, 23, 16, 50)), new Date(2026, 9, 23, 16, 50))).toBe(true);
	});

	it('accepts a stop from the start hour to the current hour only', () => {
		const start = local(23, 14);
		expect(stopOk(start, local(23, 14), NOW)).toBe(true);
		expect(stopOk(start, local(23, 17), NOW)).toBe(true);
		expect(stopOk(start, local(23, 13), NOW)).toBe(false);
		expect(stopOk(start, local(23, 18), NOW)).toBe(false);
	});

	it('writes the stop on the same entry and drops the old flags', () => {
		const p = pain(local(23, 14), [head(5)], {
			started: local(23, 14),
			stillGoing: true,
			lastSeen: local(23, 15),
			trigger: 'Poor sleep'
		});
		const done = withStopped(p, local(23, 17));
		expect(done.headache).toEqual({ started: local(23, 14), stopped: local(23, 17), trigger: 'Poor sleep' });
		expect(done.points).toBe(p.points);
		expect(withStopped(pain(local(23, 14), [head(5)]), local(23, 17)).headache).toEqual({
			stopped: local(23, 17)
		});
	});

	it('writes the noted hour without touching anything else', () => {
		const p = pain(local(23, 14), [head(5)], { started: local(23, 14), trigger: 'x' });
		expect(withLastSeen(p, local(23, 17)).headache).toEqual({
			started: local(23, 14),
			trigger: 'x',
			lastSeen: local(23, 17)
		});
	});
});

describe('lastSeen in the record', () => {
	const started = '2026-10-18T14:00:00+02:00';
	it('is an hour, not before the start', () => {
		expect(isHeadacheDetails({ started, lastSeen: '2026-10-18T17:00:00+02:00' })).toBe(true);
		expect(isHeadacheDetails({ started, lastSeen: started })).toBe(true);
		expect(isHeadacheDetails({ lastSeen: '2026-10-18T17:00:00+02:00' })).toBe(true);
		expect(isHeadacheDetails({ started, lastSeen: '2026-10-18T13:00:00+02:00' })).toBe(false);
		expect(isHeadacheDetails({ started, lastSeen: '2026-10-18T17:30:00+02:00' })).toBe(false);
		expect(isHeadacheDetails({ started, lastSeen: 'later' })).toBe(false);
	});
});
