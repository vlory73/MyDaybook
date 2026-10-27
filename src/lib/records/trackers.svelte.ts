/**
 * The person's tracker choice as reactive state (#123). The pure rules live in trackers.ts; this reads the
 * `trackers` record from the store and saves changes like any other record (outbox and offline work as usual).
 */
import { allRecords, save } from './store.svelte';
import {
	findTrackers,
	fromSelection,
	isOn,
	onList,
	setTracker,
	showIntroCard,
	withIntroSeen,
	type TrackerId
} from './trackers';

const record = $derived.by(() => findTrackers(allRecords()));

/** Whether this tracker is switched on. Everything is on until the person chooses otherwise. */
export const trackerOn = (id: TrackerId): boolean => isOn(record?.payload, id);
export const trackersOn = (): TrackerId[] => onList(record?.payload);
export const trackerRecord = () => record;
/** The one-time "New: choose what you track" card on Today. */
export const introCardShown = (): boolean => showIntroCard(record?.payload);

/** Switches one tracker on or off. Returns false when that would switch off the last one. */
export async function chooseTracker(id: TrackerId, on: boolean): Promise<boolean> {
	const next = setTracker(record?.payload, id, on);
	if (!next) return false;
	await save(next, record?.id);
	return true;
}

/** Marks the intro as seen (both buttons of the Today card). */
export async function markIntroSeen(): Promise<void> {
	await save(withIntroSeen(record?.payload), record?.id);
}

// ---- New accounts: the first-run choice is made before the account exists, then saved once the diary is open ----

let pending = $state<TrackerId[] | null>(null);

/** Called by the sign-up flow with what the person ticked. Kept in memory only. */
export const setPendingTrackers = (ids: TrackerId[] | null): void => {
	pending = ids;
};

/** True from sign-up until the first-run choice has been saved. */
export const hasPendingTrackers = (): boolean => pending !== null;

/** Saves the first-run choice once, if there is one waiting and no record yet. */
export async function savePendingTrackers(): Promise<void> {
	const ids = pending;
	if (!ids) return;
	pending = null;
	if (record) return;
	const payload = fromSelection(ids);
	if (payload) await save(payload);
}
