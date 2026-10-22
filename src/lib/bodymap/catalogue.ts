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

export const SPACES = [
	'2d-front-v1',
	'2d-back-v1',
	'2d-head-front-v2',
	'2d-head-back-v2',
	'2d-hand-v1',
	'2d-foot-v1'
] as const;
export type Space = (typeof SPACES)[number];
export const SIDES = ['left', 'right', 'midline'] as const;
export type Side = (typeof SIDES)[number];
/**
 * The two main views, and the three close-ups (zoom views) opened from them. Each has its own coordinate space; the head
 * close-up has two (`head` is its front, `head_back` its back).
 */
export type View = 'front' | 'back';
export const VIEWS: readonly View[] = ['front', 'back'];
export const ZOOMS = ['head', 'hand', 'foot'] as const;
export type Zoom = (typeof ZOOMS)[number];
export type ViewId = View | Zoom | 'head_back';
/** Which side of the head the head close-up shows. */
export type HeadFace = 'front' | 'back';
/** Which face of a hand (palm, back of hand) or foot (top, sole) a close-up shows. */
export type Face = 'palm' | 'back' | 'top' | 'sole';
export const FACES: Record<'hand' | 'foot', readonly [Face, Face]> = {
	hand: ['palm', 'back'],
	foot: ['top', 'sole']
};

const SPACE_OF: Record<ViewId, Space> = {
	front: '2d-front-v1',
	back: '2d-back-v1',
	head: '2d-head-front-v2',
	head_back: '2d-head-back-v2',
	hand: '2d-hand-v1',
	foot: '2d-foot-v1'
};
export const spaceOf = (view: ViewId): Space => SPACE_OF[view];
/** The view (or close-up) whose coordinate space this is. */
export const viewIdOf = (space: Space): ViewId =>
	(Object.keys(SPACE_OF) as ViewId[]).find((v) => SPACE_OF[v] === space)!;
export const isZoomSpace = (space: Space): boolean =>
	viewIdOf(space) !== 'front' && viewIdOf(space) !== 'back';
/** The main view to show for a space: close-ups belong to the front view (the Find list and sheet go back to it). */
export const viewOf = (space: Space): View => (space === '2d-back-v1' ? 'back' : 'front');
export const isSpace = (x: unknown): x is Space => SPACES.includes(x as Space);
export const isSide = (x: unknown): x is Side => SIDES.includes(x as Side);

export type RegionDef = {
	id: string;
	/** Paired regions exist as `left` and `right`; the others are `midline`. */
	paired: boolean;
	/** Which views draw this region: main views and/or close-ups (`head` = head front, `head_back` = head back). */
	views: readonly ViewId[];
	/** The region this one refines: a close-up region's main-view part, or a belly, back or head area's wider area. */
	parent?: string;
	/** Paired regions that are also valid on the midline: the wider "whole upper belly" and "whole lower belly". */
	midline?: boolean;
	/** In a hand or foot close-up, the faces that draw it (all of them when left out). */
	faces?: readonly Face[];
};

