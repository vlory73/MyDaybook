import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import {
	clInput,
	clToMl,
	dayTotalMl,
	draftOf,
	draftProblem,
	findDrink,
	findPresets,
	findSize,
	lastDrink,
	mlToCl,
	moveItem,
	presetsFromDraft,
	resolvePresets,
	sameAgain,
	storedLabel,
	usualSize,
	visibleDrinks,
	visibleSizes,
	type NameOf
} from './drinks';
import { parsePayload, type DrinkPayload, type DrinkPresetsPayload, type Payload } from './types';
import { translate } from '$lib/i18n/core';

// Synthetic data only.
const at = '2026-10-18T08:10:00+02:00';
const nameOf: NameOf = (kind, id) =>
	translate('en', `drink.${kind === 'drink' ? 'name' : 'size'}.${id}` as never);
const drink = (extra: Record<string, unknown> = {}) => ({
	v: 1,
	type: 'drink',
	at,
	drink: 'def:wine',
	size: 'def:wineGlass',
	sizeMl: 150,
	count: 2,
	totalMl: 300,
	...extra
});
const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord => ({
	id,
	rev: 1,
	updatedAt,
	payload
});
const entry = (id: string, when: string, ml: number, updatedAt = 1) =>
	rec(id, drink({ at: when, sizeMl: ml, count: 1, totalMl: ml }) as DrinkPayload, updatedAt);

describe('drink payload', () => {
	it('accepts a sized drink, a typed amount, own names and a note', () => {
		expect(parsePayload(drink())).not.toBeNull();
		expect(
			parsePayload(drink({ drink: 'Cider', size: 'Pint', sizeMl: 568, count: 1, totalMl: 568 }))
		).not.toBeNull();
		expect(
			parsePayload(drink({ size: '', sizeMl: 120, count: 1, totalMl: 120, note: 'Synthetic' }))
		).not.toBeNull();
	});

	it('requires whole millilitres, a count of 1 to 10 and a matching total', () => {
		expect(parsePayload(drink({ sizeMl: 0, totalMl: 0 }))).toBeNull();
		expect(parsePayload(drink({ sizeMl: 5001, count: 1, totalMl: 5001 }))).toBeNull();
		expect(parsePayload(drink({ sizeMl: 150.5, totalMl: 301 }))).toBeNull();
		expect(parsePayload(drink({ count: 0, totalMl: 0 }))).toBeNull();
		expect(parsePayload(drink({ count: 11, totalMl: 1650 }))).toBeNull();
		expect(parsePayload(drink({ count: 10, totalMl: 1500 }))).not.toBeNull();
		expect(parsePayload(drink({ totalMl: 299 }))).toBeNull();
		expect(parsePayload(drink({ sizeMl: '150' }))).toBeNull();
	});

	it('rejects an empty drink name, a bad time and an over-long note', () => {
		expect(parsePayload(drink({ drink: '  ' }))).toBeNull();
		expect(parsePayload(drink({ at: 'yesterday' }))).toBeNull();
		expect(parsePayload(drink({ note: 'x'.repeat(2001) }))).toBeNull();
	});
});

