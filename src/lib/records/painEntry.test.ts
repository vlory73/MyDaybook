import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import type { PainPayload, PainPoint } from './pain';
import {
	DISMISS_KEY,
	copyPoints,
	highestPoint,
	latestPain,
	painSummary,
	readDismissed,
	stillThere,
	writeDismissed
} from './painEntry';
import { parsePayload, type Payload } from './types';

// Synthetic data only.
const point = (extra: Partial<PainPoint> = {}): PainPoint => ({
	region: 'knee',
	side: 'right',
	space: '2d-front-v1',
	u: 0.42,
	v: 0.61,
	intensity: 6,
	qualities: ['aching'],
	...extra
});
const pain = (points: PainPoint[], at = '2026-10-18T08:10:00+02:00', extra: Partial<PainPayload> = {}) =>
	({ v: 1, type: 'pain', at, points, ...extra }) as PainPayload;
const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord => ({
	id,
	rev: 1,
	updatedAt,
	payload
});

const three = [
	point(),
	point({ region: 'shoulder', side: 'left', intensity: 3, qualities: [] }),
	point({ region: 'lower_back', side: 'midline', space: '2d-back-v1', intensity: 4 })
];

describe('body map entries in the store', () => {
	it('parsePayload accepts a pain entry and keeps unknown shapes out', () => {
		expect(parsePayload(pain([point()]))).not.toBeNull();
		expect(parsePayload(pain([point()], undefined, { note: 'x' }))?.type).toBe('pain');
		expect(parsePayload({ ...pain([point()]), points: [] })).toBeNull();
		expect(parsePayload({ ...pain([point()]), points: [point({ intensity: 11 })] })).toBeNull();
		expect(parsePayload({ ...pain([point()]), points: [point({ side: 'midline' })] })).toBeNull();
		expect(parsePayload({ ...pain([point()]), at: 'yesterday' })).toBeNull();
	});
});

describe('painSummary', () => {
	it('names the place and the number, in the person own sides', () => {
		expect(painSummary('en', [point(), point({ region: 'shoulder', side: 'left', intensity: 3 })])).toBe(
			'Your right knee 6 · Your left shoulder 3'
		);
		expect(painSummary('en', [point({ region: 'lower_back', side: 'midline', space: '2d-back-v1' })])).toBe(
			'Lower back 6'
		);
	});

	it('shows 0 as a number and keeps the order the points were placed in', () => {
		expect(painSummary('en', [point({ intensity: 0 }), point({ side: 'left', intensity: 9 })])).toBe(
			'Your right knee 0 · Your left knee 9'
		);
	});

	it('truncates after three points with "+N more"', () => {
		expect(painSummary('en', three)).toBe('Your right knee 6 · Your left shoulder 3 · Lower back 4');
		const five = [
			...three,
			point({ region: 'foot', side: 'left' }),
			point({ region: 'foot', side: 'right' })
		];
		expect(painSummary('en', five)).toBe('Your right knee 6 · Your left shoulder 3 · Lower back 4 · +2 more');
	});

	it('speaks Danish', () => {
		const five = [
			...three,
			point({ region: 'foot', side: 'left' }),
			point({ region: 'foot', side: 'right' })
		];
		expect(painSummary('da', five)).toBe('Dit højre knæ 6 · Din venstre skulder 3 · Lænd 4 · +2 flere');
	});
});

describe('Same as last time', () => {
	it('copies regions, sides, positions, qualities, notes and intensities, as new objects', () => {
		const previous = pain([
			point({ note: 'after a walk', qualities: ['numb', 'itchy'] }),
			point({ side: 'left' })
		]);
		const copy = copyPoints(previous);
		expect(copy).toEqual(previous.points);
		expect(copy[0]).not.toBe(previous.points[0]);
		copy[0]!.qualities.push('dull');
		copy[0]!.intensity = 2;
		expect(previous.points[0]!.qualities).toEqual(['numb', 'itchy']);
		expect(previous.points[0]!.intensity).toBe(6);
	});

	it('does not invent a note, and leaves the time and entry note behind', () => {
		const copy = copyPoints(pain([point()], '2026-10-01T08:00:00+02:00', { note: 'entry note' }));
		expect(Object.hasOwn(copy[0]!, 'note')).toBe(false);
		expect(JSON.stringify(copy)).not.toContain('entry note');
		expect(JSON.stringify(copy)).not.toContain('2026-10-01');
	});

	it('uses the latest entry by its time, the later edit winning a tie', () => {
		const a = rec('a', pain([point()], '2026-10-10T08:00:00+02:00'));
		const b = rec('b', pain([point({ side: 'left' })], '2026-10-12T08:00:00+02:00'), 1);
		const c = rec('c', pain([point({ intensity: 1 })], '2026-10-12T08:00:00+02:00'), 5);
		const other = rec('n', { v: 1, type: 'note', at: '2026-10-15T08:00:00+02:00', text: 'x', tags: [] });
		expect(latestPain([a, b, other])?.id).toBe('b');
		expect(latestPain([a, b, c, other])?.id).toBe('c');
		expect(latestPain([other])).toBeUndefined();
		expect(latestPain([])).toBeUndefined();
	});
});

