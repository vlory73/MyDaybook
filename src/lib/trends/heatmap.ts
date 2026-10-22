/**
 * "Where it hurt": how many DAYS each place on the body map was logged in a period, and the average intensity of the
 * points logged there. Pure and descriptive: it counts and averages what the person logged, never rates it (no
 * thresholds, not a medical device).
 *
 * - A day counts once per place, however many entries or points it has there. A record belongs to the local day written
 *   in its `at`, as on the timeline.
 * - A wider area (whole belly, whole back, band around the head, ...) counts towards each of its parts (`partsOf`).
 * - Points in a close-up (head, hand, foot) also count towards the whole head, hand or foot of the main body (`roll`).
 * - The average is the mean of the intensities of the points counted for the place; no number when none has one.
 */
import type { StoredRecord } from '$lib/records/codec';
import type { PainPayload, PainPoint } from '$lib/records/pain';
import { dayKey } from '$lib/records/time';
import {
	FACES,
	mainScene,
	partsOf,
	regionDef,
	sceneShape,
	toView,
	viewIdOf,
	type Face,
	type RegionId,
	type Shape,
	type Side,
	type View,
	type Zoom
} from '$lib/bodymap/catalogue';

export type Heat = { region: RegionId; side: Side; days: number; avg: number | null };
export type HeatMap = {
	/** Narrow places, wider areas spread over their parts. Close-up places are here too. */
	places: Map<string, Heat>;
	/** The whole head, hand or foot of the main body: its own points plus everything logged in the close-up. */
	roll: Map<string, Heat>;
	/** Days logged at most for one place, and the number of days in the period with at least one point. */
	maxDays: number;
	daysWithPain: number;
};

export const heatKey = (region: string, side: Side): string => `${region}:${side}`;

type Acc = { region: RegionId; side: Side; days: Set<string>; sum: number; n: number };
function add(map: Map<string, Acc>, region: RegionId, side: Side, day: string, intensity: unknown) {
	const key = heatKey(region, side);
	let a = map.get(key);
	if (!a) map.set(key, (a = { region, side, days: new Set(), sum: 0, n: 0 }));
	a.days.add(day);
	if (typeof intensity === 'number' && Number.isFinite(intensity)) {
		a.sum += intensity;
		a.n++;
	}
}
const finish = (map: Map<string, Acc>): Map<string, Heat> =>
	new Map(
		[...map].map(([k, a]) => [
			k,
			{ region: a.region, side: a.side, days: a.days.size, avg: a.n > 0 ? a.sum / a.n : null }
		])
	);

/** The whole head, hand or foot a point belongs to on the main body, or null (head is one shape for both views). */
export function rollKey(p: Pick<PainPoint, 'region' | 'side' | 'space'>): string | null {
	const view = viewIdOf(p.space);
	if (view === 'head' || view === 'head_back' || p.region === 'head' || p.region === 'back_of_head')
		return heatKey('head', 'midline');
	if (view === 'hand' || p.region === 'hand') return heatKey('hand', p.side);
	if (view === 'foot' || p.region === 'foot') return heatKey('foot', p.side);
	return null;
}

export function heatmap(all: Iterable<StoredRecord>, days: readonly string[]): HeatMap {
	const wanted = new Set(days);
	const places = new Map<string, Acc>();
	const roll = new Map<string, Acc>();
	const withPain = new Set<string>();
	for (const r of all) {
		if (r.payload.type !== 'pain') continue;
		const day = dayKey((r.payload as PainPayload).at);
		if (!wanted.has(day)) continue;
		for (const p of (r.payload as PainPayload).points) {
			withPain.add(day);
			for (const part of partsOf(p.region, p.side)) add(places, part.region, part.side, day, p.intensity);
			const key = rollKey(p);
			if (key) {
				const [region, side] = key.split(':') as [RegionId, Side];
				add(roll, region, side, day, p.intensity);
			}
		}
	}
	const out = { places: finish(places), roll: finish(roll), maxDays: 0, daysWithPain: withPain.size };
	for (const h of [...out.places.values(), ...out.roll.values()]) out.maxDays = Math.max(out.maxDays, h.days);
	return out;
}

// ---- Which close-up a place belongs to ----

/** The close-up that shows a place, or null for a place on the main body only. The heel is on the sole of the foot too. */
export function zoomOf(region: RegionId): Zoom | null {
	if (region === 'heel') return 'foot';
	const parent = regionDef(region)?.parent;
	return parent === 'head' || parent === 'hand' || parent === 'foot' ? parent : null;
}

/** The face of a hand or foot with the most days logged on it (the first face when nothing is logged), for opening it. */
export function bestFace(heat: HeatMap, zoom: 'hand' | 'foot', side: 'left' | 'right'): Face {
	const faces = FACES[zoom];
	const score = (face: Face) =>
		[...heat.places.values()]
			.filter(
				(h) => h.side === side && zoomOf(h.region) === zoom && regionDef(h.region)?.faces?.includes(face)
			)
			.reduce((sum, h) => sum + h.days, 0);
	return score(faces[1]) > score(faces[0]) ? faces[1] : faces[0];
}

