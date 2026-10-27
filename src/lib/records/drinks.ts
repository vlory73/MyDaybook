/**
 * Fluid intake helpers: the person's drink presets (built-in defaults plus their own edits), centilitre input,
 * "Same again" and the day total. Pure: no Svelte and no i18n (the names of built-ins are passed in), so it can be
 * unit tested. Descriptive only: a total is a plain sum, never compared with a target, a range or a colour (not a
 * medical device, D19).
 */
import type { StoredRecord } from './codec';
import { dayKey, instant } from './time';
import {
	DEFAULT_DRINK_IDS,
	DEFAULT_PREFIX,
	DEFAULT_SIZE_IDS,
	MAX_DRINK_COUNT,
	MAX_SIZE_ML,
	type DrinkPayload,
	type DrinkPresetsPayload,
	type DrinkPreset,
	type SizePreset
} from './types';

/** The built-in drinks in order, each with its usual size. */
export const DEFAULT_DRINKS: readonly { id: string; size: string }[] = [
	{ id: 'water', size: 'glass' },
	{ id: 'coffee', size: 'cup' },
	{ id: 'tea', size: 'mug' },
	{ id: 'milk', size: 'glass' },
	{ id: 'juice', size: 'glass' },
	{ id: 'soft', size: 'can' },
	{ id: 'beer', size: 'bottle' },
	{ id: 'wine', size: 'wineGlass' },
	{ id: 'spirits', size: 'shot' },
	{ id: 'soup', size: 'mug' }
];
/** The built-in sizes in order, in millilitres (cup 20 cl, glass 25 cl, mug 30 cl, can 33 cl, bottle 50 cl, wine glass 15 cl, shot 4 cl). */
export const DEFAULT_SIZES: readonly { id: string; ml: number }[] = [
	{ id: 'cup', ml: 200 },
	{ id: 'glass', ml: 250 },
	{ id: 'mug', ml: 300 },
	{ id: 'can', ml: 330 },
	{ id: 'bottle', ml: 500 },
	{ id: 'wineGlass', ml: 150 },
	{ id: 'shot', ml: 40 }
];

export const MIN_COUNT = 1;
export const MAX_COUNT = MAX_DRINK_COUNT;
/** A typed amount is whole centilitres, 1 to 500. */
export const MIN_CUSTOM_CL = 1;
export const MAX_CUSTOM_CL = MAX_SIZE_ML / 10;

// ---- Millilitres and centilitres ----

/** Stored millilitres to shown centilitres: 330 is 33, 150 is 15, 25 is 2.5 (decimals only when not whole). */
export const mlToCl = (ml: number): number => Math.round(ml) / 10;

/**
 * Parses what the person typed in a centilitre field ("33", "2,5") into whole millilitres, or null when it is not a
 * number or is out of range. `whole` allows whole centilitres only (a typed amount); sizes may have one decimal.
 */
export function clToMl(text: string, whole = false): number | null {
	const s = text.trim().replace(',', '.');
	if (!(whole ? /^\d{1,3}$/ : /^\d{1,3}(\.\d)?$/).test(s)) return null;
	const ml = Math.round(Number(s) * 10);
	if (ml < (whole ? MIN_CUSTOM_CL * 10 : 1) || ml > MAX_SIZE_ML) return null;
	return ml;
}

/** The centilitre number as text for an input field ("33", "2.5"). */
export const clInput = (ml: number): string => String(mlToCl(ml));

export const totalMl = (sizeMl: number, count: number): number => sizeMl * count;

// ---- Stored names ----

/** `def:glass` stands for the built-in "Glass", shown in the language in use. */
export const defaultKey = (id: string) => `${DEFAULT_PREFIX}${id}`;

/** The id a stored name stands for, or null for free text. */
export function defaultIdOf(stored: string, ids: readonly string[]): string | null {
	if (!stored.startsWith(DEFAULT_PREFIX)) return null;
	const id = stored.slice(DEFAULT_PREFIX.length);
	return ids.includes(id) ? id : null;
}

export type NameOf = (kind: 'drink' | 'size', id: string) => string;

/** A stored drink or size name in the language in use. */
export function storedLabel(kind: 'drink' | 'size', stored: string, nameOf: NameOf): string {
	const id = defaultIdOf(stored, kind === 'drink' ? DEFAULT_DRINK_IDS : DEFAULT_SIZE_IDS);
	return id ? nameOf(kind, id) : stored;
}

// ---- Presets ----

