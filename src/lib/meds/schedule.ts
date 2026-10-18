/**
 * When a medication is due (ARCHITECTURE §5.3). Pure and DST-safe: days are local calendar dates written
 * "YYYY-MM-DD" and all day arithmetic goes through UTC calendar days, never through milliseconds of local time.
 * It only says which times are due; it never touches amounts (not a medical device).
 */
import type { MessageKey } from '$lib/i18n/en';
import type { MedicationPayload, MedTime } from '$lib/records/types';

type Schedulable = Pick<MedicationPayload, 'schedule' | 'times' | 'start' | 'end' | 'archived'>;

const DAY_MS = 86_400_000;

function utcMs(day: string): number {
	const [y, m, d] = day.split('-').map(Number) as [number, number, number];
	return Date.UTC(y, m - 1, d);
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: string, b: string): number => Math.round((utcMs(b) - utcMs(a)) / DAY_MS);

/** 0 = Sunday ... 6 = Saturday, like `Date.getDay()`. */
export const weekdayOf = (day: string): number => new Date(utcMs(day)).getUTCDay();

/** Whether the medication has a dose due on `day`. As-needed and archived medications are never due. */
export function isDueOn(med: Schedulable, day: string): boolean {
	if (med.archived || med.schedule.kind === 'as_needed') return false;
	if (day < med.start || (med.end !== undefined && day > med.end)) return false;
	switch (med.schedule.kind) {
		case 'daily':
			return true;
		case 'weekdays':
			return med.schedule.days.includes(weekdayOf(day));
		case 'every_n_days': {
			const gone = daysBetween(med.schedule.from, day);
			return gone >= 0 && gone % med.schedule.n === 0;
		}
	}
}

/** The times due on `day`, earliest first (empty when nothing is due). Amounts are passed through untouched. */
export function slotsOn(med: Schedulable, day: string): MedTime[] {
	if (!isDueOn(med, day)) return [];
	return [...med.times].sort((a, b) => a.time.localeCompare(b.time));
}

/** Monday first, as the weekday toggles and summaries are shown. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayName(weekday: number, locale: string, style: 'short' | 'long' = 'short'): string {
	// 2024-01-07 was a Sunday.
	return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
		new Date(Date.UTC(2024, 0, 7 + weekday))
	);
}

/** "Every day · 08:00, 20:00", "Mon, Wed, Fri · 08:00", "Every 3 days · 08:00" or "When needed". */
export function scheduleSummary(
	med: Pick<MedicationPayload, 'schedule' | 'times'>,
	t: (key: MessageKey, vars?: Record<string, string | number>) => string,
	locale: string
): string {
	const s = med.schedule;
	if (s.kind === 'as_needed') return t('meds.sum.asNeeded');
	const times = med.times
		.map((x) => x.time)
		.sort()
		.join(', ');
	const when =
		s.kind === 'daily'
			? t('meds.sum.daily')
			: s.kind === 'every_n_days'
				? t('meds.sum.everyN', { n: s.n })
				: WEEK_ORDER.filter((d) => s.days.includes(d))
						.map((d) => weekdayName(d, locale))
						.join(', ');
	return times ? `${when} · ${times}` : when;
}
