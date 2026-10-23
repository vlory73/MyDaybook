/**
 * Pain episodes, the pure parts: which entries belong together, the episode's name, span, day numbers and average,
 * and the rules for joining and unlinking. Descriptive only: it repeats what the person entered and never rates it
 * (not a medical device). Everything that writes to the store is in `episodeActions.ts`.
 */
import { regionName, type PlaceNamer } from '$lib/bodymap/catalogue';
import { translate, type Locale } from '$lib/i18n/core';
import { painSeries } from '$lib/trends/series';
import { dayRange } from '$lib/trends/range';
import type { StoredRecord } from './codec';
import type { PainEpisodePayload, PainPayload } from './pain';
import { dayDate, dayKey, instant } from './time';

type Rec = StoredRecord;
export type PainRec = StoredRecord<PainPayload>;
export type EpisodeRec = StoredRecord<PainEpisodePayload>;

/** An ongoing episode whose last entry is older than this many calendar days says "last logged" instead. */
export const STALE_DAYS = 14;
/** How many episodes the Pain sheet's chooser lists. */
export const CHOOSER_LIMIT = 8;
const DAY_MS = 86_400_000;

/** Whole calendar days from `a` to `b` (day keys). */
export const daysBetween = (a: string, b: string): number =>
	Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / DAY_MS);

/** "Day 3": the calendar day of `at` counted from the episode's first day (the first day is day 1, never below 1). */
export const dayNumber = (startDay: string, at: string): number =>
	Math.max(1, daysBetween(startDay, dayKey(at)) + 1);

export type EpisodeView = {
	id: string;
	/** The name shown: the stored one, or the place logged most often. */
	name: string;
	/** True when the person renamed it. */
	renamed: boolean;
	/** Day keys: the first entry's day (or the stored start when it is earlier), and the last entry's day. */
	startDay: string;
	lastDay: string;
	/** The day it was marked gone, or null while ongoing. */
	endDay: string | null;
	ended: string | null;
	ongoing: boolean;
	/** Ongoing, but the last entry is more than `STALE_DAYS` days old. */
	stale: boolean;
	/** Last day of the span: the end day (never before the last entry), or the last entry's day. */
	spanEndDay: string;
	/** Calendar days from start to the end of the span, both included. */
	spanDays: number;
	/** Days that have at least one entry. */
	daysWithEntries: number;
	/** Linked entries, oldest first. */
	entries: PainRec[];
	/** Mean of the daily averages (the same average as the Pain line in Trends), or null without points. */
	average: number | null;
};

const isEpisode = (r: Rec): r is EpisodeRec => r.payload.type === 'pain_episode';
const isPain = (r: Rec): r is PainRec => r.payload.type === 'pain';
const byTime = (a: PainRec, b: PainRec) =>
	instant(a.payload.at) - instant(b.payload.at) || a.id.localeCompare(b.id);

/** The place logged most often across the entries (a point counts once; the first placed wins a tie), or null. */
export function mostLoggedPlace(
	locale: Locale,
	entries: readonly { payload: PainPayload }[],
	placeName: PlaceNamer = regionName
): string | null {
	const counts = new Map<string, { n: number; name: string }>();
	for (const e of entries)
		for (const p of e.payload.points) {
			const key = `${p.region}/${p.side}`;
			const found = counts.get(key);
			if (found) found.n++;
			else counts.set(key, { n: 1, name: placeName(locale, p.region, p.side) });
		}
	let best: { n: number; name: string } | null = null;
	for (const c of counts.values()) if (!best || c.n > best.n) best = c;
	return best?.name ?? null;
}

/** The stored name when the person renamed it, otherwise the most logged place. */
export function episodeName(
	locale: Locale,
	episode: PainEpisodePayload,
	entries: readonly { payload: PainPayload }[],
	placeName: PlaceNamer = regionName
): string {
	return (
		episode.name?.trim() ||
		mostLoggedPlace(locale, entries, placeName) ||
		translate(locale, 'episode.untitled')
	);
}

function build(
	locale: Locale,
	today: string,
	ep: EpisodeRec,
	entries: PainRec[],
	placeName: PlaceNamer
): EpisodeView {
	const first = entries[0]!.payload.at;
	const startDay = dayKey(ep.payload.started) < dayKey(first) ? dayKey(ep.payload.started) : dayKey(first);
	const lastDay = dayKey(entries.at(-1)!.payload.at);
	const ended = ep.payload.ended ?? null;
	const endDay = ended ? dayKey(ended) : null;
	const spanEndDay = endDay && endDay > lastDay ? endDay : lastDay;
	const ongoing = ended === null;
	const days = [...new Set(entries.map((e) => dayKey(e.payload.at)))].sort();
	const series = painSeries(entries, days).days.filter((d) => d !== null);
	return {
		id: ep.id,
		name: episodeName(locale, ep.payload, entries, placeName),
		renamed: !!ep.payload.name?.trim(),
		startDay,
		lastDay,
		endDay,
		ended,
		ongoing,
		stale: ongoing && daysBetween(lastDay, today) > STALE_DAYS,
		spanEndDay,
		spanDays: daysBetween(startDay, spanEndDay) + 1,
		daysWithEntries: days.length,
		entries,
		average: series.length > 0 ? series.reduce((a, d) => a + d.avg, 0) / series.length : null
	};
}

