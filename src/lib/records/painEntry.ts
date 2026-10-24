/**
 * Body map entries, the pure parts: the timeline text, "Same as last time", and the "Still there?" card on Today.
 * Descriptive only: it repeats what the person entered and never rates it, compares it or warns (not a medical
 * device). The card is a convenience like the quick-log "Again?" list.
 */
import { regionName } from '$lib/bodymap/catalogue';
import { translate, type Locale } from '$lib/i18n/core';
import type { StoredRecord } from './codec';
import { isOpenHeadache } from './headache';
import { dayDate, dayKey, instant, todayKey } from './time';
import { MAX_PAIN_POINTS, type PainPayload, type PainPoint } from './pain';

/** How many points the timeline line names before "+N more". */
export const SUMMARY_POINTS = 3;
/** The card appears when the latest entry is from today or one of the two days before (calendar days). */
export const STILL_THERE_DAYS = 2;
const DAY_MS = 86_400_000;

/** "Your right knee 6": the place as the person would say it, and the number they chose. */
export const pointLabel = (locale: Locale, p: PainPoint): string =>
	translate(locale, 'fmt.pain.point', { name: regionName(locale, p.region, p.side), n: p.intensity });

/** "Your right knee 6 · Your left shoulder 3 · +2 more": the first three points, in the order they were placed. */
export function painSummary(locale: Locale, points: readonly PainPoint[]): string {
	const shown = points.slice(0, SUMMARY_POINTS).map((p) => pointLabel(locale, p));
	const more = points.length - shown.length;
	if (more > 0) shown.push(translate(locale, 'fmt.pain.more', { n: more }));
	return shown.join(' · ');
}

/** The most recent body map entry (by its time; the later edit wins a tie), or undefined. */
export function latestPain(all: Iterable<StoredRecord>): StoredRecord<PainPayload> | undefined {
	let best: StoredRecord<PainPayload> | undefined;
	for (const r of all) {
		if (r.payload.type !== 'pain') continue;
		const c = r as StoredRecord<PainPayload>;
		if (
			!best ||
			instant(c.payload.at) > instant(best.payload.at) ||
			(instant(c.payload.at) === instant(best.payload.at) && c.updatedAt > best.updatedAt)
		)
			best = c;
	}
	return best;
}

/**
 * "Same as last time": the points of an earlier entry as the starting point of a new one. Regions, sides, positions,
 * intensities, qualities and notes are copied (the person adjusts and saves); the time, the entry note and photos
 * are not. The copies share nothing with the original.
 */
export function copyPoints(previous: PainPayload): PainPoint[] {
	return previous.points.slice(0, MAX_PAIN_POINTS).map((p) => {
		const copy: PainPoint = { ...p, qualities: [...p.qualities] };
		if (p.note === undefined) delete copy.note;
		return copy;
	});
}

/** The point the card names: the highest intensity, the first placed when several are equal. */
export function highestPoint(points: readonly PainPoint[]): PainPoint {
	return points.reduce((best, p) => (p.intensity > best.intensity ? p : best));
}

export type StillThere = {
	id: string;
	point: PainPoint;
	/** How many other points the entry has. */
	more: number;
	/** Calendar days between the entry and today: 0 today, 1 yesterday, 2 the day before. */
	daysAgo: number;
};

/**
 * What the "Still there?" card shows, or null. It looks only at the latest body map entry that is not an open headache
 * (those have their own card, `headacheStill.ts`): it must be from today or the
 * two days before (by its own time) and not dismissed. A dismissal is the id of the entry that was dismissed, so a newer
 * entry (a different id) brings the card back.
 */
export function stillThere(
	all: Iterable<StoredRecord>,
	now: Date,
	dismissedId: string | null
): StillThere | null {
	const latest = latestPain([...all].filter((r) => !isOpenHeadache(r.payload)));
	if (!latest || latest.id === dismissedId) return null;
	if (instant(latest.payload.at) > now.getTime()) return null;
	const daysAgo = Math.round(
		(dayDate(todayKey(now)).getTime() - dayDate(dayKey(latest.payload.at)).getTime()) / DAY_MS
	);
	if (daysAgo > STILL_THERE_DAYS) return null;
	return {
		id: latest.id,
		point: highestPoint(latest.payload.points),
		more: latest.payload.points.length - 1,
		daysAgo: Math.max(0, daysAgo)
	};
}

/** The one thing kept on the device for the card: the id of the dismissed entry. No health data. */
export const DISMISS_KEY = 'pain-still-dismissed';

export function readDismissed(storage: Pick<Storage, 'getItem'> | undefined): string | null {
	try {
		return storage?.getItem(DISMISS_KEY) ?? null;
	} catch {
		return null;
	}
}

export function writeDismissed(storage: Pick<Storage, 'setItem'> | undefined, id: string): void {
	try {
		storage?.setItem(DISMISS_KEY, id);
	} catch {
		// Not remembered (private mode); the card is hidden for this visit only.
	}
}