export type ResolvedDrink = {
	id: string;
	/** What is shown. */
	name: string;
	/** What an entry stores: `def:<id>` for an unrenamed built-in, else the name. */
	stored: string;
	isDefault: boolean;
	hidden: boolean;
	sizeId: string;
};
export type ResolvedSize = {
	id: string;
	name: string;
	stored: string;
	ml: number;
	isDefault: boolean;
	hidden: boolean;
};
export type Presets = { drinks: ResolvedDrink[]; sizes: ResolvedSize[] };

const sizeDefaults = new Map(DEFAULT_SIZES.map((s) => [s.id, s.ml]));
const drinkDefaults = new Map(DEFAULT_DRINKS.map((d) => [d.id, d.size]));

/**
 * The drinks and sizes to offer: the saved presets in their order with built-ins that are not mentioned added at
 * the end, or just the built-ins when no presets record exists. Hidden ones stay in the lists (flagged) so the
 * editor can show them and old entries can be matched.
 */
export function resolvePresets(presets: DrinkPresetsPayload | undefined, nameOf: NameOf): Presets {
	const savedDrinks = presets?.drinks ?? [];
	const savedSizes = presets?.sizes ?? [];
	const drinkItems: DrinkPreset[] = [...savedDrinks];
	for (const d of DEFAULT_DRINKS) if (!savedDrinks.some((x) => x.id === d.id)) drinkItems.push({ id: d.id });
	const sizeItems: SizePreset[] = [...savedSizes];
	for (const s of DEFAULT_SIZES) if (!savedSizes.some((x) => x.id === s.id)) sizeItems.push({ id: s.id });

	const drinks = drinkItems.flatMap((d): ResolvedDrink[] => {
		const usual = drinkDefaults.get(d.id);
		const isDefault = usual !== undefined;
		const name = d.name ?? (isDefault ? nameOf('drink', d.id) : '');
		if (name === '') return [];
		return [
			{
				id: d.id,
				name,
				stored: isDefault && d.name === undefined ? defaultKey(d.id) : name,
				isDefault,
				hidden: d.hidden === true,
				sizeId: d.sizeId ?? usual ?? ''
			}
		];
	});
	const sizes = sizeItems.flatMap((s): ResolvedSize[] => {
		const usual = sizeDefaults.get(s.id);
		const isDefault = usual !== undefined;
		const name = s.name ?? (isDefault ? nameOf('size', s.id) : '');
		const ml = s.ml ?? usual;
		if (name === '' || ml === undefined) return [];
		return [
			{
				id: s.id,
				name,
				stored: isDefault && s.name === undefined ? defaultKey(s.id) : name,
				ml,
				isDefault,
				hidden: s.hidden === true
			}
		];
	});
	return { drinks, sizes };
}

export const visibleDrinks = (p: Presets) => p.drinks.filter((d) => !d.hidden);
export const visibleSizes = (p: Presets) => p.sizes.filter((s) => !s.hidden);

/** The size a drink starts with: its usual size when that is still offered, else the first size on offer. */
export function usualSize(presets: Presets, drink: ResolvedDrink | undefined): ResolvedSize | undefined {
	const on = visibleSizes(presets);
	return on.find((s) => s.id === drink?.sizeId) ?? on[0];
}

/** The presets record to use. Two devices may each have made one; the most recently changed wins. */
export function findPresets(all: Iterable<StoredRecord>): StoredRecord<DrinkPresetsPayload> | undefined {
	let best: StoredRecord<DrinkPresetsPayload> | undefined;
	for (const r of all) {
		if (r.payload.type !== 'drink_presets') continue;
		const c = r as StoredRecord<DrinkPresetsPayload>;
		if (!best || c.updatedAt > best.updatedAt || (c.updatedAt === best.updatedAt && c.id > best.id)) best = c;
	}
	return best;
}

/** What the editor works on: plain text fields, so a half-typed value does not disturb anything. */
export type DraftDrink = {
	id: string;
	isDefault: boolean;
	name: string;
	hidden: boolean;
	sizeId: string;
};
export type DraftSize = { id: string; isDefault: boolean; name: string; cl: string; hidden: boolean };

export const draftOf = (p: Presets): { drinks: DraftDrink[]; sizes: DraftSize[] } => ({
	drinks: p.drinks.map((d) => ({
		id: d.id,
		isDefault: d.isDefault,
		name: d.name,
		hidden: d.hidden,
		sizeId: d.sizeId
	})),
	sizes: p.sizes.map((s) => ({
		id: s.id,
		isDefault: s.isDefault,
		name: s.name,
		cl: clInput(s.ml),
		hidden: s.hidden
	}))
});

