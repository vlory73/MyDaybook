import { formatAt, addDays, todayKey } from '../../src/lib/records/time';

// Synthetic data only (no real health information). Deterministic: the same shape every run, relative to today.
let seed = 20261022;
const rand = () => {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
};
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;

/** `at` for `daysAgo` days back from today at hh:mm, in this machine's offset. */
export function at(daysAgo: number, hh: number, mm = 0): string {
	const day = addDays(todayKey(), -daysAgo);
	const [y, m, d] = day.split('-').map(Number) as [number, number, number];
	return formatAt(new Date(y, m - 1, d, hh, mm));
}

const point = (intensity: number, region = 'knee') => ({
	region,
	side: region === 'lower_back' ? 'midline' : 'right',
	space: region === 'lower_back' ? '2d-back-v1' : '2d-front-v1',
	u: 0.5,
	v: 0.5,
	intensity,
	qualities: []
});

/** A short, hand-made set for functional tests: one record of each kind the Trends cards use. */
export function smallSet(): object[] {
	return [
		{ v: 1, type: 'feeling', at: at(1, 9), mood: 4, energy: 3, stress: 2, symptoms: [] },
		{ v: 1, type: 'feeling', at: at(0, 9), mood: 3, energy: 4, stress: 3, symptoms: [] },
		{ v: 1, type: 'sleep', at: at(1, 7), asleepAt: at(2, 23), quality: 4 },
		{ v: 1, type: 'sleep', at: at(0, 7), asleepAt: at(1, 23, 30), quality: 3 },
		{ v: 1, type: 'measurement', at: at(2, 8), typeId: 'weight', values: [72.8], unit: 'kg', context: [] },
		{ v: 1, type: 'measurement', at: at(0, 8), typeId: 'weight', values: [72.1], unit: 'kg', context: [] },
		{
			v: 1,
			type: 'drink',
			at: at(1, 10),
			drink: 'def:water',
			size: 'def:glass',
			sizeMl: 250,
			count: 2,
			totalMl: 500
		},
		{
			v: 1,
			type: 'dose',
			at: at(1, 8, 5),
			medicationId: 'synthetic-med',
			status: 'taken',
			slot: { date: addDays(todayKey(), -1), time: '08:00' }
		},
		{
			v: 1,
			type: 'dose',
			at: at(0, 9, 30),
			medicationId: 'synthetic-med',
			status: 'late',
			slot: { date: todayKey(), time: '08:00' }
		},
		{ v: 1, type: 'bowel', at: at(1, 12), bristol: 4, flags: [] },
		{ v: 1, type: 'gut', at: at(1, 15), symptoms: [{ kind: 'nausea', intensity: 3 }], flags: [] },
		{ v: 1, type: 'pain', at: at(1, 18), points: [point(4), point(7)] },
		{ v: 1, type: 'pain', at: at(0, 18), points: [point(5)] }
	];
}

/** Watch-list items; meals refer to their record ids, so meals are built after these are stored. */
export const watchRecord = {
	v: 1,
	type: 'sensitivity',
	label: 'sug:gluten',
	icon: 'wheat',
	kind: 'allergen',
	order: 0
};
export const watchRecord2 = {
	v: 1,
	type: 'sensitivity',
	label: 'sug:lactose',
	icon: 'milk',
	kind: 'intolerance',
	order: 1
};

export function mealsFor(glutenId: string): object[] {
	const meal = (daysAgo: number, hh: number, text: string, state: 'yes' | 'no') => ({
		v: 1,
		type: 'food',
		at: at(daysAgo, hh),
		meal: 'lunch',
		text,
		tags: [],
		exposures: [{ id: glutenId, state }]
	});
	return [
		meal(1, 12, 'Pasta salad', 'yes'),
		meal(2, 19, 'Rice and vegetables', 'no'),
		meal(4, 8, 'Toast with jam', 'yes'),
		meal(9, 13, 'Sandwich', 'yes')
	];
}

/** About a month of plausible synthetic entries for the screenshots. */
export const heartRateType = {
	v: 1,
	type: 'measurement_type',
	name: 'Resting heart rate',
	unit: 'bpm',
	valueCount: 1,
	decimals: 0
};