describe('drink_presets payload', () => {
	const presets = (extra: Record<string, unknown>) => ({
		v: 1,
		type: 'drink_presets',
		drinks: [],
		sizes: [],
		...extra
	});

	it('accepts overrides of built-ins and own drinks and sizes', () => {
		expect(parsePayload(presets({}))).not.toBeNull();
		const full = presets({
			drinks: [
				{ id: 'water', name: 'Tap water', sizeId: 'mug' },
				{ id: 'beer', hidden: true },
				{ id: 'u1', name: 'Cider', sizeId: 'u2' }
			],
			sizes: [
				{ id: 'glass', ml: 200 },
				{ id: 'u2', name: 'Pint', ml: 568 }
			]
		});
		expect(parsePayload(full)).not.toBeNull();
	});

	it('requires a name for an own drink and a name and volume for an own size', () => {
		expect(parsePayload(presets({ drinks: [{ id: 'u1' }] }))).toBeNull();
		expect(parsePayload(presets({ sizes: [{ id: 'u2', name: 'Pint' }] }))).toBeNull();
		expect(parsePayload(presets({ sizes: [{ id: 'u2', ml: 568 }] }))).toBeNull();
	});

	it('rejects duplicate ids, empty names and volumes out of range', () => {
		expect(parsePayload(presets({ drinks: [{ id: 'water' }, { id: 'water' }] }))).toBeNull();
		expect(parsePayload(presets({ drinks: [{ id: 'water', name: ' ' }] }))).toBeNull();
		expect(parsePayload(presets({ sizes: [{ id: 'glass', ml: 0 }] }))).toBeNull();
		expect(parsePayload(presets({ sizes: [{ id: 'glass', ml: 5001 }] }))).toBeNull();
		expect(parsePayload(presets({ sizes: [{ id: 'glass', ml: 25.5 }] }))).toBeNull();
	});
});

describe('centilitres and millilitres', () => {
	it('shows whole centilitres without decimals and others with one', () => {
		expect(mlToCl(330)).toBe(33);
		expect(mlToCl(150)).toBe(15);
		expect(mlToCl(25)).toBe(2.5);
		expect(translate('en', 'fmt.cl', { n: mlToCl(330) })).toBe('33 cl');
		expect(translate('en', 'fmt.cl', { n: mlToCl(25) })).toBe('2.5 cl');
		expect(translate('da', 'fmt.cl', { n: mlToCl(25) })).toBe('2,5 cl');
		expect(clInput(330)).toBe('33');
		expect(clInput(25)).toBe('2.5');
	});

	it('parses typed centilitres into whole millilitres', () => {
		expect(clToMl('33')).toBe(330);
		expect(clToMl(' 2,5 ')).toBe(25);
		expect(clToMl('0.1')).toBe(1);
		expect(clToMl('500')).toBe(5000);
	});

	it('refuses text, zero, too much and (for a typed amount) decimals', () => {
		for (const bad of ['', 'abc', '0', '0.0', '501', '-3', '1e2', '2.55', '1,2,3'])
			expect(clToMl(bad)).toBeNull();
		expect(clToMl('2.5', true)).toBeNull();
		expect(clToMl('0', true)).toBeNull();
		expect(clToMl('12', true)).toBe(120);
		expect(clToMl('500', true)).toBe(5000);
		expect(clToMl('501', true)).toBeNull();
	});
});

