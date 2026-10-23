/**
 * The "Doctor visit" report, pure parts. It repeats what the person logged in a period, nothing more: counts, sums,
 * averages and the person's own words. It never rates, advises or diagnoses (not a medical device): no thresholds, no
 * reference ranges, no colour that means good or bad.
 *
 * `buildDoctorReport` turns records + options into a content model; `unitsOf` turns that into a flat list of units
 * (a heading, a table row, a chart, ...) that the page splits over A4 sheets with `paginate`, never cutting a row or a
 * chart in half.
 */
import { regionName } from '$lib/bodymap/catalogue';
import { translate, translatePlural, type Locale } from '$lib/i18n/core';
import type { MessageKey } from '$lib/i18n/en';
import type { StoredRecord } from '$lib/records/codec';
import { mlToCl } from '$lib/records/drinks';
import { episodeViews, overlapping } from '$lib/records/episodes';
import { WEIGHT_ID } from '$lib/records/log';
import { dayKey, instant, timeOf } from '$lib/records/time';
import type { DosePayload, MedicationPayload } from '$lib/records/types';
import { scheduleSummary } from '$lib/meds/schedule';
import {
	buckets,
	heatmap,
	rankPlaces,
	roundAvg,
	tokenFor,
	type Bucket,
	type HeatMap
} from '$lib/trends/heatmap';
import {
	bowelDots,
	doseDay,
	feelingSeries,
	fluidSeries,
	hasAny,
	measurementSeries,
	measurementTypesWithData,
	painSeries,
	present,
	sleepSeries,
	type Series
} from '$lib/trends/series';
import { buildHeadacheReport, dayMonthLabel, periodLabel } from './headache';

type Rec = StoredRecord;

// ---- Sections the person can tick ----

export const DOCTOR_SECTIONS = [
	'medicines',
	'pain',
	'episodes',
	'headache',
	'feeling',
	'sleep',
	'measurements',
	'fluids',
	'bowel',
	'gut',
	'notes',
	'headachePages'
] as const;
export type DoctorSection = (typeof DOCTOR_SECTIONS)[number];
export type Include = Record<DoctorSection, boolean>;

/** Sections that start unticked even when the period holds data. */
export const OFF_BY_DEFAULT: readonly DoctorSection[] = ['notes', 'headachePages'];
export const TOP_PLACES = 8;

/** What the period holds per section; the options screen shows the counts and disables sections with none. */
export type Overview = Record<DoctorSection, number>;

function listedMedicines(all: Rec[], days: readonly string[]) {
	const meds = new Map<string, MedicationPayload>();
	const counts = new Map<string, { taken: number; skipped: number; late: number; lastAt: string | null }>();
	for (const r of all) if (r.payload.type === 'medication') meds.set(r.id, r.payload);
	const wanted = new Set(days);
	for (const r of all) {
		if (r.payload.type !== 'dose') continue;
		const d: DosePayload = r.payload;
		if (!wanted.has(doseDay(d))) continue;
		const c = counts.get(d.medicationId) ?? { taken: 0, skipped: 0, late: 0, lastAt: null };
		c[d.status]++;
		if (
			(d.status === 'taken' || d.status === 'late') &&
			(c.lastAt === null || instant(d.at) > instant(c.lastAt))
		)
			c.lastAt = d.at;
		counts.set(d.medicationId, c);
	}
	return { meds, counts };
}

const noteRecords = (all: Rec[], days: readonly string[]) => {
	const wanted = new Set(days);
	return all
		.flatMap((r) => (r.payload.type === 'note' && wanted.has(dayKey(r.payload.at)) ? [r.payload] : []))
		.sort((a, b) => instant(a.at) - instant(b.at));
};

