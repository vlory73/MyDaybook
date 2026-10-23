/**
 * The headache diary report, pure parts. It repeats what the person logged, one column per day the headache started,
 * in the order of the doctor's paper form. Nothing here rates, advises or diagnoses (not a medical device); the only
 * conversions are the two the report footnotes state (daily severity zones, nausea zones).
 *
 * Layouts: `table` = every calendar day of the period, 7 per page (A4 landscape); `form` = headache days only,
 * 7 per page, like the paper form (A4 portrait).
 */
import type { StoredRecord } from '$lib/records/codec';
import {
	dailySeverity,
	HEADACHE_BEFORE,
	headacheSides,
	isHeadacheEntry,
	nauseaLevel,
	pulsatingOrConstant,
	type HeadacheBefore,
	type NauseaLevel,
	type Zone
} from '$lib/records/headache';
import type { PainPayload } from '$lib/records/pain';
import { dayDate, dayKey, instant, timeOf } from '$lib/records/time';
import type { DosePayload, GutPayload, MedicationPayload } from '$lib/records/types';

export type ReportLayout = 'table' | 'form';
export const COLUMNS_PER_PAGE = 7;
export const MEDICINE_BLOCKS_IN_FORM = 3;

export type MedicineItem = { name: string; amount: string; time: string };

export type HeadacheDay = {
	/** "HH:mm" of the earliest start, or null when no start was entered. */
	started: string | null;
	/** Latest stop; `plusDays` counts calendar days after the column's day. Null when not entered or still going. */
	stopped: { time: string; plusDays: number } | null;
	stillGoing: boolean;
	before: HeadacheBefore[];
	side: 'both' | 'right' | 'left' | null;
	quality: 'pulsating' | 'constant' | 'both' | null;
	severity: Zone | null;
	worse: boolean | null;
	nausea: NauseaLevel;
	light: boolean | null;
	sound: boolean | null;
	trigger: string | null;
	/** Only medicines taken as needed or once (never the regular scheduled ones), in time order. */
	medicines: MedicineItem[];
};

export type ReportColumn = { day: string; headache: HeadacheDay | null };

export type HeadacheReport = {
	layout: ReportLayout;
	from: string;
	to: string;
	/** True when the period has no headache at all; the report then shows one line instead of a table. */
	empty: boolean;
	pages: ReportColumn[][];
	/** At least 1, also for an empty report. */
	pageCount: number;
};

type Rec = StoredRecord;

/** Yes if any entry says yes, No if one says no and none yes, otherwise unanswered. */
export function mergeYesNo(values: (boolean | undefined)[]): boolean | null {
	if (values.some((v) => v === true)) return true;
	return values.some((v) => v === false) ? false : null;
}

function daysBetween(fromDay: string, toDay: string): number {
	return Math.round((dayDate(toDay).getTime() - dayDate(fromDay).getTime()) / 86_400_000);
}

/** The day a headache entry belongs to: the day it started if that was entered, else the day it was logged. */
export const headacheDay = (e: PainPayload): string => dayKey(e.headache?.started ?? e.at);

/** Doses that belong in the Medicine row: taken or taken late, of "as needed" medicines (including one-off ones). */
function asNeededDoses(all: Rec[]): Map<string, MedicineItem[]> {
	const meds = new Map<string, MedicationPayload>();
	for (const r of all) if (r.payload.type === 'medication') meds.set(r.id, r.payload);
	const doses: { at: string; item: MedicineItem }[] = [];
	for (const r of all) {
		if (r.payload.type !== 'dose') continue;
		const d: DosePayload = r.payload;
		if (d.status !== 'taken' && d.status !== 'late') continue;
		const med = meds.get(d.medicationId);
		if (!med || med.schedule.kind !== 'as_needed') continue;
		const strength = med.strength !== undefined ? `${med.strength}${med.unit ? ` ${med.unit}` : ''}` : '';
		doses.push({
			at: d.at,
			item: { name: med.name, amount: d.amount?.trim() || strength, time: timeOf(d.at) }
		});
	}
	doses.sort((a, b) => instant(a.at) - instant(b.at));
	const byDay = new Map<string, MedicineItem[]>();
	for (const { at, item } of doses) {
		const key = dayKey(at);
		byDay.set(key, [...(byDay.get(key) ?? []), item]);
	}
	return byDay;
}