describe('presets', () => {
	it('uses the built-in drinks, sizes and usual sizes when there is no record', () => {
		const p = resolvePresets(undefined, nameOf);
		expect(p.drinks.map((d) => d.name)).toEqual([
			'Water',
			'Coffee',
			'Tea',
			'Milk',
			'Juice',
			'Soft drink',
			'Beer',
			'Wine',
			'Spirits',
			'Soup / broth'
		]);
		expect(p.sizes.map((s) => [s.name, s.ml])).toEqual([
			['Cup', 200],
			['Glass', 250],
			['Mug', 300],
			['Can', 330],
			['Bottle', 500],
			['Wine glass', 150],
			['Shot', 40]
		]);
		const usual = Object.fromEntries(p.drinks.map((d) => [d.id, d.sizeId]));
		expect(usual).toEqual({
			water: 'glass',
			coffee: 'cup',
			tea: 'mug',
			milk: 'glass',
			juice: 'glass',
			soft: 'can',
			beer: 'bottle',
			wine: 'wineGlass',
			spirits: 'shot',
			soup: 'mug'
		});
		expect(p.drinks[0]!.stored).toBe('def:water');
		expect(p.sizes[0]!.stored).toBe('def:cup');
	});

	it('merges overrides, own items, hidden items and order with the built-ins', () => {
		const saved: DrinkPresetsPayload = {
			v: 1,
			type: 'drink_presets',
			drinks: [
				{ id: 'u1', name: 'Cider', sizeId: 'u2' },
				{ id: 'water', name: 'Tap water', sizeId: 'mug' },
				{ id: 'beer', hidden: true }
			],
			sizes: [
				{ id: 'glass', ml: 200 },
				{ id: 'u2', name: 'Pint', ml: 568 },
				{ id: 'can', name: 'Tin', hidden: true }
			]
		};
		const p = resolvePresets(saved, nameOf);
		expect(p.drinks.slice(0, 3).map((d) => d.name)).toEqual(['Cider', 'Tap water', 'Beer']);
		// Built-ins that are not mentioned are added at the end, in the built-in order.
		expect(p.drinks.slice(3).map((d) => d.id)).toEqual([
			'coffee',
			'tea',
			'milk',
			'juice',
			'soft',
			'wine',
			'spirits',
			'soup'
		]);
		expect(visibleDrinks(p).map((d) => d.id)).not.toContain('beer');
		const water = p.drinks.find((d) => d.id === 'water')!;
		expect(water).toMatchObject({ stored: 'Tap water', isDefault: true, sizeId: 'mug' });
		const glass = p.sizes.find((s) => s.id === 'glass')!;
		expect(glass).toMatchObject({ ml: 200, name: 'Glass', stored: 'def:glass' });
		expect(p.sizes.find((s) => s.id === 'u2')).toMatchObject({ name: 'Pint', ml: 568, isDefault: false });
		expect(visibleSizes(p).map((s) => s.id)).not.toContain('can');
		expect(p.sizes.find((s) => s.id === 'can')).toMatchObject({ name: 'Tin', hidden: true, ml: 330 });
	});

	it('falls back to the first visible size when the usual size is hidden or gone', () => {
		const p = resolvePresets(
			{ v: 1, type: 'drink_presets', drinks: [], sizes: [{ id: 'glass', hidden: true }] },
			nameOf
		);
		const water = p.drinks.find((d) => d.id === 'water');
		expect(usualSize(p, water)?.id).toBe('cup');
		expect(usualSize(p, undefined)?.id).toBe('cup');
	});

	it('picks the most recently changed presets record', () => {
		const a = rec('a', { v: 1, type: 'drink_presets', drinks: [], sizes: [] }, 5);
		const b = rec('b', { v: 1, type: 'drink_presets', drinks: [{ id: 'tea', hidden: true }], sizes: [] }, 9);
		expect(findPresets([a, b, entry('e', at, 100)])?.id).toBe('b');
		expect(findPresets([entry('e', at, 100)])).toBeUndefined();
	});

	it('turns an edited draft into a small record and back', () => {
		const p = resolvePresets(undefined, nameOf);
		const draft = draftOf(p);
		// Untouched: only the order is saved.
		expect(
			presetsFromDraft(draft.drinks, draft.sizes, nameOf)!.drinks.every((d) => Object.keys(d).length === 1)
		).toBe(true);
		draft.drinks.find((d) => d.id === 'tea')!.name = 'Green tea';
		draft.drinks.find((d) => d.id === 'beer')!.hidden = true;
		draft.drinks.find((d) => d.id === 'water')!.sizeId = 'cup';
		draft.sizes.find((s) => s.id === 'glass')!.cl = '22,5';
		draft.sizes.push({ id: 'u9', isDefault: false, name: 'Pint', cl: '56.8', hidden: false });
		draft.drinks.push({ id: 'u8', isDefault: false, name: 'Cider', hidden: false, sizeId: 'u9' });
		const out = presetsFromDraft(draft.drinks, draft.sizes, nameOf)!;
		expect(parsePayload(out)).not.toBeNull();
		expect(out.drinks.find((d) => d.id === 'tea')).toEqual({ id: 'tea', name: 'Green tea' });
		expect(out.drinks.find((d) => d.id === 'beer')).toEqual({ id: 'beer', hidden: true });
		expect(out.drinks.find((d) => d.id === 'water')).toEqual({ id: 'water', sizeId: 'cup' });
		expect(out.sizes.find((s) => s.id === 'glass')).toEqual({ id: 'glass', ml: 225 });
		expect(out.sizes.find((s) => s.id === 'u9')).toEqual({ id: 'u9', name: 'Pint', ml: 568 });
		const again = resolvePresets(out, nameOf);
		expect(again.drinks.find((d) => d.id === 'tea')!.name).toBe('Green tea');
		expect(again.sizes.find((s) => s.id === 'glass')!.ml).toBe(225);
		expect(again.drinks.at(-1)!.name).toBe('Cider');
	});

	it('refuses a draft with an empty name or a bad volume', () => {
		const draft = draftOf(resolvePresets(undefined, nameOf));
		expect(draftProblem(draft.drinks, draft.sizes)).toBeNull();
		draft.sizes[0]!.cl = 'lots';
		expect(draftProblem(draft.drinks, draft.sizes)).toBe('cup');
		expect(presetsFromDraft(draft.drinks, draft.sizes, nameOf)).toBeNull();
		draft.sizes[0]!.cl = '20';
		draft.drinks[1]!.name = '  ';
		expect(draftProblem(draft.drinks, draft.sizes)).toBe('coffee');
	});

	it('moves items one place and stops at the ends', () => {
		expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
		expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
		expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
		expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
	});

	it('matches stored names back to presets, and keeps unknown ones as they were', () => {
		const p = resolvePresets(
			{
				v: 1,
				type: 'drink_presets',
				drinks: [{ id: 'u1', name: 'Cider' }],
				sizes: [{ id: 'glass', ml: 200 }]
			},
			nameOf
		);
		expect(findDrink(p, 'def:wine')?.id).toBe('wine');
		expect(findDrink(p, 'cider')?.id).toBe('u1');
		expect(findDrink(p, 'Kombucha')).toBeUndefined();
		expect(findSize(p, 'def:wineGlass', 150, nameOf)?.id).toBe('wineGlass');
		// The glass was 25 cl when this was logged, so it no longer matches the 20 cl glass.
		expect(findSize(p, 'def:glass', 250, nameOf)).toBeUndefined();
		expect(storedLabel('size', 'def:glass', nameOf)).toBe('Glass');
		expect(storedLabel('size', 'def:nope', nameOf)).toBe('def:nope');
		expect(storedLabel('drink', 'Cider', nameOf)).toBe('Cider');
	});
});

