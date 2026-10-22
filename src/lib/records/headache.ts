/**
 * Headache details, the pure parts. A headache is a `pain` entry with a point on the head and/or an optional
 * `headache` object on the entry (ARCHITECTURE §5). Everything here repeats what the person entered or converts it to
 * the plain zones the doctor's diary form uses; nothing rates, advises or warns (not a medical device). The future
 * "Headache diary" report reuses these helpers.
 */
import { regionDef } from '$lib/bodymap/catalogue';
import { instant } from './time';
import { isAt } from './types';
import type { GutPayload, Payload } from './types';
import type { PainPayload, PainPoint } from './pain';

export const HEADACHE_BEFORE = ['vision', 'feeling', 'speech'] as const;
export type HeadacheBefore = (typeof HEADACHE_BEFORE)[number];
export const MAX_TRIGGER = 200;

/**
 * Optional details on a pain entry (entry level, not per point). Everything is optional; `{}` only says "this is a
 * headache" (the person ticked it without a point on the head).
 *
 * `started` and `stopped` are full local date-times rounded to the hour ("2026-10-18T22:00:00+02:00"), so a headache
 * that ended the next day needs no extra field and the offset travels with the value like every `at`. `stillGoing`
 * replaces `stopped` and is only ever `true`.
 */
export type HeadacheDetails = {
	started?: string;
	stopped?: string;
	stillGoing?: true;
	/** Changes noticed just before it started, in the order of HEADACHE_BEFORE. */
	before?: HeadacheBefore[];
	worseWithActivity?: boolean;
	light?: boolean;
	sound?: boolean;
	trigger?: string;
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const KEYS = ['started', 'stopped', 'stillGoing', 'before', 'worseWithActivity', 'light', 'sound', 'trigger'];
const HOUR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00(Z|[+-]\d{2}:\d{2})$/;
const isHour = (x: unknown): x is string => typeof x === 'string' && HOUR_RE.test(x) && isAt(x);
const isBool = (x: unknown) => x === undefined || typeof x === 'boolean';

export function isHeadacheDetails(x: unknown): x is HeadacheDetails {
	if (!isObj(x) || Object.keys(x).some((k) => !KEYS.includes(k))) return false;
	if (x.started !== undefined && !isHour(x.started)) return false;
	if (x.stopped !== undefined && !isHour(x.stopped)) return false;
	if (x.stillGoing !== undefined && x.stillGoing !== true) return false;
	if (x.stillGoing && x.stopped !== undefined) return false;
	if (
		typeof x.started === 'string' &&
		typeof x.stopped === 'string' &&
		instant(x.stopped) < instant(x.started)
	)
		return false;
	if (x.before !== undefined) {
		if (!Array.isArray(x.before) || x.before.length > HEADACHE_BEFORE.length) return false;
		if (!x.before.every((b) => HEADACHE_BEFORE.includes(b as HeadacheBefore))) return false;
		if (new Set(x.before).size !== x.before.length) return false;
	}
	if (!isBool(x.worseWithActivity) || !isBool(x.light) || !isBool(x.sound)) return false;
	return (
		x.trigger === undefined ||
		(typeof x.trigger === 'string' && x.trigger.trim() !== '' && x.trigger.length <= MAX_TRIGGER)
	);
}

/** True when the object holds at least one answer (an empty `{}` only marks the entry as a headache). */
export const hasHeadacheAnswers = (h: HeadacheDetails): boolean => Object.keys(h).length > 0;

export type Zone = 'mild' | 'moderate' | 'severe';

/** Pain 1 to 3 is mild, 4 to 6 moderate, 7 to 10 severe; 0 (or nothing) has no zone. A reading aid, not a threshold. */
export function zoneOf(n: number): Zone | null {
	if (!Number.isFinite(n) || n < 1) return null;
	return n <= 3 ? 'mild' : n <= 6 ? 'moderate' : 'severe';
}

/**
 * A point on the head: the main-view head or back of head, or any region of the head close-up (its parent is the head):
 * the zones (including the neck zones of the back drawing) and the wider areas (this side, whole head, band).
 */
export const isHeadPoint = (p: Pick<PainPoint, 'region'>): boolean =>
	p.region === 'head' || p.region === 'back_of_head' || regionDef(p.region)?.parent === 'head';

/** A pain entry with a point on the head, or with headache details (even an empty `{}`). */
export function isHeadacheEntry(payload: Payload): payload is PainPayload {
	return (
		payload.type === 'pain' && (payload.headache !== undefined || payload.points.some((p) => isHeadPoint(p)))
	);
}

/**
 * The day's severity zone: the average of all head-point intensities of the day's pain entries, rounded to the nearest
 * whole number (.5 up) before it is put in a zone. 0 on average, or no head points, gives null (nothing to report).
 */
export function dailySeverity(entriesOfDay: readonly PainPayload[]): Zone | null {
	const values = entriesOfDay.flatMap((e) => e.points.filter(isHeadPoint).map((p) => p.intensity));
	if (values.length === 0) return null;
	return zoneOf(Math.round(values.reduce((a, b) => a + b, 0) / values.length));
}

export type HeadacheSides = 'both' | 'right' | 'left' | 'none';

/**
 * Which side of the head: right, left, or both when points are on both sides. A zone or wider area on one side (temple,
 * "front of this side", "this side", ...) is that side. A point on the midline (top of the head, the whole head, the
 * band around the head, the main-view head and back of head) is not one-sided and counts as both. Mixed points are both.
 * No head points: none.
 */
export function headacheSides(points: readonly PainPoint[]): HeadacheSides {
	const head = points.filter(isHeadPoint);
	if (head.length === 0) return 'none';
	const left = head.some((p) => p.side === 'left');
	const right = head.some((p) => p.side === 'right');
	if ((left && right) || head.some((p) => p.side === 'midline')) return 'both';
	return left ? 'left' : 'right';
}

/** "Pulsating" when a head point is throbbing, "constant" when one is constant, both when both appear, else null. */
export function pulsatingOrConstant(points: readonly PainPoint[]): 'pulsating' | 'constant' | 'both' | null {
	const head = points.filter(isHeadPoint);
	const pulsating = head.some((p) => p.qualities.includes('throbbing'));
	const constant = head.some((p) => p.qualities.includes('constant'));
	return pulsating && constant ? 'both' : pulsating ? 'pulsating' : constant ? 'constant' : null;
}

export type NauseaLevel = 'none' | Zone;

/** Nausea logging (strength 1 to 5) in the diary's words: 1-2 mild, 3 moderate, 4-5 severe. */
export const nauseaZone = (n: number): Zone => (n <= 2 ? 'mild' : n === 3 ? 'moderate' : 'severe');

/** The strongest nausea logged that day, or "none" when there is none. Heartburn is ignored. */
export function nauseaLevel(gutEntriesOfDay: readonly GutPayload[]): NauseaLevel {
	const values = gutEntriesOfDay.flatMap((g) =>
		g.symptoms.filter((s) => s.kind === 'nausea').map((s) => s.intensity)
	);
	return values.length === 0 ? 'none' : nauseaZone(Math.max(...values));
}
