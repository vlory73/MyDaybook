/**
 * Record payloads, version 1 (ARCHITECTURE §5.3). This is what lives inside the ciphertext.
 * Every payload has `v: 1` and a `type`; entries that happen at a moment also have `at`, an ISO 8601 timestamp with
 * the UTC offset the person was in when they logged it ("2026-10-18T08:10:00+02:00"). Pain, medication and dose
 * types arrive in later milestones; `parsePayload` returns null for types it does not know yet, and the store keeps
 * such records out of the UI instead of failing.
 * Validators are small and hand-written: a payload that fails them is skipped, never trusted.
 */

export const PAYLOAD_VERSION = 1;

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const;
export const WHERE = ['home', 'out', 'takeaway'] as const;
export const EXPOSURE_STATES = ['no', 'unsure', 'yes'] as const;
export const SENSITIVITY_KINDS = ['intolerance', 'allergen', 'other'] as const;
export const BOWEL_FLAGS = ['urgent', 'straining', 'pain', 'notFinished', 'blood', 'mucus'] as const;

export type Meal = (typeof MEALS)[number];
export type ExposureState = (typeof EXPOSURE_STATES)[number];
export type Exposure = { id: string; state: ExposureState };
/** `severity` is 1 to 3 in the app (mild, medium, strong); it is optional because noting a tag is enough. */
export type Symptom = { tag: string; severity?: number };

type Base<T extends string> = { v: 1; type: T };
type Timed<T extends string> = Base<T> & { at: string };

export type FoodPayload = Timed<'food'> & {
	meal: Meal;
	text: string;
	tags: string[];
	where?: (typeof WHERE)[number];
	exposures?: Exposure[];
};
export type FeelingPayload = Timed<'feeling'> & {
	mood?: number;
	energy?: number;
	stress?: number;
	symptoms: Symptom[];
	note?: string;
};
/** `at` is the moment of waking, so the night belongs to the day it ended on. */
export type SleepPayload = Timed<'sleep'> & {
	asleepAt: string;
	quality?: number;
	awakenings?: number;
	naps?: { from: string; to: string }[];
	note?: string;
};
export type MeasurementPayload = Timed<'measurement'> & {
	/** `weight` for the built-in type, otherwise the record id of a `measurement_type`. */
	typeId: string;
	values: number[];
	unit: string;
	context: string[];
	note?: string;
};
export type MeasurementTypePayload = Base<'measurement_type'> & {
	name: string;
	unit: string;
	valueCount: number;
	decimals: number;
};
export type BowelPayload = Timed<'bowel'> & {
	bristol: number;
	flags: (typeof BOWEL_FLAGS)[number][];
	note?: string;
};
export type NotePayload = Timed<'note'> & { text: string; tags: string[] };
export type SensitivityPayload = Base<'sensitivity'> & {
	label: string;
	icon: string;
	kind: (typeof SENSITIVITY_KINDS)[number];
	order: number;
};
export type SavedMealPayload = Base<'saved_meal'> & {
	name: string;
	meal: Meal;
	text: string;
	tags: string[];
	exposures: Exposure[];
};
export type SettingsPayload = Base<'settings'> & { values: Record<string, string | number | boolean> };
export type TagPayload = Base<'tag'> & { name: string };

export type Payload =
	| FoodPayload
	| FeelingPayload
	| SleepPayload
	| MeasurementPayload
	| MeasurementTypePayload
	| BowelPayload
	| NotePayload
	| SensitivityPayload
	| SavedMealPayload
	| SettingsPayload
	| TagPayload;

export type PayloadType = Payload['type'];
/** Payloads that carry an event time and appear on the Today timeline. */
export type TimedPayload = Extract<Payload, { at: string }>;

// ---- Small validators ----

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max = 10_000): x is string => typeof x === 'string' && x.length <= max;
const isInt = (x: unknown, min: number, max: number): x is number =>
	typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const optInt = (x: unknown, min: number, max: number) => x === undefined || isInt(x, min, max);
