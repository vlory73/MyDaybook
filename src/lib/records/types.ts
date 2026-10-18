/**
 * Record payloads, version 1 (ARCHITECTURE §5.3). This is what lives inside the ciphertext.
 * Every payload has `v: 1` and a `type`; entries that happen at a moment also have `at`, an ISO 8601 timestamp with
 * the UTC offset the person was in when they logged it ("2026-10-18T08:10:00+02:00"). Pain and dose
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

/**
 * A photo attached to a record (ARCHITECTURE §5.2). The keys live only here, inside the encrypted record, so the
 * server cannot tell which record a blob belongs to. `thumbId` is a second, small blob for the timeline.
 */
export type AttachmentRef = {
	id: string;
	/** URL-safe base64 of the 32-byte attachment key. */
	key: string;
	thumbId: string;
	thumbKey: string;
	w: number;
	h: number;
	mime: 'image/jpeg';
};
export const MAX_ATTACHMENTS = 4;

/** Any record type may carry photos (D8), so that "has a photo" does not reveal "this is a meal". */
type Base<T extends string> = { v: 1; type: T; attachments?: AttachmentRef[] };
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

export const MED_FORMS = [
	'tablet',
	'capsule',
	'liquid',
	'drops',
	'spray',
	'inhaler',
	'cream',
	'patch',
	'injection',
	'other'
] as const;
/** Suggested units; `unit` itself is free text (up to 40 characters), so "other" is simply what the person typed. */
export const MED_UNITS = ['mg', 'g', 'µg', 'ml', 'IU', '%', 'drops', 'puffs'] as const;
export type MedForm = (typeof MED_FORMS)[number];
/** Weekdays are numbered like JavaScript's `getDay()`: 0 = Sunday ... 6 = Saturday. */
export type MedSchedule =
	| { kind: 'daily' }
	| { kind: 'weekdays'; days: number[] }
	| { kind: 'every_n_days'; n: number; from: string }
	| { kind: 'as_needed' };
/** `amount` is free text exactly as the person entered it ("1 tablet", "5 ml"); the app never interprets it. */
export type MedTime = { time: string; amount: string };
export const MAX_MED_TIMES = 12;
export type MedicationPayload = Base<'medication'> & {
	name: string;
	strength?: number;
	unit?: string;
	form: MedForm;
	schedule: MedSchedule;
	/** Empty for `as_needed`, otherwise at least one. */
	times: MedTime[];
	/** First day ("YYYY-MM-DD") the medication is due. */
	start: string;
	end?: string;
	/** Stored for the reminders update; nothing fires yet. */
	reminders: boolean;
	archived: boolean;
	note?: string;
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
	| MedicationPayload
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

const isAttachmentRef = (x: unknown): x is AttachmentRef =>
	isObj(x) &&
	typeof x.id === 'string' &&
	UUID_RE.test(x.id) &&
	typeof x.thumbId === 'string' &&
	UUID_RE.test(x.thumbId) &&
	typeof x.key === 'string' &&
	KEY_RE.test(x.key) &&
	typeof x.thumbKey === 'string' &&
	KEY_RE.test(x.thumbKey) &&
	isInt(x.w, 1, 20_000) &&
	isInt(x.h, 1, 20_000) &&
	x.mime === 'image/jpeg';

const isAttachments = (x: unknown): x is AttachmentRef[] =>
	x === undefined || (Array.isArray(x) && x.length <= MAX_ATTACHMENTS && x.every(isAttachmentRef));

const isExposures = (x: unknown): x is Exposure[] =>
	Array.isArray(x) &&
	x.length <= 50 &&
	x.every((e) => isObj(e) && isStr(e.id, 100) && oneOf(EXPOSURE_STATES, e.state));

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day written "YYYY-MM-DD". */
export function isDay(x: unknown): x is string {
	if (typeof x !== 'string' || !DAY_RE.test(x)) return false;
	const [y, m, d] = x.split('-').map(Number) as [number, number, number];
	const probe = new Date(Date.UTC(y, m - 1, d));
	return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isClock = (x: unknown): x is string => typeof x === 'string' && TIME_RE.test(x);

function isSchedule(x: unknown): x is MedSchedule {
	if (!isObj(x)) return false;
	switch (x.kind) {
		case 'daily':
		case 'as_needed':
			return true;
		case 'weekdays':
			return (
				Array.isArray(x.days) &&
				x.days.length >= 1 &&
				x.days.length <= 7 &&
				x.days.every((d) => isInt(d, 0, 6)) &&
				new Set(x.days).size === x.days.length
			);
		case 'every_n_days':
			return isInt(x.n, 2, 365) && isDay(x.from);
		default:
			return false;
	}
}

const isStrength = (x: unknown) =>
	x === undefined || (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1_000_000);

function isMedication(o: Obj): boolean {
	if (!isStr(o.name, 100) || o.name.trim() === '') return false;
	if (!isStrength(o.strength) || !optStr(o.unit, 40)) return false;
	if (!oneOf(MED_FORMS, o.form) || !isSchedule(o.schedule)) return false;
	if (!Array.isArray(o.times) || o.times.length > MAX_MED_TIMES) return false;
	if (!o.times.every((x) => isObj(x) && isClock(x.time) && isStr(x.amount, 100))) return false;
	if (o.schedule.kind === 'as_needed' ? o.times.length !== 0 : o.times.length < 1) return false;
	if (!isDay(o.start) || !(o.end === undefined || (isDay(o.end) && o.end >= o.start))) return false;
	return typeof o.reminders === 'boolean' && typeof o.archived === 'boolean' && optStr(o.note, 2000);
}

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
	medication: isMedication,
	settings: (o) =>
		isObj(o.values) &&
		Object.values(o.values).every((x) => ['string', 'number', 'boolean'].includes(typeof x)),
	tag: (o) => isStr(o.name, 100)
};

/** Returns the payload when it is a valid v1 payload of a known type, otherwise null. */
export function parsePayload(x: unknown): Payload | null {
	if (!isObj(x) || x.v !== PAYLOAD_VERSION || typeof x.type !== 'string') return null;
	if (!Object.hasOwn(validators, x.type)) return null;
	if (!isAttachments(x.attachments)) return null;
	return validators[x.type as PayloadType](x) ? (x as Payload) : null;
}

export function hasAt(p: Payload): p is TimedPayload {
	return 'at' in p;
}
