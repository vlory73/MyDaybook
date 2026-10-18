import { browser } from '$app/environment';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'theme';

function load(): Theme {
	if (!browser) return 'system';
	try {
		const saved = localStorage.getItem(KEY);
		if (saved === 'light' || saved === 'dark') return saved;
	} catch {
		// Storage unavailable: follow the system.
	}
	return 'system';
}

export const theme = $state({ current: load() });

/** Applies the theme to <html>; "system" removes the override so prefers-color-scheme decides. */
export function applyTheme(value: Theme): void {
	theme.current = value;
	if (!browser) return;
	if (value === 'system') delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = value;
	try {
		if (value === 'system') localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, value);
	} catch {
		// Not persisted.
	}
}
