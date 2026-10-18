import { en, type MessageKey } from './en';
import { da } from './da';

export const locales = ['en', 'da'] as const;
export type Locale = (typeof locales)[number];

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, da };

export type Vars = Record<string, string | number>;

/** Base keys that have _one/_other plural forms, e.g. 'entries.count'. */
type PluralBase = MessageKey extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

function interpolate(template: string, vars: Vars | undefined, locale: Locale): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = vars[name];
		if (value === undefined) return match;
		return typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value;
	});
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
	return interpolate(catalogs[locale][key] ?? en[key], vars, locale);
}

export function translatePlural(locale: Locale, base: PluralBase, count: number, vars?: Vars): string {
	const form = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
	return translate(locale, `${base}_${form}` as MessageKey, { count, ...vars });
}

/** Picks the best supported locale from the browser's preferences. */
export function negotiateLocale(preferred: readonly string[]): Locale {
	for (const tag of preferred) {
		const lang = tag.toLowerCase().split('-')[0];
		// Norwegian Bokmål readers usually prefer Danish over English.
		if (lang === 'da' || lang === 'nb' || lang === 'no') return 'da';
		if (lang === 'en') return 'en';
	}
	return 'en';
}
