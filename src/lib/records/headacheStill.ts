/**
 * The headache card on Today, the pure parts: which open headache to ask about, when to rest the card, and the stop
 * hours it offers. An open headache is a headache entry with no stop time (see `isOpenHeadache`). The card only
 * asks and repeats what the person entered; no end time is ever guessed or written without the person choosing it.
 * What is kept on the device is an entry id and a day, never health data.
 */
import type { StoredRecord } from './codec';
import { isHeadPoint, isOpenHeadache } from './headache';
import type { PainPayload } from './pain';
import { STILL_THERE_DAYS } from './painEntry';
import { dayDate, dayKey, formatAt, instant, todayKey } from './time';

/** After "Still there" the card rests until this many hours past the hour that was noted. */
export const REST_HOURS = 3;
/** How many earlier hours the "When did it stop?" card offers next to "Now". */
export const STOP_CHOICES = 3;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** When the headache started: the entered start, else the time the entry was made. */
export const headacheStart = (p: PainPayload): string => p.headache?.started ?? p.at;

/** The hour of an instant, rounded down, written like `started` ("2026-10-23T17:00:00+02:00"). */
export function hourOf(at: Date): string {
	const d = new Date(at);
	d.setMinutes(0, 0, 0);
	return formatAt(d);
}

/** A time rounded down to its hour, keeping its offset ("14:30" becomes "14:00"). */
export const floorHour = (at: string): string => `${at.slice(0, 13)}:00:00${at.slice(19)}`;

export type OpenHeadache = {
	id: string;
	payload: PainPayload;
	start: string;
	/** Calendar days between the start and today: 0 today, 1 yesterday, 2 the day before. */
	daysAgo: number;
	/** The highest intensity among the entry's head points, or null when it has none (ticked only). */
	strongest: number | null;
};

const daysBetween = (fromDay: string, toDay: string) =>
	Math.round((dayDate(toDay).getTime() - dayDate(fromDay).getTime()) / DAY_MS);

/** True when an open headache that started at `start` is still recent enough to ask about (and to report as going). */
export function inWindow(start: string, now: Date): boolean {
	if (instant(start) > now.getTime()) return false;
	return daysBetween(dayKey(start), todayKey(now)) <= STILL_THERE_DAYS;
}

/** The most recent open headache that started within the last two calendar days (the later edit wins a tie). */
export function openHeadache(all: Iterable<StoredRecord>, now: Date): OpenHeadache | null {
	let best: { r: StoredRecord<PainPayload>; start: string } | undefined;
	for (const r of all) {
		const p = r.payload;
		if (p.type !== 'pain' || !isOpenHeadache(p)) continue;
		const start = headacheStart(p);
		if (!inWindow(start, now)) continue;
		if (
			!best ||
			instant(start) > instant(best.start) ||
			(instant(start) === instant(best.start) && r.updatedAt > best.r.updatedAt)
		)
			best = { r: r as StoredRecord<PainPayload>, start };
	}
	if (!best) return null;
	const head = best.r.payload.points.filter(isHeadPoint).map((x) => x.intensity);
	return {
		id: best.r.id,
		payload: best.r.payload,
		start: best.start,
		daysAgo: daysBetween(dayKey(best.start), todayKey(now)),
		strongest: head.length > 0 ? Math.max(...head) : null
	};
}

/** True while the card rests after a "Still there": until `REST_HOURS` after the hour that was noted. */
export const isResting = (p: PainPayload, now: Date): boolean =>
	p.headache?.lastSeen !== undefined && now.getTime() < instant(p.headache.lastSeen) + REST_HOURS * HOUR_MS;

/** "Not now" on this device: an entry id and the day it was tapped. Nothing else. */
export type NotNow = { id: string; day: string };

/** What the headache card shows, or null (nothing open, resting after "Still there", or "Not now" today). */
export function headacheCard(
	all: Iterable<StoredRecord>,
	now: Date,
	notNow: NotNow | null
): OpenHeadache | null {
	const open = openHeadache(all, now);
	if (!open || isResting(open.payload, now)) return null;
	if (notNow && notNow.id === open.id && notNow.day === todayKey(now)) return null;
	return open;
}

/** "Now" (the current hour) first, then up to `max` earlier hours, never before the start's hour. */
export function stopChoices(start: string, now: Date, max = STOP_CHOICES): string[] {
	const first = hourOf(now);
	const floor = instant(floorHour(start));
	const out = [first];
	for (let i = 1; i <= max; i++) {
		const at = hourOf(new Date(instant(first) - i * HOUR_MS));
		if (instant(at) < floor) break;
		out.push(at);
	}
	return out;
}

/** A stop is fine when it is not before the start's hour and not after the current hour. */
export const stopOk = (start: string, stopped: string, now: Date): boolean =>
	instant(stopped) >= instant(floorHour(start)) && instant(stopped) <= instant(hourOf(now));

/** "Still there": the entry with the hour noted. Nothing else changes. */
export function withLastSeen(p: PainPayload, hour: string): PainPayload {
	return { ...p, headache: { ...p.headache, lastSeen: hour } };
}

/** "It's gone": the entry with its stop hour; the legacy flag and the "last seen" note are no longer needed. */
export function withStopped(p: PainPayload, stopped: string): PainPayload {
	const { stillGoing, lastSeen, ...rest } = p.headache ?? {};
	void stillGoing;
	void lastSeen;
	return { ...p, headache: { ...rest, stopped } };
}

export const NOT_NOW_KEY = 'headache-not-now';

export function readNotNow(storage: Pick<Storage, 'getItem'> | undefined): NotNow | null {
	try {
		const x = JSON.parse(storage?.getItem(NOT_NOW_KEY) ?? 'null') as unknown;
		if (typeof x === 'object' && x !== null) {
			const { id, day } = x as Record<string, unknown>;
			if (typeof id === 'string' && typeof day === 'string') return { id, day };
		}
	} catch {
		// Unreadable or blocked storage: no "Not now" is remembered.
	}
	return null;
}

export function writeNotNow(storage: Pick<Storage, 'setItem'> | undefined, value: NotNow): void {
	try {
		storage?.setItem(NOT_NOW_KEY, JSON.stringify(value));
	} catch {
		// Not remembered (private mode); the card is hidden for this visit only.
	}
}
