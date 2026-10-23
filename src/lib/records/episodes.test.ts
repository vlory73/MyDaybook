import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import {
	chooserList,
	dayDots,
	dayNumber,
	daysBetween,
	episodeName,
	episodeOfEntry,
	episodeRange,
	episodeViews,
	formatDay,
	latestOngoing,
	mostLoggedPlace,
	overlapping,
	planJoin,
	withEnded,
	withEpisode,
	withName
} from './episodes';
import type { PainEpisodePayload, PainPayload, PainPoint } from './pain';
import { parsePayload, type Payload } from './types';

const point = (extra: Partial<PainPoint> = {}): PainPoint => ({
	region: 'knee',
	side: 'left',
	space: '2d-front-v1',
	u: 0.5,
	v: 0.5,
	intensity: 5,
	qualities: [],
	...extra
});
const rec = (id: string, payload: Payload): StoredRecord => ({ id, rev: 1, updatedAt: 1, payload });
const entry = (id: string, at: string, points: PainPoint[], episode?: string) =>
	rec(id, { v: 1, type: 'pain', at, points, ...(episode ? { episode } : {}) } as PainPayload);
const episode = (id: string, started: string, extra: Partial<PainEpisodePayload> = {}) =>
	rec(id, { v: 1, type: 'pain_episode', started, ...extra });

const TODAY = '2026-10-10';
const views = (all: StoredRecord[]) => episodeViews(all, 'en', TODAY);

describe('validators', () => {
	it('accepts an episode and an entry with a link, and rejects bad shapes', () => {
		expect(parsePayload({ v: 1, type: 'pain_episode', started: '2026-10-03T09:10:00+02:00' })).not.toBeNull();
		expect(
			parsePayload({
				v: 1,
				type: 'pain_episode',
				name: 'Knee',
				started: '2026-10-03T09:10:00+02:00',
				ended: '2026-10-09T08:00:00+02:00'
			})
		).not.toBeNull();
		expect(parsePayload({ v: 1, type: 'pain_episode', started: 'yesterday' })).toBeNull();
		expect(
			parsePayload({ v: 1, type: 'pain_episode', started: '2026-10-03T09:10:00+02:00', name: ' ' })
		).toBeNull();
		expect(
			parsePayload({ v: 1, type: 'pain_episode', started: '2026-10-03T09:10:00+02:00', ended: 'x' })
		).toBeNull();
		const base = { v: 1, type: 'pain', at: '2026-10-03T09:10:00+02:00', points: [point()] };
		expect(parsePayload({ ...base, episode: 'abc' })).not.toBeNull();
		expect(parsePayload(base)).not.toBeNull();
		expect(parsePayload({ ...base, episode: '' })).toBeNull();
		expect(parsePayload({ ...base, episode: 7 })).toBeNull();
	});
});

describe('naming', () => {
	it('uses the place logged most often, until the person renames it', () => {
		const entries = [
			entry('a', '2026-10-03T09:00:00+02:00', [point(), point({ region: 'shoulder', side: 'right' })]),
			entry('b', '2026-10-04T09:00:00+02:00', [point({ side: 'left' })]),
			entry('c', '2026-10-05T09:00:00+02:00', [point({ region: 'shoulder', side: 'right' })])
		] as StoredRecord<PainPayload>[];
		// Knee (left) twice, shoulder (right) twice: the first placed wins the tie.
		expect(mostLoggedPlace('en', entries)).toBe('Your left knee');
		entries.push(
			entry('d', '2026-10-06T09:00:00+02:00', [point({ region: 'shoulder', side: 'right' })]) as never
		);
		expect(mostLoggedPlace('en', entries)).toBe('Your right shoulder');
		const ep: PainEpisodePayload = { v: 1, type: 'pain_episode', started: '2026-10-03T09:00:00+02:00' };
		expect(episodeName('en', ep, entries)).toBe('Your right shoulder');
		expect(episodeName('en', { ...ep, name: 'My knee' }, entries)).toBe('My knee');
		expect(episodeName('da', ep, entries)).toBe('Din højre skulder');
		expect(episodeName('en', ep, [])).toBe('Pain episode');
	});

	it('renaming stores the name; an empty name goes back to automatic', () => {
		const ep: PainEpisodePayload = { v: 1, type: 'pain_episode', started: '2026-10-03T09:00:00+02:00' };
		expect(withName(ep, '  Left knee  ').name).toBe('Left knee');
		expect('name' in withName({ ...ep, name: 'x' }, '   ')).toBe(false);
	});
});

