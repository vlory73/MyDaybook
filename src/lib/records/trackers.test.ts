import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import {
	TRACKER_IDS,
	findTrackers,
	fromSelection,
	isLastOn,
	isOn,
	onList,
	setTracker,
	showIntroCard,
	withIntroSeen
} from './trackers';
import { parsePayload, type Payload, type TrackersPayload } from './types';

const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord =>
	({ id, payload, updatedAt }) as unknown as StoredRecord;
const tp = (choices: Record<string, boolean>, introSeen?: boolean): TrackersPayload => ({
	v: 1,
	type: 'trackers',
	choices,
	...(introSeen === undefined ? {} : { introSeen })
});

describe('trackers', () => {
	it('has all 11 on without a record', () => {
		expect(TRACKER_IDS).toHaveLength(11);
		expect(onList(undefined)).toEqual(TRACKER_IDS);
		expect(isOn(undefined, 'gut')).toBe(true);
	});

	it('reads choices and treats a missing key as the default', () => {
		const p = tp({ gut: false, meds: false });
		expect(isOn(p, 'gut')).toBe(false);
		expect(isOn(p, 'food')).toBe(true);
		expect(onList(p)).toHaveLength(9);
	});

	it('switches one off and on again, keeping introSeen', () => {
		const off = setTracker(tp({}, true), 'gut', false)!;
		expect(off.choices).toEqual({ gut: false });
		expect(off.introSeen).toBe(true);
		expect(setTracker(off, 'gut', true)!.choices.gut).toBe(true);
		expect(setTracker(undefined, 'gut', false)!.introSeen).toBeUndefined();
	});

	it('refuses to switch off the last one that is on', () => {
		const only = fromSelection(['note'])!;
		expect(isLastOn(only, 'note')).toBe(true);
		expect(isLastOn(only, 'food')).toBe(false);
		expect(setTracker(only, 'note', false)).toBeNull();
		expect(setTracker(only, 'food', true)).not.toBeNull();
	});

	it('builds the first-run choice and refuses an empty one', () => {
		expect(fromSelection([])).toBeNull();
		const p = fromSelection(['food', 'sleep'])!;
		expect(onList(p)).toEqual(['food', 'sleep']);
		expect(p.introSeen).toBe(true);
	});

	it('marks the intro as seen without changing choices', () => {
		const p = withIntroSeen(tp({ gut: false }));
		expect(p).toEqual(tp({ gut: false }, true));
		expect(showIntroCard(undefined)).toBe(true);
		expect(showIntroCard(tp({}))).toBe(true);
		expect(showIntroCard(p)).toBe(false);
	});

	it('uses the most recently changed record', () => {
		const a = rec('a', tp({ gut: false }), 1);
		const b = rec('b', tp({ gut: true }), 2);
		expect(findTrackers([a, b])?.id).toBe('b');
		expect(findTrackers([rec('x', { v: 1, type: 'tag', name: 'x' })])).toBeUndefined();
	});

	it('validates the payload', () => {
		expect(parsePayload(tp({ gut: false }, true))).not.toBeNull();
		expect(parsePayload({ v: 1, type: 'trackers', choices: { gut: 'no' } })).toBeNull();
		expect(parsePayload({ v: 1, type: 'trackers' })).toBeNull();
		expect(parsePayload({ v: 1, type: 'trackers', choices: {}, introSeen: 1 })).toBeNull();
	});
});