function mergeDay(
	day: string,
	entries: PainPayload[],
	gut: GutPayload[],
	medicines: MedicineItem[]
): HeadacheDay {
	const details = entries.flatMap((e) => (e.headache ? [e.headache] : []));
	const starts = details
		.flatMap((h) => (h.started ? [h.started] : []))
		.sort((a, b) => instant(a) - instant(b));
	const stops = details
		.flatMap((h) => (h.stopped ? [h.stopped] : []))
		.sort((a, b) => instant(a) - instant(b));
	const stillGoing = details.some((h) => h.stillGoing === true);
	const lastStop = stops.at(-1);
	const points = entries.flatMap((e) => e.points);
	const side = headacheSides(points);
	const triggers = details.flatMap((h) => (h.trigger ? [h.trigger.trim()] : [])).filter((x) => x !== '');
	return {
		started: starts[0] ? timeOf(starts[0]) : null,
		stopped:
			!stillGoing && lastStop
				? { time: timeOf(lastStop), plusDays: Math.max(0, daysBetween(day, dayKey(lastStop))) }
				: null,
		stillGoing,
		before: HEADACHE_BEFORE.filter((b) => details.some((h) => h.before?.includes(b))),
		side: side === 'none' ? null : side,
		quality: pulsatingOrConstant(points),
		severity: dailySeverity(entries),
		worse: mergeYesNo(details.map((h) => h.worseWithActivity)),
		nausea: nauseaLevel(gut),
		light: mergeYesNo(details.map((h) => h.light)),
		sound: mergeYesNo(details.map((h) => h.sound)),
		trigger: triggers.length > 0 ? triggers.join('; ') : null,
		medicines
	};
}

/** Builds the report for the given days (oldest first, all included) from the person's records. */
export function buildHeadacheReport(
	records: Iterable<Rec>,
	days: readonly string[],
	layout: ReportLayout
): HeadacheReport {
	const all = [...records];
	const wanted = new Set(days);
	const pain = new Map<string, PainPayload[]>();
	const gut = new Map<string, GutPayload[]>();
	const ordered = all
		.filter((r) => r.payload.type === 'pain' || r.payload.type === 'gut')
		.sort((a, b) => instant((a.payload as { at: string }).at) - instant((b.payload as { at: string }).at));
	for (const r of ordered) {
		const p = r.payload;
		if (p.type === 'pain' && isHeadacheEntry(p)) {
			const d = headacheDay(p);
			if (wanted.has(d)) pain.set(d, [...(pain.get(d) ?? []), p]);
		} else if (p.type === 'gut') {
			const d = dayKey(p.at);
			if (wanted.has(d)) gut.set(d, [...(gut.get(d) ?? []), p]);
		}
	}
	const medicines = asNeededDoses(all);
	const columns: ReportColumn[] = days.map((day) => {
		const entries = pain.get(day);
		return {
			day,
			headache: entries ? mergeDay(day, entries, gut.get(day) ?? [], medicines.get(day) ?? []) : null
		};
	});
	const empty = !columns.some((c) => c.headache);
	const shown = layout === 'form' ? columns.filter((c) => c.headache) : columns;
	const pages: ReportColumn[][] = [];
	if (!empty) {
		for (let i = 0; i < shown.length; i += COLUMNS_PER_PAGE) pages.push(shown.slice(i, i + COLUMNS_PER_PAGE));
	}
	return {
		layout,
		from: days[0] ?? '',
		to: days.at(-1) ?? '',
		empty,
		pages,
		pageCount: Math.max(1, pages.length)
	};
}

// ---- Formatting in the report language (independent of the app language) ----

const intlTag = (locale: string) => (locale === 'en' ? 'en-GB' : locale);

/** "Tue" / "Tir": short weekday, first letter capital, no trailing dot. */
export function weekdayLabel(day: string, locale: string): string {
	const w = new Intl.DateTimeFormat(intlTag(locale), { weekday: 'short' })
		.format(dayDate(day))
		.replace(/\.$/, '')
		.slice(0, 3);
	return w.charAt(0).toUpperCase() + w.slice(1);
}

/** "13 Oct" / "13. okt." */
export const dayMonthLabel = (day: string, locale: string): string =>
	new Intl.DateTimeFormat(intlTag(locale), { day: 'numeric', month: 'short' }).format(dayDate(day));

/** "13/10" for the form's date row. */
export function numericDayMonth(day: string): string {
	const [, m, d] = day.split('-').map(Number) as [number, number, number];
	return `${d}/${m}`;
}

/** "13–19 Oct 2026" / "13.–19. okt. 2026" */
export function periodLabel(from: string, to: string, locale: string): string {
	const fmt = new Intl.DateTimeFormat(intlTag(locale), { day: 'numeric', month: 'short', year: 'numeric' });
	return from === to ? fmt.format(dayDate(from)) : fmt.formatRange(dayDate(from), dayDate(to));
}