export function month(glutenId: string, heartRate: string): object[] {
	const out: object[] = [];
	for (let ago = 29; ago >= 0; ago--) {
		if (ago % 7 !== 3) {
			out.push({
				v: 1,
				type: 'feeling',
				at: at(ago, 9),
				mood: Math.round(between(2, 5)),
				energy: Math.round(between(1, 5)),
				stress: Math.round(between(1, 4)),
				symptoms: []
			});
		}
		if (ago % 5 !== 2) {
			const hours = between(5.8, 8.6);
			out.push({
				v: 1,
				type: 'sleep',
				at: at(ago, 7),
				asleepAt: formatAtMinus(ago, 7, Math.round(hours * 60)),
				...(rand() > 0.2 ? { quality: Math.round(between(2, 5)) } : {})
			});
		}
		if (ago % 3 === 0) {
			out.push({
				v: 1,
				type: 'measurement',
				at: at(ago, 8),
				typeId: 'weight',
				values: [Math.round((72 + between(-0.8, 0.8)) * 10) / 10],
				unit: 'kg',
				context: []
			});
		}
		if (ago % 4 === 1) {
			out.push({
				v: 1,
				type: 'measurement',
				at: at(ago, 8, 10),
				typeId: heartRate,
				values: [Math.round(between(58, 72))],
				unit: 'bpm',
				context: []
			});
		}
		const glasses = Math.round(between(4, 12));
		for (let k = 0; k < glasses && ago % 6 !== 4; k++) {
			out.push({
				v: 1,
				type: 'drink',
				at: at(ago, 8 + (k % 12), k * 3),
				drink: 'def:water',
				size: 'def:glass',
				sizeMl: 250,
				count: 1,
				totalMl: 250
			});
		}
		for (const [hh, slot] of [
			[8, '08:00'],
			[20, '20:00']
		] as const) {
			const roll = rand();
			out.push({
				v: 1,
				type: 'dose',
				at: at(ago, hh, roll < 0.1 ? 40 : 5),
				medicationId: 'synthetic-med',
				status: roll < 0.08 ? 'skipped' : roll < 0.2 ? 'late' : 'taken',
				slot: { date: addDays(todayKey(), -ago), time: slot }
			});
		}
		if (rand() > 0.35)
			out.push({ v: 1, type: 'bowel', at: at(ago, 10), bristol: pick([3, 4, 4, 4, 5, 6]), flags: [] });
		if (rand() > 0.6) out.push({ v: 1, type: 'bowel', at: at(ago, 19), bristol: pick([4, 5, 6]), flags: [] });
		if (rand() > 0.65) {
			out.push({
				v: 1,
				type: 'gut',
				at: at(ago, 14),
				symptoms: [{ kind: 'nausea', intensity: Math.round(between(1, 4)) }],
				flags: []
			});
		}
		if (rand() > 0.7) {
			out.push({
				v: 1,
				type: 'gut',
				at: at(ago, 21),
				symptoms: [{ kind: 'heartburn', intensity: Math.round(between(1, 3)) }],
				flags: []
			});
		}
		// Pain clusters: days 26-22, 18, 15-12 and 6-0 ago, with gaps between them.
		if ((ago <= 26 && ago >= 22) || ago === 18 || (ago <= 15 && ago >= 12) || ago <= 6) {
			const entries = 1 + (ago % 3 === 0 ? 1 : 0);
			for (let e = 0; e < entries; e++) {
				const points = Array.from({ length: 1 + (ago % 4 === 0 ? 2 : 0) }, () =>
					point(Math.round(between(1, 8)), pick(['knee', 'lower_back']))
				);
				out.push({ v: 1, type: 'pain', at: at(ago, 11 + e * 6), points });
			}
		}
	}
	for (const [ago, text, state] of [
		[1, 'Pasta salad, eating out', 'yes'],
		[5, 'Pizza', 'yes'],
		[8, 'Toast with jam', 'yes'],
		[11, 'Sandwich', 'yes'],
		[3, 'Rice and vegetables', 'no']
	] as const) {
		out.push({
			v: 1,
			type: 'food',
			at: at(ago, 12, 40),
			meal: 'lunch',
			text,
			tags: [],
			exposures: [{ id: glutenId, state }]
		});
	}
	return out;
}

function formatAtMinus(daysAgo: number, hh: number, minutes: number): string {
	const day = addDays(todayKey(), -daysAgo);
	const [y, m, d] = day.split('-').map(Number) as [number, number, number];
	return formatAt(new Date(new Date(y, m - 1, d, hh, 0).getTime() - minutes * 60_000));
}
