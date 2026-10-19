/**
 * The body map catalogue (ARCHITECTURE §5, "Body map"). Region IDs are stable and view-independent: a record stores
 * `region` + `side` + `space` + region-local `(u, v)`, never pixel positions, so the outline can be redrawn, or a 3D
 * model added later, without migrating data. Hand-drawn in-house, CC0.
 *
 * Sides are the person's own sides ("your left / your right"). The front view faces the person, so it mirrors them:
 * the shape drawn on the left of the screen is their RIGHT side. The back view does not mirror.
 */
import { translate, type Locale } from '$lib/i18n/core';
import type { MessageKey } from '$lib/i18n/en';

export const SPACES = ['2d-front-v1', '2d-back-v1'] as const;
export type Space = (typeof SPACES)[number];
export const SIDES = ['left', 'right', 'midline'] as const;
export type Side = (typeof SIDES)[number];
export type View = 'front' | 'back';
export const VIEWS: readonly View[] = ['front', 'back'];

export const spaceOf = (view: View): Space => (view === 'front' ? '2d-front-v1' : '2d-back-v1');
export const viewOf = (space: Space): View => (space === '2d-front-v1' ? 'front' : 'back');
export const isSpace = (x: unknown): x is Space => SPACES.includes(x as Space);
export const isSide = (x: unknown): x is Side => SIDES.includes(x as Side);

export type RegionDef = {
	id: string;
	/** Paired regions exist as `left` and `right`; the others are `midline`. */
	paired: boolean;
	/** Which main views draw this region. */
	views: readonly View[];
	/** For finer regions in zoom views (later): the main-view region they refine. */
	parent?: string;
};

/** Head to toe, front regions first, then the ones only the back shows. */
const DEFS = [
	{ id: 'head', paired: false, views: ['front'] },
	{ id: 'neck', paired: false, views: ['front'] },
	{ id: 'shoulder', paired: true, views: ['front', 'back'] },
	{ id: 'upper_arm', paired: true, views: ['front', 'back'] },
	{ id: 'elbow', paired: true, views: ['front', 'back'] },
	{ id: 'forearm', paired: true, views: ['front', 'back'] },
	{ id: 'wrist', paired: true, views: ['front', 'back'] },
	{ id: 'hand', paired: true, views: ['front', 'back'] },
	{ id: 'chest', paired: true, views: ['front'] },
	{ id: 'upper_belly', paired: true, views: ['front'] },
	{ id: 'lower_belly', paired: true, views: ['front'] },
	{ id: 'hip_groin', paired: true, views: ['front'] },
	{ id: 'thigh', paired: true, views: ['front'] },
	{ id: 'knee', paired: true, views: ['front', 'back'] },
	{ id: 'shin', paired: true, views: ['front'] },
	{ id: 'ankle', paired: true, views: ['front', 'back'] },
	{ id: 'foot', paired: true, views: ['front'] },
	{ id: 'back_of_head', paired: false, views: ['back'] },
	{ id: 'back_of_neck', paired: false, views: ['back'] },
	{ id: 'upper_back', paired: false, views: ['back'] },
	{ id: 'mid_back', paired: false, views: ['back'] },
	{ id: 'lower_back', paired: false, views: ['back'] },
	{ id: 'buttock', paired: true, views: ['back'] },
	{ id: 'back_of_thigh', paired: true, views: ['back'] },
	{ id: 'calf', paired: true, views: ['back'] },
	{ id: 'heel', paired: true, views: ['back'] }
] as const satisfies readonly RegionDef[];

export type RegionId = (typeof DEFS)[number]['id'];
export const REGIONS: readonly RegionDef[] = DEFS;
export const REGION_IDS: readonly RegionId[] = DEFS.map((d) => d.id);

const byId = new Map<string, RegionDef>(REGIONS.map((r) => [r.id, r]));
export const regionDef = (id: string): RegionDef | undefined => byId.get(id);
export const isRegionId = (x: unknown): x is RegionId => typeof x === 'string' && byId.has(x);

/** The sides a region can be marked on. */
export const sidesOf = (id: RegionId): readonly Side[] =>
	regionDef(id)?.paired ? ['right', 'left'] : ['midline'];

