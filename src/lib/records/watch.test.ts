import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { againOptions, againPayload } from './log';
import { parsePayload, type Payload, type SavedMealPayload } from './types';
import {
	SUGGESTIONS,
	exposureTags,
	foodFromSaved,
	inline,
	lastSavedMeal,
	mealByHour,
	savedMealName,
	suggestionId,
	suggestionLabel,
	watchedItems
} from './watch';

// Synthetic data only.
const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord => ({
	id,
	rev: 1,
	updatedAt,
	payload
});
const saved = (name: string): SavedMealPayload => ({
	v: 1,
	type: 'saved_meal',
	name,
	meal: 'breakfast',
	text: `${name} with berries`,
	tags: ['home'],
	exposures: [
		{ id: 'w1', state: 'no' },
		{ id: 'gone', state: 'yes' }
	]
});
const text = {
	yes: (n: string) => `Contains ${inline(n)}`,
	no: (n: string) => `${n}-free`,
	unsure: (n: string) => `Maybe ${inline(n)}`
};

describe('meal type by hour', () => {
	it('follows the day', () => {
		expect([5, 9].map(mealByHour)).toEqual(['breakfast', 'breakfast']);
		expect([10, 14].map(mealByHour)).toEqual(['lunch', 'lunch']);
		expect(mealByHour(15)).toBe('snack');
		expect([17, 20].map(mealByHour)).toEqual(['dinner', 'dinner']);
		expect([21, 23, 0, 3].map(mealByHour)).toEqual(['snack', 'snack', 'snack', 'snack']);
	});
});

describe('exposure tags', () => {
	const names: Record<string, string> = { g: 'Gluten', l: 'Lactose', f: 'FODMAP' };
	it('words Yes, No and Not sure for watched items only', () => {
		const tags = exposureTags(
			[
				{ id: 'g', state: 'no' },
				{ id: 'l', state: 'yes' },
				{ id: 'f', state: 'unsure' },
				{ id: 'removed', state: 'yes' }
			],
			(id) => names[id],
			text
		);
		expect(tags).toEqual(['Gluten-free', 'Contains lactose', 'Maybe FODMAP']);
	});
	it('is empty without exposures', () => {
		expect(exposureTags(undefined, (id) => names[id], text)).toEqual([]);
	});
});

describe('watch list', () => {
	it('knows the 14 EU allergens plus the extras, each with a stable id', () => {
		expect(SUGGESTIONS.filter((s) => s.kind === 'allergen')).toHaveLength(14);
		expect(SUGGESTIONS).toHaveLength(21);
		expect(new Set(SUGGESTIONS.map((s) => s.id)).size).toBe(21);
	});
	it('tells suggestions from free text', () => {
		expect(suggestionId(suggestionLabel('gluten'))).toBe('gluten');
		expect(suggestionId('sug:unknown')).toBeNull();
		expect(suggestionId('Gluten')).toBeNull();
	});
	it('lists items in the person order', () => {
		const item = (order: number): Payload => ({
			v: 1,
			type: 'sensitivity',
			label: 'x',
			icon: 'leaf',
			kind: 'other',
			order
		});
		const ids = watchedItems([rec('b', item(2)), rec('a', item(1)), rec('c', item(3))]).map((w) => w.id);
		expect(ids).toEqual(['a', 'b', 'c']);
	});
	it('accepts the payloads the app writes', () => {
		expect(
			parsePayload({
				v: 1,
				type: 'sensitivity',
				label: suggestionLabel('gluten'),
				icon: 'wheat',
				kind: 'allergen',
				order: 0
			})
		).not.toBeNull();
		expect(parsePayload(saved('Oatmeal'))).not.toBeNull();
	});
});

describe('saved meals', () => {
	it('names a meal from the first line, kept short', () => {
		expect(savedMealName('Oatmeal\nwith berries')).toBe('Oatmeal');
		expect(savedMealName('  \n x ')).toBe('x');
		expect(savedMealName('a'.repeat(60))).toHaveLength(40);
	});
	it('finds the most recently saved one', () => {
		const all = [rec('a', saved('Old'), 1), rec('b', saved('New'), 5), rec('c', saved('Mid'), 3)];
		expect(lastSavedMeal(all)?.payload.name).toBe('New');
		expect(lastSavedMeal([])).toBeUndefined();
	});
	it('fills a meal entry and drops items no longer watched', () => {
		const food = foodFromSaved(saved('Oatmeal'), '2026-10-18T08:10:00+02:00', new Set(['w1']));
		expect(food.exposures).toEqual([{ id: 'w1', state: 'no' }]);
		expect(food.text).toBe('Oatmeal with berries');
		expect(parsePayload(food)).not.toBeNull();
		expect(foodFromSaved(saved('Oatmeal'), food.at, new Set()).exposures).toBeUndefined();
	});
	it('offers the last saved meal as an Again? repeat', () => {
		const now = new Date(2026, 9, 18, 9, 0);
		const options = againOptions([rec('m', saved('Oatmeal'))], now);
		expect(options).toHaveLength(1);
		const p = againPayload(options[0]!, now, new Set(['w1']));
		expect(p?.type).toBe('food');
	});
});