// ---- The colour ramp ----

/** Where each of the five steps of the ramp starts, when there are 11 days or more (the ramp is scaled above that). */
const LADDER = [1, 2, 4, 7, 10] as const;
const LADDER_TOP = 11;

export type Bucket = {
	/** First and last day count of the step; `to` is null for the last step ("10+"). */
	from: number;
	to: number | null;
	/** The colour token this step uses: `--heat-1` to `--heat-5`. */
	token: number;
};

/**
 * Steps of the legend for the most days logged in the period (`max`). The ladder is 1 · 2–3 · 4–6 · 7–9 · 10+ up to 11
 * days. A longer period scales the starts of the steps by max / 11 (rounded, each at least one more than the one before)
 * so the darkest colour stays rare. With fewer days the steps that start above the maximum are dropped, so a maximum of
 * 1 gives one step, 2 gives 1 · 2+, 3 gives 1 · 2+, and 5 gives 1 · 2–3 · 4+. Fewer steps use spread-out colours
 * (one: the middle; two: lightest and darkest; three: light, middle, dark). No step means anything; it is a count.
 */
export function buckets(max: number): Bucket[] {
	if (!(max >= 1)) return [];
	const f = Math.max(1, max / LADDER_TOP);
	const starts: number[] = [];
	for (const base of LADDER) {
		const raw = base === 1 ? 1 : Math.round(base * f);
		const from = Math.max(raw, (starts.at(-1) ?? 0) + 1);
		if (from <= max) starts.push(from);
	}
	const k = starts.length;
	const token = (i: number) => (k === 1 ? 3 : Math.round(1 + (i * 4) / (k - 1)));
	return starts.map((from, i) => ({
		from,
		to: i === k - 1 ? null : starts[i + 1]! - 1,
		token: token(i)
	}));
}

/** The colour token (1 to 5) for a day count, or 0 when the place was not logged. */
export function tokenFor(days: number, steps: readonly Bucket[]): number {
	if (days <= 0) return 0;
	let found = 0;
	for (const b of steps) if (days >= b.from) found = b.token;
	return found;
}

// ---- Numbers on the figure ----

/** Size (in the figure's units) a place needs for its number to fit; the same for the main body and the close-ups. */
const MIN_W = 16;
const MIN_H = 13;
export const fitsNumber = (s: Pick<Shape, 'w' | 'h'>): boolean => s.w >= MIN_W && s.h >= MIN_H;

/** The average as shown: a whole number (intensities are whole numbers; the list says "avg 5"). */
export const roundAvg = (avg: number | null): number | null => (avg === null ? null : Math.round(avg));

// ---- The list ----

/** Most days first; ties: higher average, then name. Only places that were logged. */
export function rankPlaces(heats: Iterable<Heat>, name: (h: Heat) => string): Heat[] {
	return [...heats]
		.filter((h) => h.days > 0)
		.sort((a, b) => b.days - a.days || (b.avg ?? -1) - (a.avg ?? -1) || name(a).localeCompare(name(b)));
}

// ---- Timeline thumbnail ----

export type ThumbDot = { view: View; x: number; y: number };

/**
 * Where a point is drawn on the small body of a timeline entry: on its own spot on the main views; a close-up point on
 * the head, hand or foot of the main body (head: the front view, or the back view for the back of the head); a wider
 * area at the centre of its area.
 */
export function thumbDot(p: PainPoint): ThumbDot | null {
	const view = viewIdOf(p.space);
	const on = (v: View, region: string, side: Side, u: number, vv: number): ThumbDot | null => {
		const shape = sceneShape(mainScene(v), region, side);
		return shape ? { view: v, ...toView(shape, u, vv) } : null;
	};
	if (view === 'front' || view === 'back') {
		return on(view, p.region, p.side, p.u, p.v);
	}
	if (view === 'head' || view === 'head_back') {
		// Wider head areas that both drawings share sit on whichever drawing they were stored on.
		return view === 'head_back'
			? on('back', 'back_of_head', 'midline', 0.5, 0.5)
			: on('front', 'head', 'midline', 0.5, 0.5);
	}
	const side = p.side === 'left' ? 'left' : 'right';
	return on('front', view === 'hand' ? 'hand' : 'foot', side, 0.5, 0.5);
}

/** The dots of an entry's points, grouped by view, without two on the same spot. */
export function thumbDots(points: readonly PainPoint[]): Record<View, ThumbDot[]> {
	const out: Record<View, ThumbDot[]> = { front: [], back: [] };
	const seen = new Set<string>();
	for (const p of points) {
		const d = thumbDot(p);
		if (!d) continue;
		const key = `${d.view}:${d.x.toFixed(0)}:${d.y.toFixed(0)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out[d.view].push(d);
	}
	return out;
}
