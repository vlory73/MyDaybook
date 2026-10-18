/**
 * The food watch list and meal helpers. Pure: no Svelte, no i18n (formatters are passed in), so it can be unit
 * tested. Descriptive only: exposures are what the person entered, never scored, ranked or turned into advice
 * (not a medical device, decisions D18 to D20).
 */
import type { StoredRecord } from './codec';
import type {
	Exposure,
	ExposureState,
	FoodPayload,
	Meal,
	SavedMealPayload,
	SensitivityPayload
} from './types';

/** Suggestions are stored as `sug:<id>` so their names can be shown in the language in use. */
export const SUGGESTION_PREFIX = 'sug:';

type Suggestion = { id: string; icon: string; kind: SensitivityPayload['kind'] };

/** The 14 EU allergens (Reg. 1169/2011 Annex II), then common intolerances and other things people track. */
export const SUGGESTIONS: readonly Suggestion[] = [
	{ id: 'gluten', icon: 'wheat', kind: 'allergen' },
	{ id: 'milk', icon: 'milk', kind: 'allergen' },
	{ id: 'eggs', icon: 'egg', kind: 'allergen' },
	{ id: 'treeNuts', icon: 'nut', kind: 'allergen' },
	{ id: 'peanuts', icon: 'nut', kind: 'allergen' },
	{ id: 'soy', icon: 'bean', kind: 'allergen' },
	{ id: 'fish', icon: 'fish', kind: 'allergen' },
	{ id: 'crustaceans', icon: 'fish', kind: 'allergen' },
	{ id: 'molluscs', icon: 'droplets', kind: 'allergen' },
	{ id: 'celery', icon: 'leaf', kind: 'allergen' },
	{ id: 'mustard', icon: 'leaf', kind: 'allergen' },
	{ id: 'sesame', icon: 'bean', kind: 'allergen' },
	{ id: 'sulphites', icon: 'sparkles', kind: 'allergen' },
	{ id: 'lupin', icon: 'bean', kind: 'allergen' },
	{ id: 'lactose', icon: 'milk', kind: 'intolerance' },
	{ id: 'fructose', icon: 'leaf', kind: 'intolerance' },
	{ id: 'fodmap', icon: 'bean', kind: 'intolerance' },
	{ id: 'histamine', icon: 'activity', kind: 'intolerance' },
	{ id: 'sorbitol', icon: 'leaf', kind: 'intolerance' },
	{ id: 'caffeine', icon: 'zap', kind: 'other' },
	{ id: 'alcohol', icon: 'droplets', kind: 'other' }
];

export const suggestionLabel = (id: string) => `${SUGGESTION_PREFIX}${id}`;

/** The suggestion id a stored label stands for, or null for free text. */
export function suggestionId(label: string): string | null {
	if (!label.startsWith(SUGGESTION_PREFIX)) return null;
	const id = label.slice(SUGGESTION_PREFIX.length);
	return SUGGESTIONS.some((s) => s.id === id) ? id : null;
}

/** Watch-list items in the person's order. */
export function watchedItems(all: Iterable<StoredRecord>): { id: string; payload: SensitivityPayload }[] {
	const out: { id: string; payload: SensitivityPayload }[] = [];
	for (const r of all) if (r.payload.type === 'sensitivity') out.push({ id: r.id, payload: r.payload });
	return out.sort((a, b) => a.payload.order - b.payload.order || a.id.localeCompare(b.id));
}

// ---- Meals ----

/** The meal type a new meal starts with, from the hour of day (the person can change it). */
export function mealByHour(hour: number): Meal {
	if (hour >= 4 && hour < 10) return 'breakfast';
	if (hour >= 10 && hour < 15) return 'lunch';
	if (hour >= 15 && hour < 17) return 'snack';
	if (hour >= 17 && hour < 21) return 'dinner';
	return 'snack';
}

/** The saved meal that was created or changed most recently. */
export function lastSavedMeal(
	all: Iterable<StoredRecord>
): { id: string; payload: SavedMealPayload } | undefined {
	let best: StoredRecord | undefined;
	for (const r of all) {
		if (r.payload.type === 'saved_meal' && (!best || r.updatedAt > best.updatedAt)) best = r;
	}
	return best && best.payload.type === 'saved_meal' ? { id: best.id, payload: best.payload } : undefined;
}

/** A name for a saved meal: the first line of the description, kept short. */
export function savedMealName(text: string): string {
	const line =
		text
			.split('\n')
			.find((l) => l.trim() !== '')
			?.trim() ?? '';
	return line.length > 40 ? `${line.slice(0, 39).trimEnd()}…` : line;
}

/** A meal entry from a saved meal, keeping only exposures for items that are still on the watch list. */
export function foodFromSaved(
	saved: SavedMealPayload,
	at: string,
	watched: ReadonlySet<string>
): FoodPayload {
	const exposures = saved.exposures.filter((e) => watched.has(e.id));
	const p: FoodPayload = {
		v: 1,
		type: 'food',
		at,
		meal: saved.meal,
		text: saved.text,
		tags: [...saved.tags]
	};
	if (exposures.length > 0) p.exposures = exposures;
	return p;
}

export type ExposureText = Record<ExposureState, (name: string) => string>;

/**
 * Timeline tags for a meal: Yes is "Contains X", No is "X-free" and Not sure is "Maybe X", only for items that are
 * on the watch list (`nameOf` returns undefined for anything else).
 */
export function exposureTags(
	exposures: readonly Exposure[] | undefined,
	nameOf: (id: string) => string | undefined,
	text: ExposureText
): string[] {
	const out: string[] = [];
	for (const e of exposures ?? []) {
		const name = nameOf(e.id);
		if (name) out.push(text[e.state](name));
	}
	return out;
}

/** "Lactose" inside a sentence reads "lactose"; acronyms such as FODMAP stay as written. */
export function inline(name: string): string {
	return name === name.toUpperCase() ? name : name.charAt(0).toLowerCase() + name.slice(1);
}
