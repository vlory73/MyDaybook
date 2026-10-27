/**
 * The `period` record (ARCHITECTURE §5): one entry per local day with a flow step and optional extras. Record only:
 * nothing here predicts, averages cycle lengths, marks fertile days or warns about a late period (not a medical
 * device, #123). Pure: no Svelte and no i18n.
 */
import type { StoredRecord } from './codec';
import { addDays, dayKey } from './time';
import { isAt, type AttachmentRef } from './types';

export const FLOWS = ['spotting', 'light', 'medium', 'heavy'] as const;
export type Flow = (typeof FLOWS)[number];
/** Pain itself goes in Pain; these three are the only extras. */
export const PERIOD_EXTRAS = ['cramps', 'clots', 'back_pain'] as const;
export type PeriodExtra = (typeof PERIOD_EXTRAS)[number];
export const MAX_PERIOD_NOTE = 2000;

export type PeriodPayload = {
	v: 1;
	type: 'period';
	/** The day it belongs to is the calendar date written in `at`. */
	at: string;
	flow: Flow;
	extras?: PeriodExtra[];
	note?: string;
	attachments?: AttachmentRef[];
};

type Obj = Record<string, unknown>;
export function isPeriodPayload(o: Obj): boolean {
	const extras = o.extras;
	return (
		isAt(o.at) &&
		(FLOWS as readonly unknown[]).includes(o.flow) &&
		(extras === undefined ||
			(Array.isArray(extras) &&
				extras.length <= PERIOD_EXTRAS.length &&
				new Set(extras).size === extras.length &&
				extras.every((e) => (PERIOD_EXTRAS as readonly unknown[]).includes(e)))) &&
		(o.note === undefined || (typeof o.note === 'string' && o.note.length <= MAX_PERIOD_NOTE))
	);
}

type Rec = StoredRecord;

const periods = (all: Iterable<Rec>): StoredRecord<PeriodPayload>[] => {
	const out: StoredRecord<PeriodPayload>[] = [];
	for (const r of all) if (r.payload.type === 'period') out.push(r as unknown as StoredRecord<PeriodPayload>);
	return out;
};

const newer = (a: StoredRecord, b: StoredRecord): boolean =>
	a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id);

/** The step as a dot size for the calendar: 1 (spotting) to 4 (heavy). Size only, never a judging colour. */
export const flowSize = (f: Flow): 1 | 2 | 3 | 4 => (FLOWS.indexOf(f) + 1) as 1 | 2 | 3 | 4;

/** The entry of one day. Two devices may each have made one; the most recently changed wins. */
export function periodOnDay(all: Iterable<Rec>, day: string): StoredRecord<PeriodPayload> | undefined {
	let best: StoredRecord<PeriodPayload> | undefined;
	for (const r of periods(all)) {
		if (dayKey(r.payload.at) !== day) continue;
		if (!best || newer(r, best)) best = r;
	}
	return best;
}

/** One entry per day (the winner of each day) inside the range, keyed by day. */
export function periodByDay(all: Iterable<Rec>, from: string, to: string): Map<string, PeriodPayload> {
	const days = new Map<string, StoredRecord<PeriodPayload>>();
	for (const r of periods(all)) {
		const d = dayKey(r.payload.at);
		if (d < from || d > to) continue;
		const cur = days.get(d);
		if (!cur || newer(r, cur)) days.set(d, r);
	}
	return new Map([...days].map(([d, r]) => [d, r.payload]));
}

/** Yesterday's entry when `day` has none yet: what "Same as yesterday" and the Today card offer. */
export function yesterdayOffer(all: Iterable<Rec>, day: string): StoredRecord<PeriodPayload> | undefined {
	const records = [...all];
	if (periodOnDay(records, day)) return undefined;
	return periodOnDay(records, addDays(day, -1));
}

/** The flow and extras of yesterday's entry as a new entry at `at` (the note is not copied). */
export function copyForToday(from: PeriodPayload, at: string): PeriodPayload {
	const p: PeriodPayload = { v: 1, type: 'period', at, flow: from.flow };
	if (from.extras?.length) p.extras = PERIOD_EXTRAS.filter((e) => from.extras!.includes(e));
	return p;
}

export type CalendarCell = { day: string; flow?: Flow; inRange: boolean };

/**
 * The calendar of a period: weeks Monday to Sunday that cover `from` to `to`, each cell with the day's flow when
 * one was logged. Days outside the range are kept (greyed by the screen) so every week is complete.
 */
export function periodCalendar(
	all: Iterable<Rec>,
	from: string,
	to: string,
	weekStartOf: (day: string) => string
): CalendarCell[][] {
	const byDay = periodByDay(all, from, to);
	const weeks: CalendarCell[][] = [];
	let start = weekStartOf(from);
	while (start <= to) {
		const week: CalendarCell[] = [];
		for (let i = 0; i < 7; i++) {
			const day = addDays(start, i);
			const flow = byDay.get(day)?.flow;
			week.push({ day, inRange: day >= from && day <= to, ...(flow ? { flow } : {}) });
		}
		weeks.push(week);
		start = addDays(start, 7);
	}
	return weeks;
}

/** Number of days with an entry in the range. */
export const daysLogged = (all: Iterable<Rec>, from: string, to: string): number =>
	periodByDay(all, from, to).size;
