/**
 * Per-day series for the Trends charts. Pure and descriptive: it sums, averages and counts what the person logged
 * and never rates it (not a medical device). Every series is aligned with the `days` list (oldest first) and holds
 * `null` for a day without data, so charts can leave a gap instead of drawing a zero.
 * A record belongs to the local day written in its `at`, as on the timeline; a night belongs to the wake-up day.
 */
import type { StoredRecord } from '$lib/records/codec';
import type { DosePayload, GutPayload, Payload } from '$lib/records/types';
import type { PainPayload } from '$lib/records/pain';
import { dayKey, instant, minutesBetween } from '$lib/records/time';

type Rec = StoredRecord;
export type Series = (number | null)[];

function ofType<T extends Payload['type']>(all: Iterable<Rec>, type: T): Extract<Payload, { type: T }>[] {
	const out: Extract<Payload, { type: T }>[] = [];
	for (const r of all) if (r.payload.type === type) out.push(r.payload as Extract<Payload, { type: T }>);
	return out;
}

/** Groups items by day, keeping only the listed days. `day` returns a day key or an `at` (its first 10 characters). */
function byDay<T>(items: T[], day: (item: T) => string, days: readonly string[]): Map<string, T[]> {
	const wanted = new Set(days);
	const map = new Map<string, T[]>();
	for (const item of items) {
		const key = dayKey(day(item));
		if (!wanted.has(key)) continue;
		const list = map.get(key);
		if (list) list.push(item);
		else map.set(key, [item]);
	}
	return map;
}

const mean = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;
const perDay = <T>(
	map: Map<string, T[]>,
	days: readonly string[],
	f: (items: T[]) => number | null
): Series =>
	days.map((d) => {
		const items = map.get(d);
		return items && items.length > 0 ? f(items) : null;
	});

export const present = (s: Series): number[] => s.filter((n): n is number => n !== null);
export const hasAny = (s: Series): boolean => s.some((n) => n !== null);

// ---- Feeling ----

export type FeelingSeries = { mood: Series; energy: Series; stress: Series };

/** The day's average per scale (1 to 5) over the entries that filled it in. */
export function feelingSeries(all: Iterable<Rec>, days: readonly string[]): FeelingSeries {
	const map = byDay(ofType(all, 'feeling'), (p) => p.at, days);
	const field = (key: 'mood' | 'energy' | 'stress') =>
		perDay(map, days, (items) => {
			const values = items.map((i) => i[key]).filter((n): n is number => n !== undefined);
			return values.length > 0 ? mean(values) : null;
		});
	return { mood: field('mood'), energy: field('energy'), stress: field('stress') };
}

// ---- Sleep ----

export type SleepSeries = {
	/** Minutes slept per night, on the wake-up day (several sleeps on one day are added up). */
	minutes: Series;
	/** Quality 1 to 5 of that night (the longest sleep that has one), or null. */
	quality: Series;
	/** Average minutes over nights with data, or null. */
	averageMinutes: number | null;
	/** Number of nights per quality 1 to 5. */
	qualityCounts: [number, number, number, number, number];
};

export function sleepSeries(all: Iterable<Rec>, days: readonly string[]): SleepSeries {
	const map = byDay(ofType(all, 'sleep'), (p) => p.at, days);
	const minutes = perDay(map, days, (items) =>
		items.reduce((sum, s) => sum + minutesBetween(s.asleepAt, s.at), 0)
	);
	const quality = perDay(map, days, (items) => {
		const rated = items.filter((s) => s.quality !== undefined);
		if (rated.length === 0) return null;
		rated.sort((a, b) => minutesBetween(b.asleepAt, b.at) - minutesBetween(a.asleepAt, a.at));
		return rated[0]!.quality!;
	});
	const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
	for (const q of present(quality)) counts[q - 1]!++;
	const nights = present(minutes);
	return { minutes, quality, averageMinutes: nights.length > 0 ? mean(nights) : null, qualityCounts: counts };
}

// ---- Measurements ----

export type MeasurementSeries = { values: Series; unit: string };

/** The day's last value of a measurement type (the first number, or value `index`, when it has several). Unit: from the newest entry. */
export function measurementSeries(
	all: Iterable<Rec>,
	days: readonly string[],
	typeId: string,
	/** Which of the entry's values to follow (0 = first; blood pressure: 0 upper, 1 lower). */
	index = 0
): MeasurementSeries {
	const mine = ofType(all, 'measurement').filter((m) => m.typeId === typeId);
	const map = byDay(mine, (p) => p.at, days);
	const values = perDay(map, days, (items) => {
		const last = items.reduce((a, b) => (instant(b.at) >= instant(a.at) ? b : a));
		return last.values[index] ?? null;
	});
	let unit = '';
	let newest = -Infinity;
	for (const items of map.values()) {
		for (const m of items) {
			if (instant(m.at) >= newest) {
				newest = instant(m.at);
				unit = m.unit;
			}
		}
	}
	return { values, unit };
}