export function doctorOverview(records: Iterable<Rec>, days: readonly string[], today: string): Overview {
	const all = [...records];
	const med = medicinesBlock(all, days, 'en');
	const pain = painSeries(all, days);
	const feeling = feelingSeries(all, days);
	const weight = measurementSeries(all, days, WEIGHT_ID);
	const own = measurementTypesWithData(all, days);
	const gutRecords = all.filter(
		(r) => r.payload.type === 'gut' && days.includes(dayKey(r.payload.at))
	).length;
	const dayCount = (...series: Series[]) =>
		days.filter((_, i) => series.some((s) => s[i] !== null && s[i] !== undefined)).length;
	const headache = days.length > 0 ? buildHeadacheReport(all, days, 'form').pages.flat().length : 0;
	return {
		medicines: med.regular.length + med.asNeeded.length,
		pain: pain.daysWithPain > 0 ? pain.entries : 0,
		episodes:
			days.length > 0 ? overlapping(episodeViews(all, 'en', today), days[0]!, days.at(-1)!).length : 0,
		headache,
		feeling: dayCount(feeling.mood, feeling.energy, feeling.stress),
		sleep: present(sleepSeries(all, days).minutes).length,
		measurements:
			present(weight.values).length +
			own.reduce((n, m) => n + present(measurementSeries(all, days, m.id).values).length, 0),
		fluids: present(fluidSeries(all, days).totalMl).length,
		bowel: bowelDots(all, days).length,
		gut: gutRecords,
		notes: noteRecords(all, days).length,
		headachePages: headache
	};
}

/** Sections with something in the period are ticked, except the opt-in ones. `touched` holds the person's own choices. */
export function resolveInclude(overview: Overview, touched: Partial<Include>): Include {
	const out = {} as Include;
	for (const s of DOCTOR_SECTIONS) {
		out[s] = overview[s] > 0 && (touched[s] ?? !OFF_BY_DEFAULT.includes(s));
	}
	return out;
}

// ---- Content ----

export type MedRow = {
	name: string;
	strength: string;
	form: string;
	schedule: string;
	taken: number;
	skipped: number;
	late: number;
};
export type NeedRow = { name: string; strength: string; times: number; last: string };
export type PlaceRow = { name: string; days: number; avg: number | null; token: number };
export type PainBlock = {
	heat: HeatMap;
	steps: Bucket[];
	rows: PlaceRow[];
	entries: number;
	days: number;
};
export type EpisodeRow = { name: string; from: string; to: string; days: number; avg: number | null };
export type NoteRow = { when: string; text: string };

export type ChartSeries = { key: string; label: string; color: string; values: Series };
export type ChartSpec = {
	id: string;
	title: string;
	sub: string;
	kind: 'lines' | 'bars';
	days: string[];
	yMin: number;
	yMax: number;
	yTicks: number[];
	/** Short unit written above the value axis ("h", "kg", "cl"); empty for the 1 to 5 scale. */
	yUnit: string;
	series: ChartSeries[];
	/** Show a key for the series (more than one line). */
	legend: boolean;
};

export type DoctorReport = {
	from: string;
	to: string;
	dayCount: number;
	questions: string;
	medicines: { regular: MedRow[]; asNeeded: NeedRow[] } | null;
	pain: PainBlock | null;
	episodes: EpisodeRow[] | null;
	headacheDays: { count: number; seeDiary: boolean } | null;
	feeling: ChartSpec | null;
	/** The other charts (sleep, weight, own measurements, fluids), shown two to a row. */
	charts: ChartSpec[];
	bowel: { count: number; days: number } | null;
	gut: { count: number; days: number } | null;
	notes: NoteRow[] | null;
};

export type DoctorOptions = {
	questions: string;
	include: Include;
};

const strengthOf = (m: MedicationPayload) =>
	m.strength !== undefined ? `${m.strength}${m.unit ? ` ${m.unit}` : ''}` : '';

