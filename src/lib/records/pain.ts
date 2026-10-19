/**
 * The `pain` record (ARCHITECTURE §5): one entry marks 1 to 20 points on the body map. The record keeps the name
 * `pain`; the app says "Body map" and "Where do you feel it?". Not wired into `parsePayload` yet: the entry screens
 * that create and show it come in the next branch.
 */
import { isRegionId, isPlace, type RegionId, type Side, type Space } from '$lib/bodymap/catalogue';
import { isAt, isAttachments, type AttachmentRef } from './types';

export const PAIN_QUALITIES = [
	'sharp',
	'dull',
	'burning',
	'throbbing',
	'aching',
	'tingling',
	'numb',
	'itchy'
] as const;
export type PainQuality = (typeof PAIN_QUALITIES)[number];

export const MAX_PAIN_POINTS = 20;
export const MAX_PAIN_QUALITIES = 3;
export const MAX_POINT_NOTE = 500;
export const MAX_PAIN_NOTE = 2000;

export type PainPoint = {
	region: RegionId;
	side: Side;
	space: Space;
	/** Region-local position, 0..1 within the region's box. */
	u: number;
	v: number;
	/** 0 to 10, always shown as a number. */
	intensity: number;
	qualities: PainQuality[];
	note?: string;
};

export type PainPayload = {
	v: 1;
	type: 'pain';
	at: string;
	points: PainPoint[];
	note?: string;
	attachments?: AttachmentRef[];
};

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isUnit = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const isQuality = (x: unknown): x is PainQuality => PAIN_QUALITIES.includes(x as PainQuality);

export function isPainPoint(p: unknown): p is PainPoint {
	if (!isObj(p)) return false;
	return (
		isRegionId(p.region) &&
		isPlace(p.region, p.side, p.space) &&
		isUnit(p.u) &&
		isUnit(p.v) &&
		typeof p.intensity === 'number' &&
		Number.isInteger(p.intensity) &&
		p.intensity >= 0 &&
		p.intensity <= 10 &&
		Array.isArray(p.qualities) &&
		p.qualities.length <= MAX_PAIN_QUALITIES &&
		p.qualities.every(isQuality) &&
		new Set(p.qualities).size === p.qualities.length &&
		(p.note === undefined || (typeof p.note === 'string' && p.note.length <= MAX_POINT_NOTE))
	);
}

export function isPainPayload(o: unknown): o is PainPayload {
	return (
		isObj(o) &&
		o.v === 1 &&
		o.type === 'pain' &&
		isAt(o.at) &&
		Array.isArray(o.points) &&
		o.points.length >= 1 &&
		o.points.length <= MAX_PAIN_POINTS &&
		o.points.every(isPainPoint) &&
		(o.note === undefined || (typeof o.note === 'string' && o.note.length <= MAX_PAIN_NOTE)) &&
		isAttachments(o.attachments)
	);
}

/**
 * Plain scale of 0..10 to the seven colour steps of the heat ramp (`--heat-0` to `--heat-6`). It is a sequence for
 * reading, not a judgement: no step means "bad", and there are no thresholds. The number is always shown too.
 */
export function heatStep(intensity: number): number {
	if (intensity <= 0) return 0;
	if (intensity <= 2) return 1;
	if (intensity <= 4) return 2;
	if (intensity <= 6) return 3;
	if (intensity === 7) return 4;
	if (intensity <= 9) return 5;
	return 6;
}