/** The person's own measurement types (not weight) with at least one value in the period, by name. */
export function measurementTypesWithData(
	all: Iterable<Rec>,
	days: readonly string[]
): { id: string; name: string; unit: string }[] {
	const records = [...all];
	const out: { id: string; name: string; unit: string }[] = [];
	for (const r of records) {
		if (r.payload.type !== 'measurement_type') continue;
		const s = measurementSeries(records, days, r.id);
		if (hasAny(s.values)) out.push({ id: r.id, name: r.payload.name, unit: s.unit || r.payload.unit });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Fluids ----

export type FluidSeries = { totalMl: Series; averageMl: number | null };

export function fluidSeries(all: Iterable<Rec>, days: readonly string[]): FluidSeries {
	const map = byDay(ofType(all, 'drink'), (p) => p.at, days);
	const totalMl = perDay(map, days, (items) => items.reduce((sum, d) => sum + d.totalMl, 0));
	const have = present(totalMl);
	return { totalMl, averageMl: have.length > 0 ? mean(have) : null };
}

// ---- Medicine ----

export type DoseDay = { taken: number; late: number; skipped: number };
export type DoseSeries = { days: DoseDay[]; totals: DoseDay; any: boolean };

/** A scheduled dose belongs to the day of its slot, an as-needed dose to the day it was logged. */
export const doseDay = (d: DosePayload): string => d.slot?.date ?? dayKey(d.at);

export function doseSeries(all: Iterable<Rec>, days: readonly string[]): DoseSeries {
	const map = byDay(ofType(all, 'dose'), doseDay, days);
	const totals: DoseDay = { taken: 0, late: 0, skipped: 0 };
	const out = days.map((day) => {
		const c: DoseDay = { taken: 0, late: 0, skipped: 0 };
		for (const d of map.get(day) ?? []) c[d.status]++;
		totals.taken += c.taken;
		totals.late += c.late;
		totals.skipped += c.skipped;
		return c;
	});
	return { days: out, totals, any: totals.taken + totals.late + totals.skipped > 0 };
}

// ---- Bowel ----

/** One bowel entry: its day slot, the time of day (0 to 1) inside the slot, and the Bristol type (1 to 7). */
export type BowelDot = { dayIndex: number; frac: number; type: number };

export function bowelDots(all: Iterable<Rec>, days: readonly string[]): BowelDot[] {
	const index = new Map(days.map((d, i) => [d, i]));
	const out: BowelDot[] = [];
	for (const b of ofType(all, 'bowel')) {
		const i = index.get(dayKey(b.at));
		if (i === undefined) continue;
		const [h, m] = b.at.slice(11, 16).split(':').map(Number) as [number, number];
		out.push({ dayIndex: i, frac: (h * 60 + m) / 1440, type: b.bristol });
	}
	return out.sort((a, b) => a.dayIndex + a.frac - (b.dayIndex + b.frac));
}

// ---- Nausea and heartburn ----

export type GutSeries = { nausea: Series; heartburn: Series; nauseaDays: number; heartburnDays: number };

/** The strongest intensity (1 to 5) per day for each kind. */
export function gutSeries(all: Iterable<Rec>, days: readonly string[]): GutSeries {
	const map = byDay(ofType(all, 'gut'), (p) => p.at, days);
	const kind = (k: GutPayload['symptoms'][number]['kind']) =>
		perDay(map, days, (items) => {
			const values = items.flatMap((g) => g.symptoms.filter((s) => s.kind === k).map((s) => s.intensity));
			return values.length > 0 ? Math.max(...values) : null;
		});
	const nausea = kind('nausea');
	const heartburn = kind('heartburn');
	return { nausea, heartburn, nauseaDays: present(nausea).length, heartburnDays: present(heartburn).length };
}

// ---- Pain ----

export type PainDay = { avg: number; min: number; max: number; points: number };
export type PainSeries = { days: (PainDay | null)[]; entries: number; daysWithPain: number };

/** Per day: average, lowest and highest point intensity (0 to 10) over all points of all pain entries that day. */
export function painSeries(all: Iterable<Rec>, days: readonly string[]): PainSeries {
	const map = byDay<PainPayload>(ofType(all, 'pain'), (p) => p.at, days);
	let entries = 0;
	const out = days.map((d): PainDay | null => {
		const list = map.get(d);
		if (!list) return null;
		entries += list.length;
		const values = list.flatMap((e) => e.points.map((p) => p.intensity));
		if (values.length === 0) return null;
		return { avg: mean(values), min: Math.min(...values), max: Math.max(...values), points: values.length };
	});
	return { days: out, entries, daysWithPain: out.filter((d) => d !== null).length };
}
