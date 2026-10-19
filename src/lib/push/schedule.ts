/**
 * The reminder schedule this device uploads for its push subscription (D7). Computed on the device from the decrypted
 * medications; the server only ever sees the result: a time zone and a list of clock times with weekdays.
 * Nothing identifying goes in: no names, doses, forms or record ids, and slots at the same time are merged, so the
 * list cannot be traced back to a medicine.
 */
import type { MedicationPayload } from '$lib/records/types';

export type ReminderSlot = { time: string; days: number[] }; // days: 0 = Sunday ... 6 = Saturday
export type ReminderSchedule = { tz: string; slots: ReminderSlot[] };

type Input = Pick<MedicationPayload, 'schedule' | 'times' | 'end' | 'archived' | 'reminders'>;

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * Active, non-archived medications with reminders on and fixed times. As-needed medications have no times, and
 * "every N days" cannot be written as a weekday set, so they are left out. A medication that ended before `today`
 * is left out too (the start date is not checked: a reminder a few days early is harmless, a missing one is not).
 * One slot per clock time, with the union of the weekdays.
 */
export function buildReminderSchedule(meds: Input[], tz: string, today: string): ReminderSchedule {
	const byTime = new Map<string, Set<number>>();
	for (const med of meds) {
		if (!med.reminders || med.archived) continue;
		if (med.end !== undefined && med.end < today) continue;
		const days =
			med.schedule.kind === 'daily' ? EVERY_DAY : med.schedule.kind === 'weekdays' ? med.schedule.days : null;
		if (!days) continue;
		for (const { time } of med.times) {
			const set = byTime.get(time) ?? new Set<number>();
			for (const d of days) set.add(d);
			byTime.set(time, set);
		}
	}
	const slots = [...byTime.entries()]
		.filter(([, days]) => days.size > 0)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([time, days]) => ({ time, days: [...days].sort((a, b) => a - b) }));
	return { tz, slots };
}

/** Stable text form, to tell whether a schedule changed since the last upload. */
export const scheduleKey = (s: ReminderSchedule): string => JSON.stringify(s);