const optStr = (x: unknown, max = 10_000) => x === undefined || isStr(x, max);
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => list.includes(x as T);
const strList = (x: unknown, max = 50): x is string[] =>
	Array.isArray(x) && x.length <= max && x.every((s) => isStr(s, 100));

const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** An ISO timestamp with an offset that also names a real calendar day and time. */
export function isAt(x: unknown): x is string {
	if (typeof x !== 'string' || !AT_RE.test(x) || Number.isNaN(Date.parse(x))) return false;
	const [y, m, d] = x.slice(0, 10).split('-').map(Number) as [number, number, number];
	const probe = new Date(Date.UTC(y, m - 1, d));
	return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

const isExposures = (x: unknown): x is Exposure[] =>
	Array.isArray(x) &&
	x.length <= 50 &&
	x.every((e) => isObj(e) && isStr(e.id, 100) && oneOf(EXPOSURE_STATES, e.state));

function isTimed(o: Obj): boolean {
	return isAt(o.at);
}

const validators: { [K in PayloadType]: (o: Obj) => boolean } = {
	food: (o) =>
		isTimed(o) &&
		oneOf(MEALS, o.meal) &&
		isStr(o.text) &&
		strList(o.tags) &&
		(o.where === undefined || oneOf(WHERE, o.where)) &&
		(o.exposures === undefined || isExposures(o.exposures)),
	feeling: (o) =>
		isTimed(o) &&
		optInt(o.mood, 1, 5) &&
		optInt(o.energy, 1, 5) &&
		optInt(o.stress, 1, 5) &&
		Array.isArray(o.symptoms) &&
		o.symptoms.length <= 50 &&
		o.symptoms.every((s) => isObj(s) && isStr(s.tag, 100) && optInt(s.severity, 1, 5)) &&
		optStr(o.note),
	sleep: (o) =>
		isTimed(o) &&
		isAt(o.asleepAt) &&
		optInt(o.quality, 1, 5) &&
		optInt(o.awakenings, 0, 3) &&
		(o.naps === undefined ||
			(Array.isArray(o.naps) &&
				o.naps.length <= 10 &&
				o.naps.every((n) => isObj(n) && isAt(n.from) && isAt(n.to)))) &&
		optStr(o.note),
	measurement: (o) =>
		isTimed(o) &&
		isStr(o.typeId, 100) &&
		Array.isArray(o.values) &&
		o.values.length >= 1 &&
		o.values.length <= 3 &&
		o.values.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
		isStr(o.unit, 40) &&
		strList(o.context) &&
		optStr(o.note),
	measurement_type: (o) =>
		isStr(o.name, 100) && isStr(o.unit, 40) && isInt(o.valueCount, 1, 3) && isInt(o.decimals, 0, 4),
	bowel: (o) =>
		isTimed(o) &&
		isInt(o.bristol, 1, 7) &&
		Array.isArray(o.flags) &&
		o.flags.every((f) => oneOf(BOWEL_FLAGS, f)) &&
		optStr(o.note),
	note: (o) => isTimed(o) && isStr(o.text) && strList(o.tags),
	sensitivity: (o) =>
		isStr(o.label, 100) && isStr(o.icon, 40) && oneOf(SENSITIVITY_KINDS, o.kind) && isInt(o.order, 0, 10_000),
	saved_meal: (o) =>
		isStr(o.name, 100) &&
		oneOf(MEALS, o.meal) &&
		isStr(o.text) &&
		strList(o.tags) &&
		isExposures(o.exposures),
	settings: (o) =>
		isObj(o.values) &&
		Object.values(o.values).every((x) => ['string', 'number', 'boolean'].includes(typeof x)),
	tag: (o) => isStr(o.name, 100)
};

/** Returns the payload when it is a valid v1 payload of a known type, otherwise null. */
export function parsePayload(x: unknown): Payload | null {
	if (!isObj(x) || x.v !== PAYLOAD_VERSION || typeof x.type !== 'string') return null;
	if (!Object.hasOwn(validators, x.type)) return null;
	return validators[x.type as PayloadType](x) ? (x as Payload) : null;
}

export function hasAt(p: Payload): p is TimedPayload {
	return 'at' in p;
}
