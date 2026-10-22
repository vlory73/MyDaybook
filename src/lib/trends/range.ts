/**
 * Periods for the Trends tab. A period is a list of local day keys ("YYYY-MM-DD"), oldest first, ending today
 * (or at the chosen end date). Day arithmetic goes through `addDays`, which works at local noon, so a daylight
 * saving change never drops or repeats a day.
 */
import { isDay } from '$lib/records/types';
import { addDays } from '$lib/records/time';

export const PERIODS = [7, 30, 90] as const;
export type PresetPeriod = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: PresetPeriod = 30;
export const MAX_RANGE_DAYS = 366;

/** Day keys from `from` to `to`, both included. Empty when `from` is after `to`. */
export function dayRange(from: string, to: string): string[] {
	const out: string[] = [];
	for (let d = from; d <= to && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d);
	return out;
}

/** The last `n` days up to and including `today`. */
export function lastDays(n: number, today: string): string[] {
	return dayRange(addDays(today, -(n - 1)), today);
}

export type CustomRange = { ok: true; days: string[] } | { ok: false; problem: 'invalid' | 'order' | 'long' };

/** A from/to pair from two date fields; the period may not be backwards or longer than 366 days. */
export function customRange(from: string, to: string): CustomRange {
	if (!isDay(from) || !isDay(to)) return { ok: false, problem: 'invalid' };
	if (from > to) return { ok: false, problem: 'order' };
	const days = dayRange(from, to);
	if (days.length > MAX_RANGE_DAYS) return { ok: false, problem: 'long' };
	return { ok: true, days };
}

export function parsePeriod(text: string | null): PresetPeriod {
	const n = Number(text);
	return (PERIODS as readonly number[]).includes(n) ? (n as PresetPeriod) : DEFAULT_PERIOD;
}
