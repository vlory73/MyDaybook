/**
 * Pure helpers behind the entry sheets: usual sleep times, number stepping, last values and the "Again?" repeats.
 * No Svelte and no i18n in here, so everything can be unit tested with fixed dates. Descriptive only: nothing
 * compares a value with a target or a range (not a medical device).
 */
import type { StoredRecord } from './codec';
import { lastSavedMeal, foodFromSaved } from './watch';
import { addDays, dayKey, formatAt, fromLocalInput, instant, minutesBetween, todayKey } from './time';
import type { FeelingPayload, MeasurementPayload, Payload, SavedMealPayload, SleepPayload } from './types';

export const DEFAULT_ASLEEP = '23:00';
export const DEFAULT_WAKE = '07:00';
export const USUAL_NIGHTS = 7;

const toMin = (hm: string): number => {
	const [h, m] = hm.split(':').map(Number) as [number, number];
	return h * 60 + m;
};
const fromMin = (min: number): string =>
	`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function median(nums: number[]): number {
	const s = [...nums].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Newest first, by the moment of waking. */
const newestFirst = <T extends { at: string }>(a: T, b: T) => instant(b.at) - instant(a.at);

/**
 * The person's usual night: the median fell-asleep and wake-up clock times of the last 7 sleep records, else
 * 23:00 to 07:00. Fell-asleep times are measured from noon so that 23:30 and 00:20 sit next to each other.
 */
export function usualNight(sleeps: SleepPayload[]): { asleep: string; wake: string } {
	const recent = [...sleeps].sort(newestFirst).slice(0, USUAL_NIGHTS);
	if (recent.length === 0) return { asleep: DEFAULT_ASLEEP, wake: DEFAULT_WAKE };
	const asleep = recent.map((s) => (toMin(s.asleepAt.slice(11, 16)) + 720) % 1440);
	const wake = recent.map((s) => toMin(s.at.slice(11, 16)));
	return { asleep: fromMin((median(asleep) + 720) % 1440), wake: fromMin(median(wake)) };
}

/**
 * The night that ended on `wakeDay` at `wake`, starting at `asleep` the evening before (or the same day when the
 * fell-asleep time is earlier on the clock than the wake-up time). `offsetMinutes` is for tests.
 */
export function nightFor(
	wakeDay: string,
	asleep: string,
	wake: string,
	offsetMinutes?: number
): { asleepAt: string; at: string } | null {
	const startDay = toMin(asleep) >= toMin(wake) ? addDays(wakeDay, -1) : wakeDay;
	const asleepAt = fromLocalInput(`${startDay}T${asleep}`, offsetMinutes);
	const at = fromLocalInput(`${wakeDay}T${wake}`, offsetMinutes);
	return asleepAt && at ? { asleepAt, at } : null;
}

/** A sleep sheet is valid when waking comes after falling asleep, within a day, and each nap ends after it starts. */
export function sleepProblem(
	asleepAt: string | null,
	at: string | null,
	naps: { from: string | null; to: string | null }[]
): 'times' | 'range' | 'nap' | null {
	if (!asleepAt || !at) return 'times';
	const minutes = minutesBetween(asleepAt, at);
	if (instant(at) <= instant(asleepAt) || minutes > 24 * 60) return 'range';
	for (const n of naps) {
		if (!n.from || !n.to || instant(n.to) <= instant(n.from) || minutesBetween(n.from, n.to) > 24 * 60)
			return 'nap';
	}
	return null;
}

// ---- Numbers ----

/** A number typed by the person ("72.4" or "72,4"), or null when it is not a plain non-negative number. */
export function parseNumber(text: string): number | null {
	const s = text.trim().replace(',', '.');
	if (!/^\d+(\.\d+)?$/.test(s)) return null;
	const n = Number(s);
	return Number.isFinite(n) && n < 1_000_000 ? n : null;
}

export const roundTo = (n: number, decimals: number): number => {
	const f = 10 ** decimals;
	return Math.round((n + Number.EPSILON) * f) / f;
};

/** One step of the − / + buttons: 10^-decimals, never below zero, free of float noise (72.3 + 0.1 = 72.4). */
export function stepValue(current: number | null, direction: 1 | -1, decimals: number): number {
	const step = 10 ** -decimals;
	return Math.max(0, roundTo((current ?? 0) + direction * step, decimals));
}

export const formatNumber = (n: number, decimals: number): string => n.toFixed(decimals);

// ---- Measurement types ----

export const WEIGHT_ID = 'weight';
export type TypeInfo = { id: string; name: string; unit: string; valueCount: number; decimals: number };
/** Built-in context chips; they are stored as these keys and shown translated. */
export const BUILT_IN_CONTEXT = ['morning', 'beforeBreakfast', 'afterExercise'] as const;

type Rec = StoredRecord;
const payloads = <T extends Payload['type']>(all: Iterable<Rec>, type: T) => {
	const out: Extract<Payload, { type: T }>[] = [];
	for (const r of all) if (r.payload.type === type) out.push(r.payload as Extract<Payload, { type: T }>);
	return out;
};

/** Newest measurement of a type, by event time. */
export function lastMeasurement(all: Iterable<Rec>, typeId: string): MeasurementPayload | undefined {
	return payloads(all, 'measurement')
		.filter((m) => m.typeId === typeId)
		.sort(newestFirst)[0];
}

/** The type of the newest non-weight measurement, or weight when there is none. */
export function lastUsedMeasureType(all: Iterable<Rec>): string {
	const newest = payloads(all, 'measurement')
		.filter((m) => m.typeId !== WEIGHT_ID)
		.sort(newestFirst)[0];
	return newest?.typeId ?? WEIGHT_ID;
}

export function lastFeeling(all: Iterable<Rec>, field: 'mood' | 'energy' | 'stress'): number | undefined {
	const withField = payloads(all, 'feeling')
		.filter((f: FeelingPayload) => f[field] !== undefined)
		.sort(newestFirst)[0];
	return withField?.[field];
}

// ---- Again? ----

export type Again =
	| { kind: 'sleep'; asleep: string; wake: string }
	| { kind: 'weight'; value: number; unit: string }
	| { kind: 'meal'; id: string; saved: SavedMealPayload };

/**
 * Up to three one-tap repeats from recent records, in a fixed order: the usual night (when at least one night is
 * logged and none ends today), the last weight (when none is logged today) and the last saved meal.
 */
export function againOptions(all: Iterable<Rec>, now: Date): Again[] {
	const records = [...all];
	const today = todayKey(now);
	const out: Again[] = [];

	const sleeps = payloads(records, 'sleep');
	if (sleeps.length > 0 && !sleeps.some((s) => dayKey(s.at) === today)) {
		out.push({ kind: 'sleep', ...usualNight(sleeps) });
	}
	const weight = lastMeasurement(records, WEIGHT_ID);
	if (weight && dayKey(weight.at) !== today) {
		out.push({ kind: 'weight', value: weight.values[0]!, unit: weight.unit });
	}
	const meal = lastSavedMeal(records);
	if (meal) out.push({ kind: 'meal', id: meal.id, saved: meal.payload });
	return out.slice(0, 3);
}

/** The record an Again? option would save, stamped with the current time. */
export function againPayload(
	option: Again,
	now: Date,
	watched: ReadonlySet<string> = new Set()
): Payload | null {
	if (option.kind === 'meal') return foodFromSaved(option.saved, formatAt(now), watched);
	if (option.kind === 'weight') {
		return {
			v: 1,
			type: 'measurement',
			at: formatAt(now),
			typeId: WEIGHT_ID,
			values: [option.value],
			unit: option.unit,
			context: []
		};
	}
	const night = nightFor(todayKey(now), option.asleep, option.wake);
	return night ? { v: 1, type: 'sleep', asleepAt: night.asleepAt, at: night.at } : null;
}