/** The medicines table (scheduled ones) and "taken when needed" (as-needed and one-off). */
export function medicinesBlock(all: Rec[], days: readonly string[], locale: Locale) {
	const { meds, counts } = listedMedicines(all, days);
	const from = days[0] ?? '';
	const to = days.at(-1) ?? '';
	const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
	const dash = '–';
	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, locale);
	const regular: MedRow[] = [];
	const asNeeded: NeedRow[] = [];
	for (const [id, m] of meds) {
		const c = counts.get(id);
		if (m.schedule.kind === 'as_needed') {
			const times = (c?.taken ?? 0) + (c?.late ?? 0);
			if (times === 0) continue;
			asNeeded.push({
				name: m.name,
				strength: strengthOf(m) || dash,
				times,
				last: c?.lastAt ? `${dayMonthLabel(dayKey(c.lastAt), locale)}, ${timeOf(c.lastAt)}` : dash
			});
			continue;
		}
		const any = !!c && c.taken + c.skipped + c.late > 0;
		const active = !m.archived && m.start <= to && (m.end === undefined || m.end >= from);
		if (!any && !active) continue;
		regular.push({
			name: m.name,
			strength: strengthOf(m) || dash,
			form: m.form === 'other' ? dash : tr(`meds.form.${m.form}` as MessageKey),
			schedule: scheduleSummary(m, tr, locale),
			taken: c?.taken ?? 0,
			skipped: c?.skipped ?? 0,
			late: c?.late ?? 0
		});
	}
	return { regular: regular.sort(byName), asNeeded: asNeeded.sort(byName) };
}

const FEEL_COLORS = { mood: '#574694', energy: '#2f6449', stress: '#973945' } as const;
const LINE_COLOR = '#2a5c7d';
const BAR_COLOR = '#4d7a99';

const niceTop = (value: number, step: number, min: number) => Math.max(min, Math.ceil(value / step) * step);

/** A value axis with `n` evenly spaced ticks from `min` to `max`. */
const ticks = (min: number, max: number, n = 3) =>
	Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));

/** Padded whole-number range around the values, like the Trends lines. */
function span(values: Series, pad = 0.5) {
	const v = present(values);
	const lo = Math.min(...v);
	const hi = Math.max(...v);
	const p = Math.max((hi - lo) * 0.25, pad);
	return { min: Math.floor(lo - p), max: Math.ceil(hi + p) };
}

