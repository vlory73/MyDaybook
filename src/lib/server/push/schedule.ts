/**
 * The reminder schedule a device uploads, and the matching of it against the clock. Pure: no database, no network.
 * The server never learns what a slot is for (the device merges identical slots and sends no names or ids).
 */
export type PushSlot = { time: string; days: number[] }; // days: 0 = Sunday ... 6 = Saturday
export type PushSchedule = { tz: string; slots: PushSlot[] };

export const MAX_SLOTS = 100;
/** How long after its minute a slot may still fire (missed ticks, a busy host). */
export const CATCH_UP_MINUTES = 5;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(tz: unknown): tz is string {
	if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** Validates an uploaded schedule and returns it in canonical form (sorted, de-duplicated), or null. */
export function parseSchedule(value: unknown): PushSchedule | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const { tz, slots } = value as Record<string, unknown>;
	if (!isValidTimeZone(tz) || !Array.isArray(slots) || slots.length > MAX_SLOTS) return null;
	const seen = new Map<string, PushSlot>();
	for (const slot of slots) {
		if (typeof slot !== 'object' || slot === null) return null;
		const { time, days } = slot as Record<string, unknown>;
		if (typeof time !== 'string' || !TIME_RE.test(time)) return null;
		if (!Array.isArray(days) || days.length === 0 || days.length > 7) return null;
		if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
		const sorted = [...new Set(days as number[])].sort((a, b) => a - b);
		seen.set(`${time}|${sorted.join('')}`, { time, days: sorted });
	}
	const canonical = [...seen.values()].sort(
		(a, b) => a.time.localeCompare(b.time) || a.days.join('').localeCompare(b.days.join(''))
	);
	return { tz, slots: canonical };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The wall-clock date, "HH:MM" and weekday (0 = Sunday) in `tz` at `instant`. */
export function localParts(instant: Date, tz: string): { date: string; time: string; weekday: number } {
	let f = formatters.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			weekday: 'short',
			hourCycle: 'h23'
		});
		formatters.set(tz, f);
	}
	const p: Record<string, string> = {};
	for (const part of f.formatToParts(instant)) p[part.type] = part.value;
	const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday ?? '');
	return {
		date: `${p.year}-${p.month}-${p.day}`,
		time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`,
		weekday
	};
}

/**
 * Which slot keys ("YYYY-MM-DDTHH:MM", the local date and time) fall in the catch-up window ending at `now`, and
 * which of them are not yet in `alreadyFired`. `window` lists every key of the window that the schedule matches, so the
 * caller can forget older keys. DST: a local time that does not exist (spring forward) never appears among the minutes
 * of the window, so it does not fire; a time that happens twice (fall back) has the same key both times, so it fires once.
 */
export function dueKeys(
	schedule: PushSchedule,
	now: Date,
	alreadyFired: readonly string[],
	catchUp = CATCH_UP_MINUTES
): { due: string[]; window: string[] } {
	const minute = Math.floor(now.getTime() / 60_000) * 60_000;
	const window = new Set<string>();
	for (let k = 0; k <= catchUp; k++) {
		const local = localParts(new Date(minute - k * 60_000), schedule.tz);
		for (const slot of schedule.slots) {
			if (slot.time === local.time && slot.days.includes(local.weekday))
				window.add(`${local.date}T${slot.time}`);
		}
	}
	const fired = new Set(alreadyFired);
	return { due: [...window].filter((key) => !fired.has(key)), window: [...window] };
}
