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

export const SPACES = ['2d-front-v1', '2d-back-v1', '2d-head-v1', '2d-hand-v1', '2d-foot-v1'] as const;
export type Space = (typeof SPACES)[number];
export const SIDES = ['left', 'right', 'midline'] as const;
export type Side = (typeof SIDES)[number];
/** The two main views, and the three close-ups (zoom views) opened from them. Each has its own coordinate space. */
export type View = 'front' | 'back';
export const VIEWS: readonly View[] = ['front', 'back'];
export const ZOOMS = ['head', 'hand', 'foot'] as const;
export type Zoom = (typeof ZOOMS)[number];
export type ViewId = View | Zoom;
/** Which face of a hand (palm, back of hand) or foot (top, sole) a close-up shows. */
export type Face = 'palm' | 'back' | 'top' | 'sole';
export const FACES: Record<'hand' | 'foot', readonly [Face, Face]> = {
	hand: ['palm', 'back'],
	foot: ['top', 'sole']
};

const SPACE_OF: Record<ViewId, Space> = {
	front: '2d-front-v1',
	back: '2d-back-v1',
	head: '2d-head-v1',
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
	/** Which views draw this region: main views and/or close-ups. */
	views: readonly ViewId[];
	/** The region this one refines: a close-up region's main-view part, or a belly or back area's wider area. */
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
 * upper or lower belly. Existing left/right points stay valid as they are.
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
	// Head close-up (front-facing, mirrors the person like the front view).
	{ id: 'forehead', paired: false, views: ['head'], parent: 'head' },
	{ id: 'temple', paired: true, views: ['head'], parent: 'head' },
	{ id: 'eye', paired: true, views: ['head'], parent: 'head' },
	{ id: 'ear', paired: true, views: ['head'], parent: 'head' },
	{ id: 'nose', paired: false, views: ['head'], parent: 'head' },
	{ id: 'cheek', paired: true, views: ['head'], parent: 'head' },
	{ id: 'mouth', paired: false, views: ['head'], parent: 'head' },
	{ id: 'jaw', paired: true, views: ['head'], parent: 'head' },
	{ id: 'chin', paired: false, views: ['head'], parent: 'head' },
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
	head: { w: 200, h: 220 },
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

/** Head close-up, facing the person: mirrors them like the front view. Left half drawn, the other half mirrored. */
const HEAD: Spec[] = [
	spec('forehead', 66, 18, 68, 38, { r: 18 }),
	spec('temple', 48, 60, 20, 34, { r: 10 }),
	spec('eye', 72, 66, 24, 20, { r: 10 }),
	spec('ear', 28, 80, 18, 40, { r: 9 }),
	spec('nose', 90, 90, 20, 46, { r: 10 }),
	spec('cheek', 56, 98, 32, 36, { r: 14 }),
	spec('mouth', 80, 142, 40, 22, { r: 11 }),
	spec('jaw', 52, 138, 26, 50, { r: 12 }),
	spec('chin', 80, 170, 40, 28, { r: 12 })
];

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

/** Main views and the head: paired regions are drawn once on each half of the screen; midline ones are centred. */
function build(view: View | 'head', specs: Spec[]): Shape[] {
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
		const { screenLeft, screenRight } = edgeSides(view === 'back' ? 'back' : 'front');
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
export type ZoomState = { zoom: 'head' } | { zoom: 'hand' | 'foot'; side: 'left' | 'right'; face: Face };

/** What is drawn, and where taps and dots go. */
export type Scene = {
	space: Space;
	viewBox: { w: number; h: number };
	shapes: readonly Shape[];
	/** Wider areas: highlights only, never tapped. */
	wide: readonly Shape[];
	/** A soft outline drawn behind the shapes, not tappable (the head close-up), or none. */
	backdrop: { x: number; y: number; w: number; h: number; rx: number; ry: number } | null;
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
		backdrop: null,
		edges: edgeSides(view)
	}));

export function zoomScene(z: ZoomState): Scene {
	if (z.zoom === 'head')
		return cached('head', () => ({
			space: spaceOf('head'),
			viewBox: VIEWBOXES.head,
			shapes: build('head', HEAD),
			wide: [],
			backdrop: { x: 42, y: 8, w: 116, h: 200, rx: 58, ry: 72 },
			edges: edgeSides('front')
		}));
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
				backdrop: null,
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
			backdrop: null,
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
	if (view === 'head') return { zoom: 'head' };
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
// A point on a belly quarter or a back part can be widened to the whole upper belly, lower belly, belly or back. A wider
// area has no tap position: its point is stored at the centre (u = v = 0.5) and drawn at the centre of the area's
// bounding box, with the whole area softly highlighted. Widening remembers the original quarter in the draft (not in the
// record), so "This quarter" puts the point back where it was.

export type Anchor = { region: RegionId; side: Side; u: number; v: number };
export type WideId = 'this' | 'upper_belly' | 'lower_belly' | 'whole_belly' | 'whole_back';
export type WideOption = { id: WideId; key: MessageKey; region: RegionId; side: Side };

const BELLY: readonly string[] = ['upper_belly', 'lower_belly', 'belly'];
const BACKS: readonly string[] = ['upper_back', 'mid_back', 'lower_back', 'back'];
export const wideGroup = (region: string): 'belly' | 'back' | null =>
	BELLY.includes(region) ? 'belly' : BACKS.includes(region) ? 'back' : null;
/** A quarter or back part, rather than a wider area. */
const isNarrow = (region: string, side: Side) =>
	(region === 'upper_belly' || region === 'lower_belly' ? side !== 'midline' : false) ||
	region === 'upper_back' ||
	region === 'mid_back' ||
	region === 'lower_back';

/** The choices for a point on the belly or back, or none. `origin` is the quarter it was widened from. */
export function wideOptions(at: { region: string; side: Side }, origin?: Anchor): WideOption[] {
	const group = wideGroup(at.region);
	if (!group) return [];
	const out: WideOption[] = [];
	const home = isNarrow(at.region, at.side) ? { region: at.region as RegionId, side: at.side } : origin;
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
 * The point after choosing an option: the new region and side with its position, and the quarter to remember. Widening
 * puts the point at the centre of the wider area; "This quarter" restores the remembered position.
 */
export function widen(
	at: Anchor,
	option: WideOption,
	origin?: Anchor
): { place: Anchor; origin: Anchor | undefined } {
	if (option.id === 'this') {
		const back = origin ?? at;
		return { place: { region: back.region, side: back.side, u: back.u, v: back.v }, origin: undefined };
	}
	const remembered = isNarrow(at.region, at.side) ? { ...at } : origin;
	return { place: { region: option.region, side: option.side, u: 0.5, v: 0.5 }, origin: remembered };
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