/**
 * Head to toe, front regions first, then the ones only the back shows, then the close-up regions.
 *
 * Wider areas (for diffuse pain): `belly` and `back` are midline regions that are the parents of the four belly quarters
 * and of the three back parts. `upper_belly` and `lower_belly` are also valid on the midline, where they mean the whole
 * upper or lower belly. Existing left/right points stay valid as they are. The head close-up has the same idea: `head_side`,
 * `head_front_side`, `head_back_side`, `whole_head` and `head_band` are wider areas over its zones.
 */
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
	{ id: 'belly', paired: false, views: ['front'] },
	{ id: 'upper_belly', paired: true, midline: true, views: ['front'], parent: 'belly' },
	{ id: 'lower_belly', paired: true, midline: true, views: ['front'], parent: 'belly' },
	{ id: 'hip_groin', paired: true, views: ['front'] },
	{ id: 'thigh', paired: true, views: ['front'] },
	{ id: 'knee', paired: true, views: ['front', 'back'] },
	{ id: 'shin', paired: true, views: ['front'] },
	{ id: 'ankle', paired: true, views: ['front', 'back'] },
	{ id: 'foot', paired: true, views: ['front'] },
	{ id: 'back_of_head', paired: false, views: ['back'] },
	{ id: 'back_of_neck', paired: false, views: ['back'] },
	{ id: 'back', paired: false, views: ['back'] },
	{ id: 'upper_back', paired: false, views: ['back'], parent: 'back' },
	{ id: 'mid_back', paired: false, views: ['back'], parent: 'back' },
	{ id: 'lower_back', paired: false, views: ['back'], parent: 'back' },
	{ id: 'buttock', paired: true, views: ['back'] },
	{ id: 'back_of_thigh', paired: true, views: ['back'] },
	{ id: 'calf', paired: true, views: ['back'] },
	// The heel is drawn on the back view and on the sole of the foot close-up.
	{ id: 'heel', paired: true, views: ['back', 'foot'], faces: ['sole'] },
	// Head close-up, front (faces the person, so it mirrors them like the front view). Zones follow how headache diaries
	// describe location (side and broad areas), not face landmarks; `behind_eye` is drawn inside `around_eye`.
	{ id: 'forehead', paired: true, views: ['head'], parent: 'head' },
	{ id: 'temple', paired: true, views: ['head'], parent: 'head' },
	{ id: 'around_eye', paired: true, views: ['head'], parent: 'head' },
	{ id: 'behind_eye', paired: true, views: ['head'], parent: 'head' },
	{ id: 'cheek', paired: true, views: ['head'], parent: 'head' },
	{ id: 'jaw', paired: true, views: ['head'], parent: 'head' },
	// Head close-up, back (does not mirror).
	{ id: 'top_of_head', paired: false, views: ['head_back'], parent: 'head' },
	{ id: 'rear_head', paired: true, views: ['head_back'], parent: 'head' },
	{ id: 'rear_neck', paired: true, views: ['head_back'], parent: 'head' },
	// Wider head areas (not tappable): highlights built from the zones above, see "Wider areas".
	{ id: 'head_front_side', paired: true, views: ['head'], parent: 'head' },
	{ id: 'head_back_side', paired: true, views: ['head_back'], parent: 'head' },
	{ id: 'head_side', paired: true, views: ['head', 'head_back'], parent: 'head' },
	{ id: 'whole_head', paired: false, views: ['head', 'head_back'], parent: 'head' },
	{ id: 'head_band', paired: false, views: ['head', 'head_back'], parent: 'head' },
	// Hand close-up: one hand at a time, palm or back (fingers show on both).
	{ id: 'thumb', paired: true, views: ['hand'], parent: 'hand' },
	{ id: 'index_finger', paired: true, views: ['hand'], parent: 'hand' },
	{ id: 'middle_finger', paired: true, views: ['hand'], parent: 'hand' },
	{ id: 'ring_finger', paired: true, views: ['hand'], parent: 'hand' },
	{ id: 'little_finger', paired: true, views: ['hand'], parent: 'hand' },
	{ id: 'palm', paired: true, views: ['hand'], parent: 'hand', faces: ['palm'] },
	{ id: 'heel_of_hand', paired: true, views: ['hand'], parent: 'hand', faces: ['palm'] },
	{ id: 'back_of_hand', paired: true, views: ['hand'], parent: 'hand', faces: ['back'] },
	// Foot close-up: one foot at a time, top or sole (toes show on both).
	{ id: 'big_toe', paired: true, views: ['foot'], parent: 'foot' },
	{ id: 'second_toe', paired: true, views: ['foot'], parent: 'foot' },
	{ id: 'third_toe', paired: true, views: ['foot'], parent: 'foot' },
	{ id: 'fourth_toe', paired: true, views: ['foot'], parent: 'foot' },
	{ id: 'little_toe', paired: true, views: ['foot'], parent: 'foot' },
	{ id: 'top_of_foot', paired: true, views: ['foot'], parent: 'foot', faces: ['top'] },
	{ id: 'inner_ankle', paired: true, views: ['foot'], parent: 'foot', faces: ['top'] },
	{ id: 'outer_ankle', paired: true, views: ['foot'], parent: 'foot', faces: ['top'] },
	{ id: 'sole', paired: true, views: ['foot'], parent: 'foot', faces: ['sole'] },
	{ id: 'arch', paired: true, views: ['foot'], parent: 'foot', faces: ['sole'] }
] as const satisfies readonly RegionDef[];

export type RegionId = (typeof DEFS)[number]['id'];
export const REGIONS: readonly RegionDef[] = DEFS;
export const REGION_IDS: readonly RegionId[] = DEFS.map((d) => d.id);

const byId = new Map<string, RegionDef>(REGIONS.map((r) => [r.id, r]));
export const regionDef = (id: string): RegionDef | undefined => byId.get(id);
export const isRegionId = (x: unknown): x is RegionId => typeof x === 'string' && byId.has(x);

/** The sides a region can be marked on. */
export const sidesOf = (id: RegionId): readonly Side[] => {
	const def = regionDef(id);
	if (!def?.paired) return ['midline'];
	return def.midline ? ['right', 'left', 'midline'] : ['right', 'left'];
};