/** Is this a real place on the map: known region, a side that region has, and a view that draws it? */
export function isPlace(region: unknown, side: unknown, space: unknown): boolean {
	if (!isRegionId(region) || !isSide(side) || !isSpace(space)) return false;
	return sidesOf(region).includes(side) && (regionDef(region)?.views.includes(viewOf(space)) ?? false);
}

// ---- Labels ----

/** Message key of a region's full name; paired regions have one per side ("Your right knee"). */
export function regionKey(id: RegionId, side: Side): MessageKey {
	return (side === 'midline' ? `bodymap.region.${id}` : `bodymap.region.${id}.${side}`) as MessageKey;
}
export const regionName = (locale: Locale, id: RegionId, side: Side): string =>
	translate(locale, regionKey(id, side));

export const sideKey = (side: 'left' | 'right'): MessageKey =>
	side === 'left' ? 'bodymap.side.left' : 'bodymap.side.right';

/** The person's side shown at the left and right edge of the screen: the front view mirrors, the back does not. */
export function edgeSides(view: View): { screenLeft: 'left' | 'right'; screenRight: 'left' | 'right' } {
	return view === 'front'
		? { screenLeft: 'right', screenRight: 'left' }
		: { screenLeft: 'left', screenRight: 'right' };
}

// ---- Geometry (viewBox 0 0 200 440) ----

export const VIEWBOX = { w: 200, h: 440 } as const;

export type Shape = {
	key: string;
	region: RegionId;
	side: Side;
	view: View;
	x: number;
	y: number;
	w: number;
	h: number;
	rx: number;
	ry: number;
	/** Rotation in degrees about (px, py); 0 for most shapes. */
	rot: number;
	px: number;
	py: number;
};

type Spec = {
	region: RegionId;
	x: number;
	y: number;
	w: number;
	h: number;
	round?: boolean;
	r?: number;
	rot?: number;
	px?: number;
	py?: number;
};

const spec = (
	region: RegionId,
	x: number,
	y: number,
	w: number,
	h: number,
	extra: Partial<Spec> = {}
): Spec => ({ region, x, y, w, h, ...extra });

/** Arms hang slightly away from the body, rotated about the shoulder end. Same in both views. */
const arm = { rot: 6, px: 57, py: 104 };
const ARMS: Spec[] = [
	spec('shoulder', 51, 77, 23, 24, { r: 11.5 }),
	spec('upper_arm', 49, 104, 17, 54, { r: 8.5, ...arm }),
	spec('elbow', 49, 161, 17, 14, { r: 7, ...arm }),
	spec('forearm', 49.5, 178, 16, 38, { r: 8, ...arm }),
	spec('wrist', 50, 219, 15, 13, { r: 6.5, ...arm }),
	spec('hand', 48, 235, 19, 28, { r: 9, ...arm })
];

/** Drawn on the left half of the screen (paired regions are mirrored for the right half); midline ones are centred. */
const FRONT: Spec[] = [
	spec('head', 79, 10, 42, 50, { round: true }),
	spec('neck', 91, 63, 18, 13, { r: 5 }),
	...ARMS,
	spec('chest', 75, 79, 23.5, 48, { r: 12 }),
	spec('upper_belly', 74, 131, 24.5, 38, { r: 11 }),
	spec('lower_belly', 76, 172, 22.5, 32, { r: 11 }),
	spec('hip_groin', 72, 207, 26, 30, { r: 10 }),
	spec('thigh', 74, 240, 24, 70, { r: 11 }),
	spec('knee', 75, 313, 22, 22, { r: 11 }),
	spec('shin', 76, 338, 20, 48, { r: 9 }),
	spec('ankle', 77, 389, 18, 14, { r: 7 }),
	spec('foot', 68, 406, 28, 18, { r: 9 })
];
const BACK: Spec[] = [
	spec('back_of_head', 79, 10, 42, 50, { round: true }),
	spec('back_of_neck', 91, 63, 18, 13, { r: 5 }),
	...ARMS,
	spec('upper_back', 74, 79, 52, 48, { r: 12 }),
	spec('mid_back', 74, 131, 52, 38, { r: 10 }),
	spec('lower_back', 76, 172, 48, 32, { r: 10 }),
	spec('buttock', 72, 207, 26, 30, { r: 10 }),
	spec('back_of_thigh', 74, 240, 24, 70, { r: 11 }),
	spec('knee', 75, 313, 22, 22, { r: 11 }),
	spec('calf', 76, 338, 20, 48, { r: 9 }),
	spec('ankle', 77, 389, 18, 14, { r: 7 }),
	spec('heel', 75, 406, 22, 18, { r: 9 })
];

