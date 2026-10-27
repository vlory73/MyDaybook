/**
 * The `bladder` record (ARCHITECTURE §5): a visit with optional urgency, discomfort and a leak, or a leak on its
 * own (`visit: false`). Record only: no counts are compared with anything, there are no ranges or alerts (not a
 * medical device, #123). Pure: no Svelte and no i18n.
 */
import type { StoredRecord } from './codec';
import { dayKey, instant } from './time';
import { isAt, type AttachmentRef } from './types';

export const URGENCIES = ['none', 'some', 'strong'] as const;
export type Urgency = (typeof URGENCIES)[number];
export const LEAK_AMOUNTS = [1, 2, 3] as const;
export type LeakAmount = (typeof LEAK_AMOUNTS)[number];
export const LEAK_WHEN = ['on_the_way', 'afterwards', 'moving'] as const;
export type LeakWhen = (typeof LEAK_WHEN)[number];
export const MAX_BLADDER_NOTE = 2000;

export type BladderPayload = {
	v: 1;
	type: 'bladder';
	at: string;
	/** False = "Log a leak only": not counted as a visit. */
	visit: boolean;
	urgency?: Urgency;
	discomfort?: true;
	leak?: { amount: LeakAmount; when?: LeakWhen };
	note?: string;
	attachments?: AttachmentRef[];
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

export function isBladderPayload(o: Obj): boolean {
	const leak = o.leak;
	return (
		isAt(o.at) &&
		typeof o.visit === 'boolean' &&
		(o.urgency === undefined || (URGENCIES as readonly unknown[]).includes(o.urgency)) &&
		(o.discomfort === undefined || o.discomfort === true) &&
		(leak === undefined ||
			(isObj(leak) &&
				(LEAK_AMOUNTS as readonly unknown[]).includes(leak.amount) &&
				(leak.when === undefined || (LEAK_WHEN as readonly unknown[]).includes(leak.when)))) &&
		// A leak-only entry is nothing without its leak.
		(o.visit === true || leak !== undefined) &&
		(o.note === undefined || (typeof o.note === 'string' && o.note.length <= MAX_BLADDER_NOTE))
	);
}

type Rec = StoredRecord;
const bladders = (all: Iterable<Rec>): StoredRecord<BladderPayload>[] => {
	const out: StoredRecord<BladderPayload>[] = [];
	for (const r of all)
		if (r.payload.type === 'bladder') out.push(r as unknown as StoredRecord<BladderPayload>);
	return out;
};

/** Visits on one local day (leak-only entries are not visits). */
export const visitsOnDay = (all: Iterable<Rec>, day: string): number =>
	bladders(all).filter((r) => r.payload.visit && dayKey(r.payload.at) === day).length;

/** The newest visit of the day (by event time), for "Last visit 08:12" and "+1 again". */
export function lastVisitOnDay(all: Iterable<Rec>, day: string): StoredRecord<BladderPayload> | undefined {
	return bladders(all)
		.filter((r) => r.payload.visit && dayKey(r.payload.at) === day)
		.sort((a, b) => instant(b.payload.at) - instant(a.payload.at))[0];
}

/** The same visit again at `at`: urgency, discomfort and leak are kept, the note is not. */
export function repeatVisit(from: BladderPayload, at: string): BladderPayload {
	const p: BladderPayload = { v: 1, type: 'bladder', at, visit: true };
	if (from.urgency) p.urgency = from.urgency;
	if (from.discomfort) p.discomfort = true;
	if (from.leak) p.leak = { ...from.leak };
	return p;
}

// ---- Trends ----

export type BladderDay = { day: string; visits: number };
export type BladderSummary = {
	/** Days with at least one visit, with the number of visits. A day with no visit is not listed (a gap, never 0). */
	days: BladderDay[];
	daysWithDiscomfort: number;
	daysWithLeak: number;
	/** Days with a leak by the "when" chosen; a day counts once for each "when" it has. */
	leakWhen: Record<LeakWhen, number>;
};

/** Plain counts for the days from `from` to `to`; nothing is compared with anything. */
export function bladderSummary(all: Iterable<Rec>, from: string, to: string): BladderSummary {
	const visits = new Map<string, number>();
	const discomfort = new Set<string>();
	const leak = new Set<string>();
	const whenDays: Record<LeakWhen, Set<string>> = {
		on_the_way: new Set(),
		afterwards: new Set(),
		moving: new Set()
	};
	for (const r of bladders(all)) {
		const day = dayKey(r.payload.at);
		if (day < from || day > to) continue;
		if (r.payload.visit) visits.set(day, (visits.get(day) ?? 0) + 1);
		if (r.payload.discomfort) discomfort.add(day);
		if (r.payload.leak) {
			leak.add(day);
			if (r.payload.leak.when) whenDays[r.payload.leak.when].add(day);
		}
	}
	return {
		days: [...visits].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, n]) => ({ day, visits: n })),
		daysWithDiscomfort: discomfort.size,
		daysWithLeak: leak.size,
		leakWhen: {
			on_the_way: whenDays.on_the_way.size,
			afterwards: whenDays.afterwards.size,
			moving: whenDays.moving.size
		}
	};
}

/** True when the range holds any bladder entry (so the Trends card shows at all). */
export const hasBladderData = (all: Iterable<Rec>, from: string, to: string): boolean =>
	bladders(all).some((r) => {
		const d = dayKey(r.payload.at);
		return d >= from && d <= to;
	});