/** Is this a real place on the map: known region, a side that region has, and a view that draws it? */
export function isPlace(region: unknown, side: unknown, space: unknown): boolean {
	if (!isRegionId(region) || !isSide(side) || !isSpace(space)) return false;
	return sidesOf(region).includes(side) && (regionDef(region)?.views.includes(viewIdOf(space)) ?? false);
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

// ---- Geometry ----
//
// Every view has its own viewBox: the main views are 200 x 440, the close-ups are smaller. A shape is a rounded
// rectangle (optionally rotated about a pivot), the same soft mannequin style everywhere.

export const VIEWBOX = { w: 200, h: 440 } as const;
const VIEWBOXES: Record<ViewId, { w: number; h: number }> = {
	front: VIEWBOX,
	back: VIEWBOX,
	head: { w: 200, h: 240 },
	head_back: { w: 200, h: 240 },
	hand: { w: 200, h: 290 },
	foot: { w: 200, h: 300 }
};
export const viewBoxOf = (view: ViewId): { w: number; h: number } => VIEWBOXES[view];

export type Shape = {
	key: string;
	region: RegionId;
	side: Side;
	space: Space;
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
	/**
	 * Drawn mirrored (hand and foot close-ups, where one drawing serves both sides and both faces). Stored `u` is always
	 * measured in the unmirrored drawing, so a point keeps its place when the person turns the hand or foot over.
	 */
	flip: boolean;
	/** The box (u, v) is measured in, when it is not the shape itself (a region of several segments). */
	box?: { x: number; y: number; w: number; h: number };
	/** Head zones are soft outlines (an SVG path in view coordinates) instead of rectangles; x, y, w, h are the bounding box. */
	d?: string;
	/** The polygon the outline was rounded from, in view coordinates. */
	poly?: readonly Pt[];
	/** A wider area is drawn as these shapes (a highlight over the zones it covers) instead of its own box. */
	cover?: readonly Shape[];
};
type Pt = readonly [number, number];

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
	/** Shape key when a region has several segments. */
	key?: string;
	/** Box that (u, v) is measured in, when a region has several segments sharing one position space. [x, y, w, h] */
	box?: [number, number, number, number];
	/** Force a midline shape for a paired region: the wider "whole upper belly" and so on. */
	mid?: boolean;
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
/**
 * Wider areas of the front view: the bounding boxes of the quarters they cover. They are not tappable (the quarters
 * are); they are drawn as a soft highlight when a point uses them, with the dot at the centre.
 */
const FRONT_WIDE: Spec[] = [
	spec('belly', 74, 131, 52, 73, { r: 14, mid: true }),
	spec('upper_belly', 74, 131, 52, 38, { r: 12, mid: true }),
	spec('lower_belly', 76, 172, 48, 32, { r: 12, mid: true })
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
const BACK_WIDE: Spec[] = [spec('back', 74, 79, 52, 125, { r: 14, mid: true })];

/**
 * Head close-up. Two drawings (front: mirrors the person like the front view; back: does not), 200 x 240. Zones are soft
 * rounded polygons that follow the outline of the head with a 3 unit gap between them; the left half of the screen is
 * described and mirrored for the other half. Ears, neck and the faint face features are drawn for recognition only
 * (not tappable): closed eyes, brows, a nose line and a neutral, straight mouth.
 */
const HEAD_GAP = 1.5;
const MID = 100 - HEAD_GAP;
/** Half the width of the front outline at height y (an egg: wide cranium, tapering jaw). */
const frontHalf = (y: number): number =>
	y <= 84
		? 60 * Math.sqrt(Math.max(0, 1 - ((84 - y) / 64) ** 2))
		: y <= 110
			? 60 - 2 * ((y - 84) / 26)
			: 58 * Math.sqrt(Math.max(0, 1 - ((y - 110) / 86) ** 2));
/** The same for the back of the head. */
const backHalf = (y: number): number => 62 * Math.sqrt(Math.max(0, 1 - ((y - 96) / 76) ** 2));
type Half = (y: number) => number;
const outline = (half: Half, y0: number, y1: number, n: number): Pt[] =>
	Array.from({ length: n + 1 }, (_, i) => {
		const y = y0 + ((y1 - y0) * i) / n;
		return [100 - half(y), y] as const;
	});
const mirrorPt = (p: Pt): Pt => [200 - p[0], p[1]];

/** A polygon with softly rounded corners (each corner cut by `r`, at most half of either edge). */
function softPath(pts: readonly Pt[], r: number): string {
	const n = pts.length;
	const f = (v: number) => Math.round(v * 10) / 10;
	let d = '';
	for (let i = 0; i < n; i++) {
		const p = pts[i]!;
		const a = pts[(i + n - 1) % n]!;
		const b = pts[(i + 1) % n]!;
		const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
		const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
		const k = Math.min(r, la / 2, lb / 2);
		const p1 = [p[0] + ((a[0] - p[0]) * k) / la, p[1] + ((a[1] - p[1]) * k) / la];
		const p2 = [p[0] + ((b[0] - p[0]) * k) / lb, p[1] + ((b[1] - p[1]) * k) / lb];
		d += `${i === 0 ? 'M' : 'L'}${f(p1[0]!)} ${f(p1[1]!)}Q${f(p[0])} ${f(p[1])} ${f(p2[0]!)} ${f(p2[1]!)}`;
	}
	return d + 'Z';
}

type HeadZone = { region: RegionId; pts: Pt[]; r?: number; paired?: boolean };
const zone = (region: RegionId, pts: Pt[], r = 6): HeadZone => ({ region, pts, r });
/** A zone drawn once, centred (it spans both halves): its points are the full outline. */
const centred = (region: RegionId, pts: Pt[], r = 8): HeadZone => ({ region, pts, r, paired: false });

const FRONT_ROW = { eyeTop: 72, eyeBottom: 108, cheekTop: 111, cheekBottom: 146 };
const HEAD_FRONT: HeadZone[] = [
	zone('forehead', [[MID, 20.2], ...outline(frontHalf, 21.5, 52.5, 14), [63, 69], [MID, 69]], 7),
	zone('temple', [...outline(frontHalf, 56, 108, 12), [60, 108], [60, 72]], 7),
	zone('around_eye', [
		[63, FRONT_ROW.eyeTop],
		[MID, FRONT_ROW.eyeTop],
		[MID, FRONT_ROW.eyeBottom],
		[63, FRONT_ROW.eyeBottom]
	]),
	zone('behind_eye', [
		[72, 82],
		[91, 82],
		[91, 100],
		[72, 100]
	]),
	zone('cheek', [
		[63, FRONT_ROW.cheekTop],
		[MID, FRONT_ROW.cheekTop],
		[MID, FRONT_ROW.cheekBottom],
		[72, FRONT_ROW.cheekBottom],
		[63, 138]
	]),
	zone(
		'jaw',
		[...outline(frontHalf, 111, 194.5, 14), [MID, 195], [MID, 150], [75, 150], [60, 139], [60, 111]],
		7
	)
];
/** The screen-left half of the top of the head (the zone itself is one piece across the middle). */
const TOP_HALF: Pt[] = [...outline(backHalf, 20.2, 64, 14), [MID, 64], [MID, 20.2]];
const HEAD_BACK: HeadZone[] = [
	centred('top_of_head', [
		...outline(backHalf, 20.2, 64, 14),
		...outline(backHalf, 64, 20.2, 14).map(mirrorPt)
	]),
	zone('rear_head', [[MID, 67.5], ...outline(backHalf, 67.5, 168, 18), [MID, 171]], 8),
	zone(
		'rear_neck',
		[
			[70, 178],
			[MID, 178],
			[MID, 232],
			[70, 232]
		],
		8
	)
];
/** The band around the head, drawn on both views as one midline highlight. */
const bandPts = (half: Half, y0: number, y1: number): Pt[] => [
	[100 - half(y0) - 2, y0],
	[100 + half(y0) + 2, y0],
	[100 + half(y1) + 2, y1],
	[100 - half(y1) - 2, y1]
];
const BAND = { front: bandPts(frontHalf, 44, 90), back: bandPts(backHalf, 80, 120) } as const;

const bbox = (pts: readonly Pt[]) => {
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};
function pathShape(region: RegionId, side: Side, space: Space, key: string, pts: Pt[], r: number): Shape {
	return {
		key,
		region,
		side,
		space,
		...bbox(pts),
		rx: 0,
		ry: 0,
		rot: 0,
		px: 0,
		py: 0,
		flip: false,
		d: softPath(pts, r),
		poly: pts
	};
}

/** The zones of one head drawing, left half of the screen mirrored for the other half. */
function buildHead(face: HeadFace): Shape[] {
	const space = spaceOf(face === 'front' ? 'head' : 'head_back');
	const { screenLeft, screenRight } = edgeSides(face);
	return (face === 'front' ? HEAD_FRONT : HEAD_BACK).flatMap((z) => {
		const r = z.r ?? 6;
		if (z.paired === false) return [pathShape(z.region, 'midline', space, z.region, z.pts, r)];
		return [
			pathShape(z.region, screenLeft, space, `${z.region}:${screenLeft}`, z.pts, r),
			pathShape(z.region, screenRight, space, `${z.region}:${screenRight}`, z.pts.map(mirrorPt), r)
		];
	});
}

/** The widest highlight each wider head area uses, over the zones of this drawing. */
const FRONT_OF_SIDE: readonly string[] = ['forehead', 'temple', 'around_eye', 'behind_eye'];
const BACK_OF_SIDE: readonly string[] = ['rear_head', 'rear_neck'];
function buildHeadWide(face: HeadFace, zones: readonly Shape[]): Shape[] {
	const space = spaceOf(face === 'front' ? 'head' : 'head_back');
	const wide = (region: RegionId, side: Side, cover: readonly Shape[]): Shape => ({
		key: `${region}:${side}`,
		region,
		side,
		space,
		...bbox(cover.flatMap((c) => c.poly ?? [])),
		rx: 0,
		ry: 0,
		rot: 0,
		px: 0,
		py: 0,
		flip: false,
		cover
	});
	const out: Shape[] = [];
	for (const side of ['right', 'left'] as const) {
		const mine = zones.filter((z) => z.side === side);
		// "This side" also takes the near half of the top of the head (back view): the zone cut down the middle.
		const half: Shape[] = [];
		if (face === 'back') {
			const left = TOP_HALF;
			const pts = edgeSides(face).screenLeft === side ? left : left.map(mirrorPt);
			half.push(pathShape('top_of_head', 'midline', space, `top_of_head:${side}`, pts, 8));
		}
		if (face === 'front') {
			out.push(
				wide(
					'head_front_side',
					side,
					mine.filter((z) => FRONT_OF_SIDE.includes(z.region))
				)
			);
			out.push(wide('head_side', side, mine));
		} else {
			out.push(
				wide(
					'head_back_side',
					side,
					mine.filter((z) => BACK_OF_SIDE.includes(z.region))
				)
			);
			out.push(wide('head_side', side, [...mine, ...half]));
		}
	}
	out.push(wide('whole_head', 'midline', zones));
	out.push(
		wide('head_band', 'midline', [
			pathShape('head_band', 'midline', space, 'head_band:band', [...BAND[face]], 9)
		])
	);
	return out;
}

/** Not tappable: ears and neck behind the zones, and the faint face features over them. */
export type Decor = { d: string; kind: 'body' | 'feature' };
const ear = (cx: number, cy: number): string => `M${cx} ${cy - 16}c-10 0-10 32 0 32c10 0 10-32 0-32Z`;
const EARS = (frontFace: boolean): Decor[] => {
	const y = frontFace ? 110 : 112;
	const x = frontFace ? 38 : 36;
	return [
		{ d: ear(x, y), kind: 'body' },
		{ d: ear(200 - x, y), kind: 'body' }
	];
};
const DECOR_FRONT: Decor[] = [
	...EARS(true),
	{ d: 'M80 188h40v38q0 6-6 6H86q-6 0-6-6Z', kind: 'body' },
	// Brows, closed eyes, a nose line and a straight, neutral mouth. Faint on purpose.
	{ d: 'M66 78q11-6 25-1M134 78q-11-6-25-1', kind: 'feature' },
	{ d: 'M74 90.5q8.5 5 17 0M126 90.5q-8.5 5-17 0', kind: 'feature' },
	{ d: 'M100.5 104L98 127q1 4 6 3', kind: 'feature' },
	{ d: 'M88 160h24', kind: 'feature' }
];
const DECOR_BACK: Decor[] = EARS(false);

/** Hand close-up as drawn with the thumb on the right (the person's right palm, or their left hand's back). */
const fingerBase = 140;
const HAND_PALM: Spec[] = [
	spec('palm', 54, 140, 88, 84, { r: 24 }),
	spec('heel_of_hand', 54, 228, 88, 44, { r: 20 })
];
const HAND_BACK: Spec[] = [spec('back_of_hand', 54, 140, 88, 132, { r: 26 })];
const HAND_DIGITS: Spec[] = [
	spec('little_finger', 56, 84, 17, 56, { r: 8.5, rot: -10, px: 64.5, py: fingerBase }),
	spec('ring_finger', 76, 64, 18, 76, { r: 9, rot: -4, px: 85, py: fingerBase }),
	spec('middle_finger', 97, 56, 19, 84, { r: 9.5 }),
	spec('index_finger', 119, 66, 18, 74, { r: 9, rot: 5, px: 128, py: fingerBase }),
	spec('thumb', 133, 152, 20, 62, { r: 10, rot: 32, px: 143, py: 214 })
];

/**
 * Foot close-up: ONE footprint silhouette serves both faces, drawn as the person's right foot with the big toe (the inner
 * side) on the viewer's left. The Top / Sole toggle only changes which regions the same segments stand for:
 * sole: five toes, `sole` (the ball), `arch` (midfoot), `heel`;
 * top: the same five toes, `top_of_foot` (ball and midfoot together) and `inner_ankle` / `outer_ankle` (the two halves of
 * the heel end; the inner one is on the big toe side).
 * A region of several segments (`top_of_foot`) shares one box (`box`), so (u, v) means the same wherever it was tapped.
 */
const FOOT_TOES: Spec[] = [
	spec('big_toe', 50, 36, 38, 52, { r: 19 }),
	spec('second_toe', 92, 30, 24, 42, { r: 12 }),
	spec('third_toe', 120, 38, 22, 36, { r: 11 }),
	spec('fourth_toe', 145, 48, 20, 32, { r: 10 }),
	spec('little_toe', 168, 60, 18, 28, { r: 9 })
];
const FOOT_BALL = { x: 50, y: 92, w: 134, h: 74 } as const;
const FOOT_MID = { x: 92, y: 170, w: 78, h: 54 } as const;
const FOOT_TOP_BOX: [number, number, number, number] = [50, 92, 134, 132];
const FOOT_TOP: Spec[] = [
	spec('top_of_foot', FOOT_BALL.x, FOOT_BALL.y, FOOT_BALL.w, FOOT_BALL.h, { r: 34, box: FOOT_TOP_BOX }),
	spec('top_of_foot', FOOT_MID.x, FOOT_MID.y, FOOT_MID.w, FOOT_MID.h, {
		r: 24,
		box: FOOT_TOP_BOX,
		key: 'top_of_foot:mid'
	}),
	spec('inner_ankle', 90, 228, 37, 58, { r: 18 }),
	spec('outer_ankle', 131, 228, 37, 58, { r: 18 })
];
const FOOT_SOLE: Spec[] = [
	spec('sole', FOOT_BALL.x, FOOT_BALL.y, FOOT_BALL.w, FOOT_BALL.h, { r: 34 }),
	spec('arch', FOOT_MID.x, FOOT_MID.y, FOOT_MID.w, FOOT_MID.h, { r: 24 }),
	spec('heel', 90, 228, 78, 58, { r: 30 })
];

function shapeBase(space: Space, s: Spec) {
	const r = s.r ?? Math.min(s.w, s.h) / 2;
	return {
		region: s.region,
		space,
		y: s.y,
		w: s.w,
		h: s.h,
		rx: s.round ? s.w / 2 : r,
		ry: s.round ? s.h / 2 : r
	};
}

/** Main views: paired regions are drawn once on each half of the screen; midline ones are centred. */
function build(view: View, specs: Spec[]): Shape[] {
	const space = spaceOf(view);
	const W = VIEWBOXES[view].w;
	const out: Shape[] = [];
	for (const s of specs) {
		const paired = !s.mid && (regionDef(s.region)?.paired ?? false);
		const base = shapeBase(space, s);
		const rot = s.rot ?? 0;
		const px = s.px ?? 0;
		const py = s.py ?? 0;
		if (!paired) {
			out.push({ ...base, key: `${s.region}`, side: 'midline', x: s.x, rot, px, py, flip: false });
			continue;
		}
		// The shape on the left of the screen is the person's right in the front view, their left in the back view.
		const { screenLeft, screenRight } = edgeSides(view);
		out.push({
			...base,
			key: `${s.region}:${screenLeft}`,
			side: screenLeft,
			x: s.x,
			rot,
			px,
			py,
			flip: false
		});
		out.push({
			...base,
			key: `${s.region}:${screenRight}`,
			side: screenRight,
			x: W - s.x - s.w,
			rot: -rot,
			px: W - px,
			py,
			flip: false
		});
	}
	return out;
}

/** One hand or foot, all on `side`; `mirror` draws the canonical drawing the other way round. */
function buildOne(zoom: 'hand' | 'foot', side: 'left' | 'right', mirror: boolean, specs: Spec[]): Shape[] {
	const space = spaceOf(zoom);
	const W = VIEWBOXES[zoom].w;
	return specs.map((s) => {
		const base = shapeBase(space, s);
		const rot = s.rot ?? 0;
		const px = s.px ?? 0;
		const py = s.py ?? 0;
		const key = s.key ?? s.region;
		const bx = s.box ? { x: s.box[0], y: s.box[1], w: s.box[2], h: s.box[3] } : undefined;
		return mirror
			? {
					...base,
					key,
					side,
					x: W - s.x - s.w,
					rot: -rot,
					px: W - px,
					py,
					flip: true,
					box: bx && { ...bx, x: W - bx.x - bx.w }
				}
			: { ...base, key, side, x: s.x, rot, px, py, flip: false, box: bx };
	});
}

/** What a close-up shows: the head, or one hand or foot with the face turned towards the person. */
export type ZoomState =
	{ zoom: 'head'; face: HeadFace } | { zoom: 'hand' | 'foot'; side: 'left' | 'right'; face: Face };

/** What is drawn, and where taps and dots go. */
export type Scene = {
	space: Space;
	viewBox: { w: number; h: number };
	shapes: readonly Shape[];
	/** Wider areas: highlights only, never tapped. */
	wide: readonly Shape[];
	/** Ears, neck and faint face features of the head close-up: not tappable. */
	decor: readonly Decor[];
	/** The person's sides shown at the screen's edges (main views and the head); none for hand and foot. */
	edges: { screenLeft: 'left' | 'right'; screenRight: 'left' | 'right' } | null;
};

/** Draw the sole as seen toes-up (mirror of the top) instead of with the big toe on the same side as on top. */
const SOLE_TOES_UP = false;

const SCENES = new Map<string, Scene>();
function cached(key: string, make: () => Scene): Scene {
	let scene = SCENES.get(key);
	if (!scene) SCENES.set(key, (scene = make()));
	return scene;
}

export const mainScene = (view: View): Scene =>
	cached(view, () => ({
		space: spaceOf(view),
		viewBox: VIEWBOXES[view],
		shapes: build(view, view === 'front' ? FRONT : BACK),
		wide: build(view, view === 'front' ? FRONT_WIDE : BACK_WIDE),
		decor: [],
		edges: edgeSides(view)
	}));

export function zoomScene(z: ZoomState): Scene {
	if (z.zoom === 'head')
		return cached(`head:${z.face}`, () => {
			const shapes = buildHead(z.face);
			return {
				space: spaceOf(z.face === 'front' ? 'head' : 'head_back'),
				viewBox: VIEWBOXES.head,
				shapes,
				wide: buildHeadWide(z.face, shapes),
				decor: z.face === 'front' ? DECOR_FRONT : DECOR_BACK,
				edges: edgeSides(z.face)
			};
		});
	return cached(`${z.zoom}:${z.side}:${z.face}`, () => {
		if (z.zoom === 'hand') {
			// Palm of the right hand: thumb on the right. The back of the right hand and the palm of the left have it on the left.
			const mirror = (z.side === 'right') !== (z.face === 'palm');
			const specs = [...(z.face === 'palm' ? HAND_PALM : HAND_BACK), ...HAND_DIGITS];
			return {
				space: spaceOf('hand'),
				viewBox: VIEWBOXES.hand,
				shapes: buildOne('hand', z.side, mirror, specs),
				wide: [],
				decor: [],
				edges: null
			};
		}
		// One silhouette for both faces: the right foot has its big toe on the viewer's left, the left foot on the right.
		// (Seen from below with the toes up, a sole would be the mirror image; the owner asked for the same side on both
		// faces, so the sole is drawn as it would be seen with the foot turned over about its toe-to-heel axis. Flip
		// SOLE_TOES_UP to get the other reading: that mirrors the sole only.)
		const mirror = (z.side === 'left') !== (SOLE_TOES_UP && z.face === 'sole');
		const specs = [...FOOT_TOES, ...(z.face === 'top' ? FOOT_TOP : FOOT_SOLE)];
		return {
			space: spaceOf('foot'),
			viewBox: VIEWBOXES.foot,
			shapes: buildOne('foot', z.side, mirror, specs),
			wide: [],
			decor: [],
			edges: null
		};
	});
}

export const sceneOf = (view: View, zoom: ZoomState | null): Scene =>
	zoom ? zoomScene(zoom) : mainScene(view);

export const shapesOf = (view: View): readonly Shape[] => mainScene(view).shapes;
export const wideShapesOf = (view: View): readonly Shape[] => mainScene(view).wide;
/** A shape of a scene by region and side: a tappable one, or a wider area. */
export const sceneShape = (scene: Scene, region: string, side: Side): Shape | undefined =>
	scene.shapes.find((s) => s.region === region && s.side === side) ??
	scene.wide.find((s) => s.region === region && s.side === side);
export const findShape = (view: View, region: string, side: Side): Shape | undefined =>
	sceneShape(mainScene(view), region, side);

/** The close-up to show for a place in a close-up space (and, for fingers and toes, which face to keep). */
export function zoomFor(
	place: { region: string; side: Side; space: Space },
	current: ZoomState | null
): ZoomState | null {
	const view = viewIdOf(place.space);
	if (view === 'head' || view === 'head_back')
		return { zoom: 'head', face: view === 'head' ? 'front' : 'back' };
	if (view !== 'hand' && view !== 'foot') return null;
	const side = place.side === 'left' ? 'left' : 'right';
	const faces = FACES[view];
	const own = regionDef(place.region)?.faces?.find((f) => faces.includes(f));
	const keep = current && current.zoom === view && current.side === side ? current.face : undefined;
	return { zoom: view, side, face: own ?? keep ?? faces[0] };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A point in view coordinates to region-local `(u, v)` in 0..1 within the shape's own box (undoing any rotation). */
export function toLocal(shape: Shape, px: number, py: number): { u: number; v: number } {
	const a = rad(shape.rot);
	const dx = px - shape.px;
	const dy = py - shape.py;
	const lx = shape.px + dx * Math.cos(a) + dy * Math.sin(a);
	const ly = shape.py - dx * Math.sin(a) + dy * Math.cos(a);
	const b = shape.box ?? shape;
	const u = clamp01((lx - b.x) / b.w);
	return { u: shape.flip ? 1 - u : u, v: clamp01((ly - b.y) / b.h) };
}

/** Region-local `(u, v)` back to view coordinates, to draw a stored point. */
export function toView(shape: Shape, u: number, v: number): { x: number; y: number } {
	const a = rad(shape.rot);
	const b = shape.box ?? shape;
	const lx = b.x + (shape.flip ? 1 - u : u) * b.w;
	const ly = b.y + v * b.h;
	const dx = lx - shape.px;
	const dy = ly - shape.py;
	return {
		x: shape.px + dx * Math.cos(a) - dy * Math.sin(a),
		y: shape.py + dx * Math.sin(a) + dy * Math.cos(a)
	};
}

// ---- Wider areas ----
//
// A point on a belly quarter or a back part can be widened to the whole upper belly, lower belly, belly or back; a point
// on a head zone to the front or back of its side, its whole side, the whole head or a band around the head. A wider
// area has no tap position: its point is stored at the centre (u = v = 0.5) and drawn at the centre of the area's
// bounding box, with the whole area softly highlighted. Widening remembers the original quarter or zone in the draft (not
// in the record), so "This quarter" / "This spot" puts the point back where it was.

export type Anchor = { region: RegionId; side: Side; u: number; v: number; space?: Space };
export type WideId =
	| 'this'
	| 'upper_belly'
	| 'lower_belly'
	| 'whole_belly'
	| 'whole_back'
	| 'head_front_side'
	| 'head_back_side'
	| 'head_side'
	| 'whole_head'
	| 'head_band';
export type WideOption = { id: WideId; key: MessageKey; region: RegionId; side: Side };

const BELLY: readonly string[] = ['upper_belly', 'lower_belly', 'belly'];
const BACKS: readonly string[] = ['upper_back', 'mid_back', 'lower_back', 'back'];
/** The tappable zones of the head close-up, and the wider head areas built over them. */
const HEAD_ZONES: readonly string[] = [
	'forehead',
	'temple',
	'around_eye',
	'behind_eye',
	'cheek',
	'jaw',
	'top_of_head',
	'rear_head',
	'rear_neck'
];
const HEAD_WIDE: readonly string[] = [
	'head_front_side',
	'head_back_side',
	'head_side',
	'whole_head',
	'head_band'
];
export const wideGroup = (region: string): 'belly' | 'back' | 'head' | null =>
	BELLY.includes(region)
		? 'belly'
		: BACKS.includes(region)
			? 'back'
			: HEAD_ZONES.includes(region) || HEAD_WIDE.includes(region)
				? 'head'
				: null;
/** Wider head areas that exist on both head drawings: a point on one is drawn on whichever drawing is shown. */
export const isViewIndependent = (region: string): boolean =>
	region === 'head_side' || region === 'whole_head' || region === 'head_band';

/** The head drawing's space an area that only one drawing has belongs to, else undefined. */
function ownSpace(region: string): Space | undefined {
	const views = regionDef(region)?.views ?? [];
	const only = views.length === 1 ? views[0] : undefined;
	return only === 'head' || only === 'head_back' ? spaceOf(only) : undefined;
}

/** A quarter, back part or head zone, rather than a wider area. */
const isNarrow = (region: string, side: Side) =>
	(region === 'upper_belly' || region === 'lower_belly' ? side !== 'midline' : false) ||
	region === 'upper_back' ||
	region === 'mid_back' ||
	region === 'lower_back' ||
	HEAD_ZONES.includes(region);

/** Which drawing of the head a place is in: from its space, or else from its region when only one drawing has it. */
function headFaceOf(at: { region: string; space?: Space }): HeadFace | undefined {
	if (at.space === '2d-head-front-v2') return 'front';
	if (at.space === '2d-head-back-v2') return 'back';
	const views = regionDef(at.region)?.views ?? [];
	return views.length === 1 ? (views[0] === 'head_back' ? 'back' : 'front') : undefined;
}

function headOptions(
	at: { region: string; side: Side; space?: Space },
	home: { region: RegionId; side: Side } | undefined,
	shown?: HeadFace
): WideOption[] {
	const out: WideOption[] = [];
	if (home) out.push({ id: 'this', key: 'bodymap.wide.spot', region: home.region, side: home.side });
	// The side-wide choices need a side: a zone or area on one side (not the top of the head, the whole head or the band).
	const ref = home ?? at;
	const side = ref.side === 'left' || ref.side === 'right' ? ref.side : undefined;
	const face = shown ?? headFaceOf(at.space ? at : { region: ref.region });
	if (side) {
		if (face === 'back')
			out.push({ id: 'head_back_side', key: 'bodymap.wide.head_back_side', region: 'head_back_side', side });
		else
			out.push({
				id: 'head_front_side',
				key: 'bodymap.wide.head_front_side',
				region: 'head_front_side',
				side
			});
		out.push({ id: 'head_side', key: 'bodymap.wide.head_side', region: 'head_side', side });
	}
	out.push({ id: 'whole_head', key: 'bodymap.wide.whole_head', region: 'whole_head', side: 'midline' });
	out.push({ id: 'head_band', key: 'bodymap.wide.head_band', region: 'head_band', side: 'midline' });
	return out;
}

/**
 * The choices for a point on the belly, back or head, or none. `origin` is the quarter or zone it was widened from; `space`
 * (the head's drawing) decides between "front of this side" and "back of this side" for an area both drawings have.
 */
export function wideOptions(
	at: { region: string; side: Side; space?: Space },
	origin?: Anchor,
	shown?: HeadFace
): WideOption[] {
	const group = wideGroup(at.region);
	if (!group) return [];
	const home = isNarrow(at.region, at.side) ? { region: at.region as RegionId, side: at.side } : origin;
	if (group === 'head') return headOptions(at, home, shown);
	const out: WideOption[] = [];
	if (home)
		out.push({
			id: 'this',
			key: group === 'belly' ? 'bodymap.wide.quarter' : 'bodymap.wide.part',
			region: home.region,
			side: home.side
		});
	if (group === 'belly') {
		// Only the half that contains the quarter; when that is unknown (a wider area picked from Find) both halves.
		const half = home?.region ?? (at.region === 'belly' ? undefined : at.region);
		if (half !== 'lower_belly')
			out.push({
				id: 'upper_belly',
				key: 'bodymap.wide.upper_belly',
				region: 'upper_belly',
				side: 'midline'
			});
		if (half !== 'upper_belly')
			out.push({
				id: 'lower_belly',
				key: 'bodymap.wide.lower_belly',
				region: 'lower_belly',
				side: 'midline'
			});
		out.push({ id: 'whole_belly', key: 'bodymap.wide.whole_belly', region: 'belly', side: 'midline' });
	} else out.push({ id: 'whole_back', key: 'bodymap.wide.whole_back', region: 'back', side: 'midline' });
	return out;
}

/** The option the point is on now. */
export function activeWide(
	at: { region: string; side: Side },
	options: readonly WideOption[]
): WideId | undefined {
	if (isNarrow(at.region, at.side)) return 'this';
	return options.find((o) => o.id !== 'this' && o.region === at.region && o.side === at.side)?.id;
}

/**
 * The point after choosing an option: the new region and side with its position, and the place to remember. Widening
 * puts the point at the centre of the wider area; "This quarter" and "This spot" restore the remembered position.
 */
export function widen(
	at: Anchor,
	option: WideOption,
	origin?: Anchor
): { place: Anchor; origin: Anchor | undefined } {
	if (option.id === 'this') {
		const back = origin ?? at;
		return {
			place: { region: back.region, side: back.side, u: back.u, v: back.v, space: back.space },
			origin: undefined
		};
	}
	const remembered = isNarrow(at.region, at.side) ? { ...at } : origin;
	// An area only one head drawing has moves the point to that drawing; the others keep the point's space.
	const space = ownSpace(option.region) ?? at.space;
	return {
		place: { region: option.region, side: option.side, u: 0.5, v: 0.5, space },
		origin: remembered
	};
}

// ---- Parts of a wider area ----

export type Part = { region: RegionId; side: Side };

/** The narrow places (belly quarters, back parts, head zones) a place counts towards: itself, or the parts of a wider area. */
export function partsOf(region: RegionId, side: Side): Part[] {
	const own: Part[] = [{ region, side }];
	if (region === 'belly')
		return (['upper_belly', 'lower_belly'] as const).flatMap((r) => [
			{ region: r, side: 'right' as const },
			{ region: r, side: 'left' as const }
		]);
	if ((region === 'upper_belly' || region === 'lower_belly') && side === 'midline')
		return [
			{ region, side: 'right' },
			{ region, side: 'left' }
		];
	if (region === 'back')
		return (['upper_back', 'mid_back', 'lower_back'] as const).map((r) => ({ region: r, side: 'midline' }));
	if (!HEAD_WIDE.includes(region)) return own;
	const faces = (['front', 'back'] as const).map((face) => zoomScene({ zoom: 'head', face }));
	const area = (scene: Scene) => scene.wide.find((w) => w.region === region && w.side === side);
	const uniq = (shapes: readonly Shape[]): Part[] => {
		const seen = new Set<string>();
		const out: Part[] = [];
		for (const s of shapes) {
			const key = `${s.region}:${s.side}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({ region: s.region, side: s.side });
		}
		return out;
	};
	if (region === 'whole_head') return uniq(faces.flatMap((f) => f.shapes));
	if (region === 'head_band')
		// The band is a strip across the head: every zone whose box overlaps it (up and down).
		return uniq(
			faces.flatMap((f) => {
				const band = area(f);
				return band ? f.shapes.filter((z) => z.y < band.y + band.h && z.y + z.h > band.y) : [];
			})
		);
	// Front or back of a side, or a whole side (both drawings, with the top of the head): what the highlights cover.
	return uniq(faces.flatMap((f) => area(f)?.cover ?? []));
}

// ---- Places and the Find list ----

/** Where on the body: what a tap, or choosing from the Find list, reports. */
export type BodyPlace = { region: RegionId; side: Side; space: Space; u: number; v: number };

export type RegionChoice = { name: string; place: BodyPlace };

/**
 * Every region on every side it has, in a stable order (right before left, as the person would say it, then the midline
 * "whole" variants). A region drawn in both main views is placed in the `preferred` one; a close-up region is placed in
 * its close-up space.
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
