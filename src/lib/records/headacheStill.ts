/**
 * The headache card on Today, the pure parts: which open headache to ask about, when to rest the card, and the stop
 * times it offers. An open headache is a headache entry with no stop time (see `isOpenHeadache`). The card only
 * asks and repeats what the person entered; no end time is ever guessed or written without the person choosing it.
 * What is kept on the device is an entry id and a day, never health data.
 */
import type { StoredRecord } from './codec';
import { isHeadPoint, isOpenHeadache } from './headache';
import type { PainPayload } from './pain';
import { STILL_THERE_DAYS } from './painEntry';
import { dayDate, dayKey, formatAt, instant, todayKey } from './time';

/** After "Still there" the card rests until this many hours past the time that was noted. */
export const REST_HOURS = 3;
/** How many "N hours ago" choices the "When did it stop?" card offers next to "Now" (1 hour ago, 2 hours ago). */
export const STOP_CHOICES = 2;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** When the headache started: the entered start, else the time the entry was made. */
export const headacheStart = (p: PainPayload): string => p.headache?.started ?? p.at;

/** An instant written like any `at` ("2026-10-23T17:42:00+02:00"), to the minute: the seconds are dropped. */
export function minuteOf(at: Date): string {
	const d = new Date(at);
	d.setSeconds(0, 0);
	return formatAt(d);
}

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

export type StopChoice = {
	/** 0 is "Now", 1 is "1 hour ago", 2 is "2 hours ago". */
	hoursAgo: number;
	/** The stop time, to the minute, counted back from now. */
	at: string;
};

/** "Now" first, then up to `max` choices of whole hours ago from now, never before the start. */
export function stopChoices(start: string, now: Date, max = STOP_CHOICES): StopChoice[] {
	const floor = instant(start) - (instant(start) % 60_000);
	const out: StopChoice[] = [];
	for (let i = 0; i <= max; i++) {
		const at = minuteOf(new Date(now.getTime() - i * HOUR_MS));
		if (instant(at) < floor) break;
		out.push({ hoursAgo: i, at });
	}
	return out;
}

/** A stop is fine when it is not before the start (to the minute) and not after now. */
export const stopOk = (start: string, stopped: string, now: Date): boolean =>
	instant(stopped) >= instant(start) - (instant(start) % 60_000) && instant(stopped) <= now.getTime();

/** "Still there": the entry with the time noted. Nothing else changes. */
export function withLastSeen(p: PainPayload, at: string): PainPayload {
	return { ...p, headache: { ...p.headache, lastSeen: at } };
}

/** "It's gone": the entry with its stop time; the legacy flag and the "last seen" note are no longer needed. */
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
