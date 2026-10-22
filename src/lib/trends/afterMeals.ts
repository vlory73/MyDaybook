/**
 * "After meals with ..." (descriptive, D18): for one watch-list item, the person's meals that contain it and, next
 * to each, what was logged within a chosen window afterwards. It draws no conclusion: no counts per item, no
 * percentages, no ranking, no "likely" wording (not a medical device).
 */
import type { StoredRecord } from '$lib/records/codec';
import type { ExposureState } from '$lib/records/types';
import { dayKey, instant } from '$lib/records/time';

export const WINDOWS = [6, 24, 48] as const;
export type WindowHours = (typeof WINDOWS)[number];
export const DEFAULT_WINDOW: WindowHours = 24;

export type After =
	| {
			kind: 'gut';
			id: string;
			at: string;
			minutes: number;
			symptoms: { kind: 'nausea' | 'heartburn'; intensity: number }[];
	  }
	| { kind: 'bowel'; id: string; at: string; minutes: number; bristol: number }
	| { kind: 'pain'; id: string; at: string; minutes: number; regions: number; max: number }
	| { kind: 'feeling'; id: string; at: string; minutes: number; symptoms: string[] };

export type MealWith = {
	id: string;
	at: string;
	text: string;
	/** "yes" (contains it) or "unsure" (maybe). Meals marked "no" are left out. */
	state: Exclude<ExposureState, 'no'>;
	after: After[];
};

/**
 * Meals in `days` that contain (or maybe contain) the item, newest first, each with the entries logged from the
 * moment of the meal up to `windowHours` later. The window includes both ends. A meal's own entries and other meals
 * are not listed; neither are feelings without a symptom.
 */
export function mealsWithItem(
	all: Iterable<StoredRecord>,
	itemId: string,
	days: readonly string[],
	windowHours: number
): MealWith[] {
	const records = [...all];
	const wanted = new Set(days);
	const meals: MealWith[] = [];
	for (const r of records) {
		const p = r.payload;
		if (p.type !== 'food' || !wanted.has(dayKey(p.at))) continue;
		const exposure = p.exposures?.find((e) => e.id === itemId);
		if (!exposure || exposure.state === 'no') continue;
		meals.push({ id: r.id, at: p.at, text: p.text, state: exposure.state, after: [] });
	}
	const limit = windowHours * 60;
	for (const meal of meals) {
		const start = instant(meal.at);
		for (const r of records) {
			const p = r.payload;
			if (p.type !== 'gut' && p.type !== 'bowel' && p.type !== 'pain' && p.type !== 'feeling') continue;
			const minutes = Math.round((instant(p.at) - start) / 60_000);
			if (minutes < 0 || minutes > limit) continue;
			if (p.type === 'gut') {
				meal.after.push({ kind: 'gut', id: r.id, at: p.at, minutes, symptoms: p.symptoms });
			} else if (p.type === 'bowel') {
				meal.after.push({ kind: 'bowel', id: r.id, at: p.at, minutes, bristol: p.bristol });
			} else if (p.type === 'pain') {
				const regions = new Set(p.points.map((pt) => pt.region)).size;
				meal.after.push({
					kind: 'pain',
					id: r.id,
					at: p.at,
					minutes,
					regions,
					max: Math.max(...p.points.map((pt) => pt.intensity))
				});
			} else if (p.symptoms.length > 0) {
				meal.after.push({
					kind: 'feeling',
					id: r.id,
					at: p.at,
					minutes,
					symptoms: p.symptoms.map((s) => s.tag)
				});
			}
		}
		meal.after.sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id));
	}
	return meals.sort((a, b) => instant(b.at) - instant(a.at) || b.id.localeCompare(a.id));
}