describe('days and spans', () => {
	it('counts calendar days from the first day (day 1), across midnight and months', () => {
		expect(daysBetween('2026-10-03', '2026-10-05')).toBe(2);
		expect(daysBetween('2026-09-29', '2026-10-02')).toBe(3);
		expect(dayNumber('2026-10-03', '2026-10-03T23:59:00+02:00')).toBe(1);
		expect(dayNumber('2026-10-03', '2026-10-05T00:01:00+02:00')).toBe(3);
		expect(dayNumber('2026-10-03', '2026-10-01T10:00:00+02:00')).toBe(1);
	});

	it('describes an ongoing episode: entries, span and range', () => {
		const [v] = views([
			episode('e', '2026-10-03T09:10:00+02:00'),
			entry('a', '2026-10-03T09:10:00+02:00', [point({ intensity: 4 })], 'e'),
			entry('b', '2026-10-03T21:05:00+02:00', [point({ intensity: 5 })], 'e'),
			entry('c', '2026-10-05T08:20:00+02:00', [point({ intensity: 3 })], 'e')
		]);
		expect(v!.ongoing).toBe(true);
		expect(v!.stale).toBe(false);
		expect(v!.startDay).toBe('2026-10-03');
		expect(v!.spanEndDay).toBe('2026-10-05');
		expect(v!.spanDays).toBe(3);
		expect(v!.daysWithEntries).toBe(2);
		expect(v!.entries.map((e) => e.id)).toEqual(['a', 'b', 'c']);
		expect(episodeRange('en', v!)).toBe(`${formatDay('en', '2026-10-03')} → ongoing`);
	});

	it('an ended episode spans to its end day; the end never falls before the last entry', () => {
		const ended = views([
			episode('e', '2026-10-03T09:00:00+02:00', { ended: '2026-10-09T12:00:00+02:00' }),
			entry('a', '2026-10-03T09:00:00+02:00', [point()], 'e'),
			entry('b', '2026-10-05T09:00:00+02:00', [point()], 'e')
		])[0]!;
		expect(ended.ongoing).toBe(false);
		expect(ended.spanDays).toBe(7);
		expect(episodeRange('en', ended)).toBe(
			`${formatDay('en', '2026-10-03')} → ${formatDay('en', '2026-10-09')}`
		);
		const early = views([
			episode('e', '2026-10-03T09:00:00+02:00', { ended: '2026-10-04T12:00:00+02:00' }),
			entry('a', '2026-10-03T09:00:00+02:00', [point()], 'e'),
			entry('b', '2026-10-06T09:00:00+02:00', [point()], 'e')
		])[0]!;
		expect(early.spanEndDay).toBe('2026-10-06');
	});

	it('the start follows the earliest entry when one is earlier than the stored start', () => {
		const [v] = views([
			episode('e', '2026-10-04T09:00:00+02:00'),
			entry('a', '2026-10-02T09:00:00+02:00', [point()], 'e')
		]);
		expect(v!.startDay).toBe('2026-10-02');
	});

	it('ongoing for more than 14 days since the last entry shows "last logged"', () => {
		const make = (last: string) =>
			views([episode('e', '2026-09-01T09:00:00+02:00'), entry('a', last, [point()], 'e')])[0]!;
		// TODAY is 2026-10-10: 14 days back is the 26th of September (not stale), 15 days is the 25th.
		expect(make('2026-09-26T09:00:00+02:00').stale).toBe(false);
		const stale = make('2026-09-25T09:00:00+02:00');
		expect(stale.stale).toBe(true);
		expect(episodeRange('en', stale)).toBe(
			`${formatDay('en', '2026-09-01')} → last logged ${formatDay('en', '2026-09-25')}`
		);
		// An episode marked gone is never "stale".
		const gone = views([
			episode('e', '2026-09-01T09:00:00+02:00', { ended: '2026-09-26T09:00:00+02:00' }),
			entry('a', '2026-09-25T09:00:00+02:00', [point()], 'e')
		])[0]!;
		expect(gone.stale).toBe(false);
	});
});

describe('average and day dots', () => {
	const all = [
		episode('e', '2026-10-03T09:00:00+02:00'),
		// 3 Oct: points 4 and 6 in one entry, 8 in another: the day's average is 6, the highest is 8.
		entry('a', '2026-10-03T09:00:00+02:00', [point({ intensity: 4 }), point({ intensity: 6 })], 'e'),
		entry('b', '2026-10-03T20:00:00+02:00', [point({ intensity: 8 })], 'e'),
		// 4 Oct: nothing. 5 Oct: 2.
		entry('c', '2026-10-05T08:00:00+02:00', [point({ intensity: 2 })], 'e')
	];

	it('the average is the mean of the daily averages (as the Trends pain line)', () => {
		const v = views(all)[0]!;
		// Day 3 Oct: (4+6+8)/3 = 6; day 5 Oct: 2; mean of the two days = 4.
		expect(v.average).toBe(4);
	});

	it('dots show each day’s highest intensity and null for a day without an entry', () => {
		const v = views(all)[0]!;
		expect(dayDots(v)).toEqual([
			{ day: '2026-10-03', max: 8 },
			{ day: '2026-10-04', max: null },
			{ day: '2026-10-05', max: 2 }
		]);
	});

	it('0 is a real intensity, not an empty day', () => {
		const v = views([
			episode('e', '2026-10-03T09:00:00+02:00'),
			entry('a', '2026-10-03T09:00:00+02:00', [point({ intensity: 0 })], 'e')
		])[0]!;
		expect(dayDots(v)).toEqual([{ day: '2026-10-03', max: 0 }]);
		expect(v.average).toBe(0);
	});
});