describe('Still there?', () => {
	// Local noon on 2026-10-19; entries are written with the device's own offset, as the app does.
	const now = new Date(2026, 9, 19, 12, 0);
	const at = (dayOffset: number, hour = 9) => {
		const d = new Date(2026, 9, 19 + dayOffset, hour, 0);
		const off = -d.getTimezoneOffset();
		const pad = (n: number) => String(n).padStart(2, '0');
		const sign = off < 0 ? '-' : '+';
		const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00:00`;
		return `${stamp}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
	};

	it('names the highest point and counts the others', () => {
		const r = rec('a', pain(three, at(-1)));
		expect(stillThere([r], now, null)).toEqual({ id: 'a', point: three[0], more: 2, daysAgo: 1 });
		expect(
			highestPoint([point({ intensity: 2 }), point({ intensity: 8 }), point({ intensity: 8, side: 'left' })])
				.side
		).toBe('right');
		expect(highestPoint([point({ intensity: 0 })]).intensity).toBe(0);
	});

	it('shows for today, yesterday and two days ago, and not for older entries', () => {
		const days = (n: number) => stillThere([rec('a', pain([point()], at(n)))], now, null)?.daysAgo;
		expect(days(0)).toBe(0);
		expect(days(-1)).toBe(1);
		expect(days(-2)).toBe(2);
		expect(days(-3)).toBeUndefined();
		expect(stillThere([rec('a', pain([point()], at(-3, 23)))], now, null)).toBeNull();
	});

	it('looks only at the latest entry, and at nothing when there is none', () => {
		const old = rec('old', pain([point()], at(-1)));
		const older = rec('older', pain([point()], at(-5)));
		expect(stillThere([older], now, null)).toBeNull();
		expect(stillThere([older, old], now, null)?.id).toBe('old');
		expect(stillThere([], now, null)).toBeNull();
	});

	it('is hidden for a dismissed entry until a newer entry exists', () => {
		const a = rec('a', pain([point()], at(-1)));
		expect(stillThere([a], now, 'a')).toBeNull();
		expect(stillThere([a], now, 'other')?.id).toBe('a');
		const b = rec('b', pain([point({ intensity: 2 })], at(0, 8)));
		expect(stillThere([a, b], now, 'a')?.id).toBe('b');
	});

	it('ignores entries from the future', () => {
		expect(stillThere([rec('a', pain([point()], at(1)))], now, null)).toBeNull();
	});
});

describe('dismissal storage', () => {
	const fake = () => {
		const data = new Map<string, string>();
		return {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v),
			data
		};
	};

	it('remembers only the entry id', () => {
		const s = fake();
		expect(readDismissed(s)).toBeNull();
		writeDismissed(s, 'abc');
		expect(readDismissed(s)).toBe('abc');
		expect([...s.data.entries()]).toEqual([[DISMISS_KEY, 'abc']]);
	});

	it('works without storage or when it throws', () => {
		expect(readDismissed(undefined)).toBeNull();
		expect(() => writeDismissed(undefined, 'a')).not.toThrow();
		const broken = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		};
		expect(readDismissed(broken)).toBeNull();
		expect(() => writeDismissed(broken, 'a')).not.toThrow();
	});
});

describe('summary of close-ups and wider areas', () => {
	const at = (region: PainPoint['region'], side: PainPoint['side'], space: PainPoint['space'], n: number) =>
		point({ region, side, space, intensity: n, u: 0.5, v: 0.5 });

	it('names wider areas and close-up parts in both languages', () => {
		const points = [
			at('belly', 'midline', '2d-front-v1', 5),
			at('upper_belly', 'midline', '2d-front-v1', 4),
			at('back', 'midline', '2d-back-v1', 3)
		];
		expect(painSummary('en', points)).toBe('Whole belly 5 · Upper belly 4 · Whole back 3');
		expect(painSummary('da', points)).toBe('Hele maven 5 · Øvre mave 4 · Hele ryggen 3');
		const zoomed = [
			at('temple', 'left', '2d-head-v1', 2),
			at('thumb', 'right', '2d-hand-v1', 7),
			at('sole', 'left', '2d-foot-v1', 1)
		];
		expect(painSummary('en', zoomed)).toBe(
			'Your left temple 2 · Your right thumb 7 · Sole of your left foot 1'
		);
		expect(painSummary('da', zoomed.slice(0, 2))).toBe('Din venstre tinding 2 · Din højre tommelfinger 7');
	});

	it('copies close-up and wider points for "Same as last time"', () => {
		const prev = pain([at('belly', 'midline', '2d-front-v1', 5), at('thumb', 'left', '2d-hand-v1', 3)]);
		expect(copyPoints(prev)).toEqual(prev.points);
		expect(parsePayload(prev)).not.toBeNull();
	});
});
