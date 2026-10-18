import { browser } from '$app/environment';
import type { MessageKey } from './en';
import { negotiateLocale, translate, translatePlural, type Locale, type Vars } from './core';

const STORAGE_KEY = 'locale';

function initialLocale(): Locale {
	if (!browser) return 'en';
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'en' || saved === 'da') return saved;
	} catch {
		// Storage can be unavailable (private mode); fall back to the browser language.
	}
	return negotiateLocale(navigator.languages ?? [navigator.language]);
}

export const i18n = $state({ locale: initialLocale() });

export function setLocale(locale: Locale): void {
	i18n.locale = locale;
	try {
		localStorage.setItem(STORAGE_KEY, locale);
	} catch {
		// Not persisted; the choice still applies for this session.
	}
}

export const t = (key: MessageKey, vars?: Vars): string => translate(i18n.locale, key, vars);
export const tn = (base: Parameters<typeof translatePlural>[1], count: number, vars?: Vars): string =>
	translatePlural(i18n.locale, base, count, vars);

export type { Locale, MessageKey };
export { locales } from './core';
