/** Display helpers for the admin screen. */

/** Storage in human units (decimal: kB, MB, GB), one decimal at most. Zero is "0 B". */
export function formatBytes(bytes: number, locale = 'en'): string {
	const units = ['B', 'kB', 'MB', 'GB', 'TB'];
	let value = Math.max(0, bytes);
	let i = 0;
	while (value >= 1000 && i < units.length - 1) {
		value /= 1000;
		i++;
	}
	const text = new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(value);
	return `${text} ${units[i]}`;
}

/** A `YYYY-MM-DD` day from the server, shown as a date without any time. Invalid input comes back unchanged. */
export function formatDay(day: string, locale = 'en'): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
	const date = new Date(`${day}T00:00:00Z`);
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