function build(view: View, specs: Spec[]): Shape[] {
	const out: Shape[] = [];
	for (const s of specs) {
		const paired = regionDef(s.region)?.paired ?? false;
		const r = s.r ?? Math.min(s.w, s.h) / 2;
		const base = {
			region: s.region,
			view,
			y: s.y,
			w: s.w,
			h: s.h,
			rx: s.round ? s.w / 2 : r,
			ry: s.round ? s.h / 2 : r
		};
		const rot = s.rot ?? 0;
		const px = s.px ?? 0;
		const py = s.py ?? 0;
		if (!paired) {
			out.push({ ...base, key: `${s.region}`, side: 'midline', x: s.x, rot, px, py });
			continue;
		}
		// The shape on the left of the screen is the person's right in the front view, their left in the back view.
		const { screenLeft, screenRight } = edgeSides(view);
		out.push({ ...base, key: `${s.region}:${screenLeft}`, side: screenLeft, x: s.x, rot, px, py });
		out.push({
			...base,
			key: `${s.region}:${screenRight}`,
			side: screenRight,
			x: VIEWBOX.w - s.x - s.w,
			rot: -rot,
			px: VIEWBOX.w - px,
			py
		});
	}
	return out;
}

const SHAPES: Record<View, Shape[]> = { front: build('front', FRONT), back: build('back', BACK) };
export const shapesOf = (view: View): readonly Shape[] => SHAPES[view];
export const findShape = (view: View, region: string, side: Side): Shape | undefined =>
	SHAPES[view].find((s) => s.region === region && s.side === side);

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A point in view coordinates to region-local `(u, v)` in 0..1 within the shape's own box (undoing any rotation). */
export function toLocal(shape: Shape, px: number, py: number): { u: number; v: number } {
	const a = rad(shape.rot);
	const dx = px - shape.px;
	const dy = py - shape.py;
	const lx = shape.px + dx * Math.cos(a) + dy * Math.sin(a);
	const ly = shape.py - dx * Math.sin(a) + dy * Math.cos(a);
	return { u: clamp01((lx - shape.x) / shape.w), v: clamp01((ly - shape.y) / shape.h) };
}

/** Region-local `(u, v)` back to view coordinates, to draw a stored point. */
export function toView(shape: Shape, u: number, v: number): { x: number; y: number } {
	const a = rad(shape.rot);
	const lx = shape.x + u * shape.w;
	const ly = shape.y + v * shape.h;
	const dx = lx - shape.px;
	const dy = ly - shape.py;
	return {
		x: shape.px + dx * Math.cos(a) - dy * Math.sin(a),
		y: shape.py + dx * Math.sin(a) + dy * Math.cos(a)
	};
}

// ---- Places and the Find list ----

/** Where on the body: what a tap, or choosing from the Find list, reports. */
export type BodyPlace = { region: RegionId; side: Side; space: Space; u: number; v: number };

export type RegionChoice = { name: string; place: BodyPlace };

/**
 * Every region on every side it has, in a stable order (right before left, as the person would say it). A region
 * drawn in both views is placed in the `preferred` one.
 */
export function allChoices(locale: Locale, preferred: View = 'front'): RegionChoice[] {
	const out: RegionChoice[] = [];
	for (const def of REGIONS) {
		const id = def.id as RegionId;
		const view = def.views.includes(preferred) ? preferred : def.views[0]!;
		for (const side of sidesOf(id)) {
			out.push({
				name: regionName(locale, id, side),
				place: { region: id, side, space: spaceOf(view), u: 0.5, v: 0.5 }
			});
		}
	}
	return out;
}

const norm = (s: string) => s.toLocaleLowerCase().trim();

/** Filters by the localised name: every word typed must appear in it. An empty query returns everything. */
export function findRegions(query: string, locale: Locale, preferred: View = 'front'): RegionChoice[] {
	const words = norm(query).split(/\s+/).filter(Boolean);
	const all = allChoices(locale, preferred);
	if (words.length === 0) return all;
	return all.filter((c) => {
		const name = norm(c.name);
		return words.every((w) => name.includes(w));
	});
}