/** Builds the report content for the days (oldest first, all included). `today` is a day key. */
export function buildDoctorReport(
	records: Iterable<Rec>,
	days: readonly string[],
	options: DoctorOptions,
	locale: Locale,
	today: string
): DoctorReport {
	const all = [...records];
	const on = options.include;
	const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
	const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, { maximumFractionDigits: 1 });
	const plural = (base: 'dr.logged' | 'dr.nights' | 'dr.days' | 'dr.entries', n: number) =>
		translatePlural(locale, base, n);

	const medicines = on.medicines ? medicinesBlock(all, days, locale) : null;

	let pain: PainBlock | null = null;
	if (on.pain) {
		const heat = heatmap(all, days);
		if (heat.daysWithPain > 0) {
			const steps = buckets(heat.maxDays);
			const name = (h: {
				region: Parameters<typeof regionName>[1];
				side: Parameters<typeof regionName>[2];
			}) => regionName(locale, h.region, h.side);
			const ranked = rankPlaces(heat.places.values(), name).slice(0, TOP_PLACES);
			pain = {
				heat,
				steps,
				rows: ranked.map((h) => ({
					name: name(h),
					days: h.days,
					avg: roundAvg(h.avg),
					token: tokenFor(h.days, steps)
				})),
				entries: painSeries(all, days).entries,
				days: heat.daysWithPain
			};
		}
	}

	let episodes: EpisodeRow[] | null = null;
	if (on.episodes && days.length > 0) {
		const found = overlapping(episodeViews(all, locale, today), days[0]!, days.at(-1)!).sort(
			(a, b) => a.startDay.localeCompare(b.startDay) || a.id.localeCompare(b.id)
		);
		episodes = found.map((v) => ({
			name: v.name,
			from: dayMonthLabel(v.startDay, locale),
			to: v.ongoing
				? v.stale
					? tr('dr.lastLogged', { day: dayMonthLabel(v.lastDay, locale) })
					: tr('dr.ongoing')
				: dayMonthLabel(v.spanEndDay, locale),
			days: v.spanDays,
			avg: roundAvg(v.average)
		}));
		if (episodes.length === 0) episodes = null;
	}

	const headacheDays =
		on.headache && days.length > 0 ? buildHeadacheReport(all, days, 'form').pages.flat().length : 0;

	let feeling: ChartSpec | null = null;
	if (on.feeling) {
		const f = feelingSeries(all, days);
		if (hasAny(f.mood) || hasAny(f.energy) || hasAny(f.stress)) {
			const logged = days.filter(
				(_, i) => f.mood[i] != null || f.energy[i] != null || f.stress[i] != null
			).length;
			feeling = {
				id: 'feeling',
				title: tr('dr.feel.title'),
				sub: tr('dr.feel.sub', { logged: plural('dr.logged', logged) }),
				kind: 'lines',
				days: [...days],
				yMin: 0.5,
				yMax: 5.5,
				yTicks: [1, 2, 3, 4, 5],
				yUnit: '',
				legend: true,
				series: (['mood', 'energy', 'stress'] as const).map((k) => ({
					key: k,
					label: tr(`trends.feel.${k}` as MessageKey),
					color: FEEL_COLORS[k],
					values: f[k]
				}))
			};
		}
	}

	const charts: ChartSpec[] = [];
	if (on.sleep) {
		const s = sleepSeries(all, days);
		if (hasAny(s.minutes)) {
			const hours = s.minutes.map((m) => (m === null ? null : m / 60));
			const top = niceTop(Math.max(...present(hours)), 2, 8);
			charts.push({
				id: 'sleep',
				title: tr('trends.sleep.title'),
				sub: tr('dr.sleep.sub', { nights: plural('dr.nights', present(hours).length) }),
				kind: 'bars',
				days: [...days],
				yMin: 0,
				yMax: top,
				yTicks: ticks(0, top, top / 2 + 1),
				yUnit: tr('dr.hours'),
				legend: false,
				series: [{ key: 'sleep', label: tr('trends.sleep.title'), color: BAR_COLOR, values: hours }]
			});
		}
	}
	if (on.measurements) {
		const line = (id: string, title: string, unit: string, values: Series) => {
			const r = span(values);
			const have = present(values);
			charts.push({
				id,
				title,
				sub: tr('dr.measure.sub', {
					entries: plural('dr.entries', have.length),
					value: nf.format(have.at(-1)!),
					unit
				}),
				kind: 'lines',
				days: [...days],
				yMin: r.min,
				yMax: r.max,
				yTicks: ticks(r.min, r.max),
				yUnit: unit,
				legend: false,
				series: [{ key: id, label: title, color: LINE_COLOR, values }]
			});
		};
		const w = measurementSeries(all, days, WEIGHT_ID);
		if (hasAny(w.values)) line('weight', tr('trends.weight.title'), w.unit || 'kg', w.values);
		for (const m of measurementTypesWithData(all, days)) {
			line(`m-${m.id}`, m.name, m.unit, measurementSeries(all, days, m.id).values);
		}
	}
	if (on.fluids) {
		const f = fluidSeries(all, days);
		if (hasAny(f.totalMl)) {
			const cl = f.totalMl.map((n) => (n === null ? null : mlToCl(n)));
			const top = niceTop(Math.max(...present(cl)), 50, 50);
			charts.push({
				id: 'fluids',
				title: tr('trends.fluids.title'),
				sub: tr('dr.fluids.sub', { days: plural('dr.days', present(cl).length) }),
				kind: 'bars',
				days: [...days],
				yMin: 0,
				yMax: top,
				yTicks: ticks(0, top, 3),
				yUnit: 'cl',
				legend: false,
				series: [{ key: 'fluids', label: tr('trends.fluids.title'), color: BAR_COLOR, values: cl }]
			});
		}
	}

	const countOf = (n: number, dayList: string[]) => ({ count: n, days: new Set(dayList).size });
	const bowel = on.bowel ? bowelDots(all, days) : [];
	const gutDays = on.gut
		? all.flatMap((r) =>
				r.payload.type === 'gut' && days.includes(dayKey(r.payload.at)) ? [dayKey(r.payload.at)] : []
			)
		: [];
	const bowelDayList = bowel.map((b) => days[b.dayIndex]!);

	return {
		from: days[0] ?? '',
		to: days.at(-1) ?? '',
		dayCount: days.length,
		questions: options.questions.trim(),
		medicines: medicines && medicines.regular.length + medicines.asNeeded.length > 0 ? medicines : null,
		pain,
		episodes,
		headacheDays: headacheDays > 0 ? { count: headacheDays, seeDiary: on.headachePages } : null,
		feeling,
		charts,
		bowel: bowel.length > 0 ? countOf(bowel.length, bowelDayList) : null,
		gut: gutDays.length > 0 ? countOf(gutDays.length, gutDays) : null,
		notes: on.notes
			? noteRecords(all, days).map((n) => ({
					when: `${dayMonthLabel(dayKey(n.at), locale)}, ${timeOf(n.at)}`,
					text: n.text.trim()
				}))
			: null
	};
}