/**
 * Every episode that still has at least one linked entry (an episode left without entries is ignored), most recently
 * logged first. `today` is a day key.
 */
export function episodeViews(
	all: Iterable<Rec>,
	locale: Locale,
	today: string,
	placeName: PlaceNamer = regionName
): EpisodeView[] {
	const episodes = new Map<string, EpisodeRec>();
	const linked = new Map<string, PainRec[]>();
	for (const r of all) {
		if (isEpisode(r)) episodes.set(r.id, r);
		else if (isPain(r) && r.payload.episode) {
			const list = linked.get(r.payload.episode);
			if (list) list.push(r);
			else linked.set(r.payload.episode, [r]);
		}
	}
	const views: EpisodeView[] = [];
	for (const [id, ep] of episodes) {
		const entries = linked.get(id);
		if (entries?.length) views.push(build(locale, today, ep, entries.sort(byTime), placeName));
	}
	return views.sort((a, b) => b.lastDay.localeCompare(a.lastDay) || a.id.localeCompare(b.id));
}

/** One episode by id (undefined when it does not exist or has no entries). */
export const episodeView = (all: Iterable<Rec>, id: string, locale: Locale, today: string) =>
	episodeViews(all, locale, today).find((v) => v.id === id);

/** The episode an entry belongs to, if that episode still exists. */
export const episodeOfEntry = (views: readonly EpisodeView[], entry: PainRec | undefined) =>
	entry?.payload.episode ? views.find((v) => v.id === entry.payload.episode) : undefined;

/** The most recently logged episode that is not marked gone and not stale: what "Add to …" offers. */
export const latestOngoing = (views: readonly EpisodeView[]): EpisodeView | undefined =>
	views.find((v) => v.ongoing && !v.stale);

/** Episodes for the chooser: ongoing ones first, then recent ones, at most `CHOOSER_LIMIT` (views are newest first). */
export function chooserList(views: readonly EpisodeView[]): EpisodeView[] {
	return [...views.filter((v) => v.ongoing), ...views.filter((v) => !v.ongoing)].slice(0, CHOOSER_LIMIT);
}

/** Episodes that overlap the period (day keys, both included). Ongoing ones end at their last entry. */
export const overlapping = (views: readonly EpisodeView[], from: string, to: string): EpisodeView[] =>
	views.filter((v) => v.startDay <= to && v.spanEndDay >= from);

export type DayDot = { day: string; max: number | null };

/** One dot per calendar day of the span: the day's highest intensity, or null for a day without an entry. */
export function dayDots(view: EpisodeView): DayDot[] {
	const maxes = new Map<string, number>();
	for (const e of view.entries) {
		const day = dayKey(e.payload.at);
		const top = Math.max(...e.payload.points.map((p) => p.intensity));
		maxes.set(day, Math.max(maxes.get(day) ?? -1, top));
	}
	return dayRange(view.startDay, view.spanEndDay).map((day) => ({ day, max: maxes.get(day) ?? null }));
}

// ---- Text ----

/** "3 Oct": a day key as day and short month in the language in use. */
export const formatDay = (locale: Locale, day: string): string =>
	new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(dayDate(day));

/** "3 Oct → ongoing", "3 Oct → last logged 20 Oct" (ongoing but stale) or "3 Oct → 9 Oct". */
export function episodeRange(locale: Locale, v: EpisodeView): string {
	const from = formatDay(locale, v.startDay);
	if (v.ongoing)
		return v.stale
			? translate(locale, 'episode.range.last', { from, to: formatDay(locale, v.lastDay) })
			: translate(locale, 'episode.range.ongoing', { from });
	return translate(locale, 'episode.range.ended', { from, to: formatDay(locale, v.spanEndDay) });
}

// ---- Joining and unlinking ----

/**
 * "Same as last time" and "Log today": the new entry joins the previous entry's episode. When the previous entry has
 * none, one is created from it and both are linked. `episodeId` is the id the new entry should carry; `create` is
 * the previous entry's time when an episode record has to be made (under that id) and the previous entry linked.
 */
export type JoinPlan = { episodeId: string; create?: { previousId: string; started: string } };

export function planJoin(
	previous: PainRec,
	episodeExists: (id: string) => boolean,
	newId: () => string
): JoinPlan {
	const existing = previous.payload.episode;
	if (existing && episodeExists(existing)) return { episodeId: existing };
	return { episodeId: newId(), create: { previousId: previous.id, started: previous.payload.at } };
}

/** The entry's payload with the episode link set, changed or removed. */
export function withEpisode(payload: PainPayload, episodeId: string | undefined): PainPayload {
	const { episode, ...rest } = payload;
	void episode;
	return episodeId ? { ...rest, episode: episodeId } : rest;
}

/** The episode payload marked gone at `at`, or reopened (`at` undefined). */
export function withEnded(payload: PainEpisodePayload, at: string | undefined): PainEpisodePayload {
	const { ended, ...rest } = payload;
	void ended;
	return at ? { ...rest, ended: at } : rest;
}

/** The episode payload renamed; an empty name goes back to the automatic name. */
export function withName(payload: PainEpisodePayload, name: string): PainEpisodePayload {
	const { name: old, ...rest } = payload;
	void old;
	const trimmed = name.trim();
	return trimmed ? { ...rest, name: trimmed } : rest;
}