describe('same again and the day total', () => {
	it('picks the most recent drink by its time, not by when it was saved', () => {
		const all = [
			entry('a', '2026-10-18T08:00:00+02:00', 100, 50),
			entry('b', '2026-10-18T12:00:00+02:00', 200, 10),
			entry('c', '2026-10-17T20:00:00+02:00', 300, 99),
			rec('n', { v: 1, type: 'note', at: '2026-10-18T13:00:00+02:00', text: 'x', tags: [] })
		];
		expect(lastDrink(all)?.id).toBe('b');
		expect(lastDrink([])).toBeUndefined();
	});

	it('repeats drink, size and count at the new time, without the note', () => {
		const previous = drink({ note: 'with lunch' }) as DrinkPayload;
		const next = sameAgain(previous, '2026-10-19T09:00:00+02:00');
		expect(next).toEqual({
			v: 1,
			type: 'drink',
			at: '2026-10-19T09:00:00+02:00',
			drink: 'def:wine',
			size: 'def:wineGlass',
			sizeMl: 150,
			count: 2,
			totalMl: 300
		});
		expect(parsePayload(next)).not.toBeNull();
	});

	it('adds up the totals of one day and nothing else', () => {
		const all = [
			rec('a', drink({ at: '2026-10-18T08:00:00+02:00' }) as DrinkPayload),
			entry('b', '2026-10-18T23:30:00+02:00', 250),
			entry('c', '2026-10-19T00:10:00+02:00', 500),
			rec('d', { v: 1, type: 'note', at: '2026-10-18T10:00:00+02:00', text: 'x', tags: [] })
		];
		expect(dayTotalMl(all, '2026-10-18')).toBe(550);
		expect(dayTotalMl(all, '2026-10-19')).toBe(500);
		expect(dayTotalMl(all, '2026-10-20')).toBe(0);
	});
});
