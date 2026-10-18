import { describe, expect, it } from 'vitest';
import { formatBytes, formatDay } from './admin-format';

describe('formatBytes', () => {
	it('uses decimal units with at most one decimal', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(999)).toBe('999 B');
		expect(formatBytes(1000)).toBe('1 kB');
		expect(formatBytes(1536)).toBe('1.5 kB');
		expect(formatBytes(4_194_304)).toBe('4.2 MB');
		expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
	});
	it('follows the locale and never goes negative', () => {
		expect(formatBytes(1536, 'da')).toBe('1,5 kB');
		expect(formatBytes(-5)).toBe('0 B');
	});
});

describe('formatDay', () => {
	it('shows the day only, independent of the time zone', () => {
		expect(formatDay('2026-10-18', 'en')).toBe('Oct 18, 2026');
		expect(formatDay('2026-10-18', 'da')).toBe('18. okt. 2026');
	});
	it('leaves anything else alone', () => {
		expect(formatDay('soon')).toBe('soon');
	});
});
