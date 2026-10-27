/**
 * What the person tracks: one encrypted `trackers` record (#123). Pure: no Svelte.
 * A tracker is a quick-log category (categories.ts). A missing key in `choices` means that tracker's default, so a
 * tracker added later can start switched off (`DEFAULT_OFF`) without touching anyone's record. No record = defaults.
 * Switching a tracker off only hides it; nothing is deleted and the data export is never filtered.
 */
import { categories, type Category } from '$lib/components/categories';
import type { StoredRecord } from './codec';
import type { TrackersPayload } from './types';

export type TrackerId = Category;
export const TRACKER_IDS = Object.keys(categories) as TrackerId[];
/** Trackers that start switched off for people who never chose (also unticked in the sign-up step). */
export const DEFAULT_OFF: readonly TrackerId[] = ['period', 'bladder'];
/** What a person who never chose has switched on. */
export const DEFAULT_ON: readonly TrackerId[] = TRACKER_IDS.filter((id) => !DEFAULT_OFF.includes(id));

type Choice = Pick<TrackersPayload, 'choices'> | undefined;

/** The record to use. Two devices may each have made one; the most recently changed wins. */
export function findTrackers(all: Iterable<StoredRecord>): StoredRecord<TrackersPayload> | undefined {
	let best: StoredRecord<TrackersPayload> | undefined;
	for (const r of all) {
		if (r.payload.type !== 'trackers') continue;
		const c = r as StoredRecord<TrackersPayload>;
		if (!best || c.updatedAt > best.updatedAt || (c.updatedAt === best.updatedAt && c.id > best.id)) best = c;
	}
	return best;
}

export function isOn(p: Choice, id: TrackerId): boolean {
	const v = p?.choices[id];
	return v === undefined ? !DEFAULT_OFF.includes(id) : v;
}

export const onList = (p: Choice): TrackerId[] => TRACKER_IDS.filter((id) => isOn(p, id));

/** The last tracker that is on cannot be switched off: at least one always stays on. */
export function isLastOn(p: Choice, id: TrackerId): boolean {
	const on = onList(p);
	return on.length === 1 && on[0] === id;
}

const base = (p: TrackersPayload | undefined): Pick<TrackersPayload, 'v' | 'type' | 'introSeen'> => ({
	v: 1,
	type: 'trackers',
	...(p?.introSeen ? { introSeen: true } : {})
});

/** The payload after setting one tracker, or null when that would switch off the last one. Keeps `introSeen`. */
export function setTracker(
	p: TrackersPayload | undefined,
	id: TrackerId,
	on: boolean
): TrackersPayload | null {
	if (!on && isLastOn(p, id)) return null;
	return { ...base(p), choices: { ...p?.choices, [id]: on } };
}

/** A payload with exactly these trackers on (the first-run step), marked as seen. Null when none is on. */
export function fromSelection(on: Iterable<TrackerId>): TrackersPayload | null {
	const set = new Set(on);
	if (set.size === 0) return null;
	return {
		v: 1,
		type: 'trackers',
		choices: Object.fromEntries(TRACKER_IDS.map((id) => [id, set.has(id)])),
		introSeen: true
	};
}

/** The same choices, marked as seen (the one-time card on Today). */
export const withIntroSeen = (p: TrackersPayload | undefined): TrackersPayload => ({
	...base(p),
	choices: { ...p?.choices },
	introSeen: true
});

/** Whether the one-time "New: choose what you track" card still has to show. */
export const showIntroCard = (p: TrackersPayload | undefined): boolean => !p?.introSeen;
