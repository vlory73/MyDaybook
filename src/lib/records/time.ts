/**
 * Event times and days. A record's `at` carries the UTC offset it was logged in, and its day is the calendar date
 * written in it ("2026-10-18T23:50:00+02:00" belongs to 2026-10-18 wherever the phone is later). Everything here is
 * pure and takes the offset as a parameter so tests can use fixed time zones.
 */

import { isAt } from './types';

const pad2 = (n: number) => String(n).padStart(2, '0');

function offsetText(offsetMinutes: number): string {
	const sign = offsetMinutes < 0 ? '-' : '+';
	const abs = Math.abs(offsetMinutes);
	return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** `at` for an instant, written in the given offset (default: this device's offset at that instant). */
export function formatAt(date: Date, offsetMinutes = -date.getTimezoneOffset()): string {
	const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
	const iso = shifted.toISOString(); // fields of the shifted clock, read as UTC
	return `${iso.slice(0, 19)}${offsetText(offsetMinutes)}`;
}

/** Value for `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm"), in the offset the `at` was written in. */
export function toLocalInput(at: string): string {
	return at.slice(0, 16);
}

/** `at` from a datetime-local value, in the given offset (default: this device's offset at that moment). */
export function fromLocalInput(value: string, offsetMinutes?: number): string | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
	const offset = offsetMinutes ?? -new Date(value).getTimezoneOffset();
	const at = `${value}:00${offsetText(offset)}`;
	return isAt(at) ? at : null;
}

/** Local calendar day ("YYYY-MM-DD") of an `at`. */
export const dayKey = (at: string): string => at.slice(0, 10);

/** Wall-clock time ("HH:mm") of an `at`, as it was on the person's clock. */
export const timeOf = (at: string): string => at.slice(11, 16);

export const instant = (at: string): number => Date.parse(at);

export function todayKey(now = new Date()): string {
	return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Date of a day key at local noon (safe against DST shifts when adding days). */
function parseDay(key: string): Date {
	const [y, m, d] = key.split('-').map(Number) as [number, number, number];
	return new Date(y, m - 1, d, 12);
}

export function addDays(key: string, days: number): string {
	const d = parseDay(key);
	d.setDate(d.getDate() + days);
	return todayKey(d);
}

/** The Monday of the week that holds `key`. */
export function weekStart(key: string): string {
	const d = parseDay(key);
	const back = (d.getDay() + 6) % 7; // Monday = 0
	return addDays(key, -back);
}

/** The seven day keys Monday to Sunday of the week holding `key`. */
export function weekDays(key: string): string[] {
	const start = weekStart(key);
	return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** A day key as a Date at local noon, for formatting. */
export const dayDate = parseDay;