// ---- Units: what the page splits over sheets ----

export type Part =
	| { t: 'h2'; text: string }
	| { t: 'sub'; text: string }
	| { t: 'questions'; text: string }
	| { t: 'row'; table: TableId; i: number }
	| { t: 'fine'; text: string }
	| { t: 'pain' }
	| { t: 'callout' }
	| { t: 'charts'; charts: ChartSpec[] }
	| { t: 'counts' };

export type TableId = 'meds' | 'need' | 'episodes' | 'notes';

export type Unit = {
	id: string;
	/** Must share a sheet with the next unit (a heading and what follows it). */
	keepNext?: boolean;
	/** Rows of one table; a table that continues on the next sheet repeats its header. */
	table?: TableId;
	part: Part;
};

export function unitsOf(report: DoctorReport, locale: Locale): Unit[] {
	const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
	const out: Unit[] = [];
	const heading = (id: string, text: string) =>
		out.push({ id: `h-${id}`, keepNext: true, part: { t: 'h2', text } });
	const rows = (table: TableId, n: number) => {
		for (let i = 0; i < n; i++) {
			out.push({ id: `${table}-${i}`, table, part: { t: 'row', table, i } });
		}
	};

	if (report.questions) {
		heading('questions', tr('dr.questions'));
		out.push({ id: 'questions', part: { t: 'questions', text: report.questions } });
	}
	if (report.medicines) {
		const { regular, asNeeded } = report.medicines;
		heading('medicines', tr('dr.medicines'));
		if (regular.length > 0) rows('meds', regular.length);
		if (asNeeded.length > 0) {
			out.push({ id: 'sub-need', keepNext: true, part: { t: 'sub', text: tr('dr.asNeeded') } });
			rows('need', asNeeded.length);
		}
		out.push({ id: 'fn-meds', part: { t: 'fine', text: tr('dr.fn.counts') } });
	}
	if (report.pain) {
		heading('pain', tr('dr.pain'));
		out.push({ id: 'pain', part: { t: 'pain' } });
	}
	if (report.episodes) {
		heading('episodes', tr('dr.episodes'));
		rows('episodes', report.episodes.length);
	}
	if (report.headacheDays) {
		heading('headache', tr('dr.headache'));
		out.push({ id: 'headache', part: { t: 'callout' } });
	}
	if (report.feeling || report.charts.length > 0) {
		heading('feeling', tr('dr.feeling'));
		if (report.feeling) out.push({ id: 'chart-feeling', part: { t: 'charts', charts: [report.feeling] } });
		for (let i = 0; i < report.charts.length; i += 2) {
			out.push({ id: `charts-${i}`, part: { t: 'charts', charts: report.charts.slice(i, i + 2) } });
		}
	}
	if (report.bowel || report.gut) {
		heading(
			'counts',
			tr(report.bowel && report.gut ? 'dr.h.bowelGut' : report.bowel ? 'dr.h.bowel' : 'dr.h.gut')
		);
		out.push({ id: 'counts', part: { t: 'counts' } });
	}
	if (report.feeling || report.charts.length > 0 || report.bowel || report.gut) {
		out.push({ id: 'fn-charts', part: { t: 'fine', text: tr('dr.fn.charts') } });
	}
	if (report.notes && report.notes.length > 0) {
		heading('notes', tr('dr.notes'));
		rows('notes', report.notes.length);
	}
	return out;
}