/** Why a draft cannot be saved: the id of the first row with a problem, or null when it is fine. */
export function draftProblem(drinks: DraftDrink[], sizes: DraftSize[]): string | null {
	for (const d of drinks) if (d.name.trim() === '') return d.id;
	for (const s of sizes) if (s.name.trim() === '' || clToMl(s.cl) === null) return s.id;
	return null;
}

/**
 * The record to store for an edited draft, keeping it small: a built-in only carries what differs from the
 * built-in (a new name, size or usual size, or hidden). Null when the draft has a problem.
 */
export function presetsFromDraft(
	drinks: DraftDrink[],
	sizes: DraftSize[],
	nameOf: NameOf
): DrinkPresetsPayload | null {
	if (draftProblem(drinks, sizes) !== null) return null;
	return {
		v: 1,
		type: 'drink_presets',
		drinks: drinks.map((d) => {
			const out: DrinkPreset = { id: d.id };
			const name = d.name.trim();
			if (!d.isDefault || name !== nameOf('drink', d.id)) out.name = name;
			if (d.sizeId && d.sizeId !== drinkDefaults.get(d.id)) out.sizeId = d.sizeId;
			if (d.hidden) out.hidden = true;
			return out;
		}),
		sizes: sizes.map((s) => {
			const out: SizePreset = { id: s.id };
			const name = s.name.trim();
			const ml = clToMl(s.cl)!;
			if (!s.isDefault || name !== nameOf('size', s.id)) out.name = name;
			if (!s.isDefault || ml !== sizeDefaults.get(s.id)) out.ml = ml;
			if (s.hidden) out.hidden = true;
			return out;
		})
	};
}

/** Moves the item at `index` one place up (-1) or down (+1); returns a new list. */
export function moveItem<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
	const to = index + by;
	if (to < 0 || to >= list.length) return [...list];
	const out = [...list];
	[out[index], out[to]] = [out[to]!, out[index]!];
	return out;
}

// ---- Entries ----

/** Finds the drink a stored name stands for, by built-in key or (case-insensitive) name. */
export function findDrink(presets: Presets, stored: string): ResolvedDrink | undefined {
	const id = defaultIdOf(stored, DEFAULT_DRINK_IDS);
	if (id) return presets.drinks.find((d) => d.id === id);
	const lower = stored.trim().toLowerCase();
	return presets.drinks.find((d) => d.name.toLowerCase() === lower);
}

/** Finds the size an entry used: same name and same volume, else none (the entry keeps its own snapshot). */
export function findSize(
	presets: Presets,
	stored: string,
	ml: number,
	nameOf: NameOf
): ResolvedSize | undefined {
	const name = storedLabel('size', stored, nameOf).toLowerCase();
	return presets.sizes.find((s) => s.ml === ml && s.name.toLowerCase() === name);
}

/** The most recent drink entry (by its time), for "Same again". */
export function lastDrink(all: Iterable<StoredRecord>): StoredRecord<DrinkPayload> | undefined {
	let best: StoredRecord<DrinkPayload> | undefined;
	for (const r of all) {
		if (r.payload.type !== 'drink') continue;
		const c = r as StoredRecord<DrinkPayload>;
		if (
			!best ||
			instant(c.payload.at) > instant(best.payload.at) ||
			(instant(c.payload.at) === instant(best.payload.at) && c.updatedAt > best.updatedAt)
		)
			best = c;
	}
	return best;
}

/** A new entry that repeats `previous` (same drink, size and count) at `at`; note and photos are not copied. */
export function sameAgain(previous: DrinkPayload, at: string): DrinkPayload {
	return {
		v: 1,
		type: 'drink',
		at,
		drink: previous.drink,
		size: previous.size,
		sizeMl: previous.sizeMl,
		count: previous.count,
		totalMl: previous.totalMl
	};
}

/** Plain sum of the drinks on one local day, in millilitres. */
export function dayTotalMl(all: Iterable<StoredRecord>, day: string): number {
	let sum = 0;
	for (const r of all)
		if (r.payload.type === 'drink' && dayKey(r.payload.at) === day) sum += r.payload.totalMl;
	return sum;
}

/**
 * The short text of a drink waiting on the meal sheet: "Coffee · 25 cl", "2 × Water · 15 cl", or the typed amount
 * for an own amount. `cl` formats a volume in ml for the language in use.
 */
export function drinkPillText(p: DrinkPayload, nameOf: NameOf, cl: (ml: number) => string): string {
	const name = storedLabel('drink', p.drink, nameOf);
	if (p.size === '') return `${name} · ${cl(p.totalMl)}`;
	return p.count > 1 ? `${p.count} × ${name} · ${cl(p.sizeMl)}` : `${name} · ${cl(p.sizeMl)}`;
}