describe('lists', () => {
	const all = [
		episode('old', '2026-09-01T09:00:00+02:00', { ended: '2026-09-05T09:00:00+02:00' }),
		entry('o1', '2026-09-01T09:00:00+02:00', [point()], 'old'),
		episode('mid', '2026-10-01T09:00:00+02:00'),
		entry('m1', '2026-10-02T09:00:00+02:00', [point({ region: 'shoulder' })], 'mid'),
		episode('new', '2026-10-08T09:00:00+02:00'),
		entry(
			'n1',
			'2026-10-09T09:00:00+02:00',
			[point({ region: 'lower_back', side: 'midline', space: '2d-back-v1' })],
			'new'
		),
		episode('empty', '2026-10-09T09:00:00+02:00'),
		entry('plain', '2026-10-09T10:00:00+02:00', [point()])
	];

	it('lists episodes with entries, newest first; an episode without entries is ignored', () => {
		expect(views(all).map((v) => v.id)).toEqual(['new', 'mid', 'old']);
	});

	it('the most recent ongoing episode is offered; the chooser puts ongoing ones first', () => {
		const vs = views(all);
		expect(latestOngoing(vs)?.id).toBe('new');
		expect(chooserList(vs).map((v) => v.id)).toEqual(['new', 'mid', 'old']);
		expect(latestOngoing(vs.filter((v) => v.id === 'old'))).toBeUndefined();
	});

	it('finds the episode of an entry only when the episode still exists', () => {
		const vs = views(all);
		const linked = all.find((r) => r.id === 'n1') as StoredRecord<PainPayload>;
		const plain = all.find((r) => r.id === 'plain') as StoredRecord<PainPayload>;
		expect(episodeOfEntry(vs, linked)?.id).toBe('new');
		expect(episodeOfEntry(vs, plain)).toBeUndefined();
		const orphan = entry('x', '2026-10-09T10:00:00+02:00', [point()], 'gone') as StoredRecord<PainPayload>;
		expect(episodeOfEntry(vs, orphan)).toBeUndefined();
	});

	it('overlapping keeps episodes whose span touches the period', () => {
		const vs = views(all);
		expect(overlapping(vs, '2026-10-05', '2026-10-10').map((v) => v.id)).toEqual(['new']);
		expect(overlapping(vs, '2026-10-01', '2026-10-10').map((v) => v.id)).toEqual(['new', 'mid']);
		expect(overlapping(vs, '2026-09-04', '2026-09-30').map((v) => v.id)).toEqual(['old']);
		expect(overlapping(vs, '2026-08-01', '2026-08-31')).toEqual([]);
	});
});

describe('joining and unlinking', () => {
	const previous = entry('p', '2026-10-09T09:00:00+02:00', [point()]) as StoredRecord<PainPayload>;
	const ids = () => 'new-id';

	it('joins the previous entry’s episode when it exists', () => {
		const linked = { ...previous, payload: { ...previous.payload, episode: 'e1' } };
		expect(planJoin(linked, (id) => id === 'e1', ids)).toEqual({ episodeId: 'e1' });
	});

	it('creates an episode from the previous entry when it has none, or its episode is gone', () => {
		expect(planJoin(previous, () => false, ids)).toEqual({
			episodeId: 'new-id',
			create: { previousId: 'p', started: '2026-10-09T09:00:00+02:00' }
		});
		const dangling = { ...previous, payload: { ...previous.payload, episode: 'missing' } };
		expect(planJoin(dangling, () => false, ids).create?.previousId).toBe('p');
	});

	it('links and unlinks an entry without touching its other fields', () => {
		const p = { ...previous.payload, note: 'synthetic note' };
		const linked = withEpisode(p, 'e1');
		expect(linked.episode).toBe('e1');
		expect(linked.note).toBe('synthetic note');
		const free = withEpisode(linked, undefined);
		expect('episode' in free).toBe(false);
		expect(free.points).toEqual(p.points);
	});

	it('ends and reopens an episode', () => {
		const ep: PainEpisodePayload = { v: 1, type: 'pain_episode', started: '2026-10-03T09:00:00+02:00' };
		const ended = withEnded(ep, '2026-10-09T12:00:00+02:00');
		expect(ended.ended).toBe('2026-10-09T12:00:00+02:00');
		expect('ended' in withEnded(ended, undefined)).toBe(false);
	});

	it('after unlinking every entry the episode no longer lists', () => {
		const all = [
			episode('e', '2026-10-03T09:00:00+02:00'),
			entry('a', '2026-10-03T09:00:00+02:00', [point()], 'e'),
			entry('b', '2026-10-04T09:00:00+02:00', [point()], 'e')
		];
		expect(views(all)).toHaveLength(1);
		const unlinked = all.map((r) =>
			r.payload.type === 'pain' ? { ...r, payload: withEpisode(r.payload, undefined) } : r
		);
		expect(views(unlinked)).toEqual([]);
		// Removing one entry keeps the other in the episode.
		const one = all.map((r) =>
			r.id === 'a' && r.payload.type === 'pain' ? { ...r, payload: withEpisode(r.payload, undefined) } : r
		);
		expect(views(one)[0]!.entries.map((e) => e.id)).toEqual(['b']);
	});
});