// ---- Splitting over sheets ----

export type Sized = { h: number; keepNext?: boolean; table?: string };
export type Placed = { i: number; head: boolean };

/**
 * Splits units (with their measured heights) over sheets. `capacity(page)` is the room on a sheet (page 0 first),
 * `headH` the height of each table's header row. Units flagged `keepNext` stay with what follows them; a table that
 * continues on a new sheet starts with its header again. A unit taller than a sheet gets a sheet of its own.
 */
export function paginate(
	units: readonly Sized[],
	capacity: (page: number) => number,
	headH: Readonly<Record<string, number>> = {}
): Placed[][] {
	const pages: Placed[][] = [[]];
	let used = 0;
	let last: Sized | undefined;

	const cost = (u: Sized, prev: Sized | undefined) => {
		const head = u.table !== undefined && prev?.table !== u.table;
		return { head, cost: u.h + (head ? (headH[u.table!] ?? 0) : 0) };
	};
	const newPage = () => {
		pages.push([]);
		used = 0;
		last = undefined;
	};
	const place = (i: number) => {
		const c = cost(units[i]!, last);
		pages.at(-1)!.push({ i, head: c.head });
		used += c.cost;
		last = units[i];
	};

	let i = 0;
	while (i < units.length) {
		let j = i;
		while (units[j]!.keepNext && j + 1 < units.length) j++;
		// Would the whole group fit on the current sheet?
		let need = 0;
		let prev = last;
		for (let k = i; k <= j; k++) {
			need += cost(units[k]!, prev).cost;
			prev = units[k];
		}
		const room = capacity(pages.length - 1);
		if (used + need > room && pages.at(-1)!.length > 0) newPage();
		for (let k = i; k <= j; k++) {
			const c = cost(units[k]!, last);
			if (used + c.cost > capacity(pages.length - 1) && pages.at(-1)!.length > 0) newPage();
			place(k);
		}
		i = j + 1;
	}
	return pages;
}

export type Run = { table: string | null; items: Placed[] };

/** Consecutive rows of the same table on one sheet become one run (one <table>); every other unit is a run of its own. */
export function runsOf(placed: readonly Placed[], units: readonly Sized[]): Run[] {
	const out: Run[] = [];
	for (const p of placed) {
		const table = units[p.i]!.table ?? null;
		const prev = out.at(-1);
		if (table !== null && prev && prev.table === table && !p.head) prev.items.push(p);
		else out.push({ table, items: [p] });
	}
	return out;
}

// ---- Header text ----

/** "24 Sep – 23 Oct 2026 (30 days)" in the report language. */
export const periodText = (report: Pick<DoctorReport, 'from' | 'to' | 'dayCount'>, locale: Locale): string =>
	translatePlural(locale, 'dr.periodDays', report.dayCount, {
		period: periodLabel(report.from, report.to, locale)
	});
