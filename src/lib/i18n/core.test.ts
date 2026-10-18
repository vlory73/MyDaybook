import { describe, expect, it } from 'vitest';
import { en } from './en';
import { da } from './da';
import { negotiateLocale, translate, translatePlural } from './core';

describe('i18n catalogues', () => {
	it('Danish has exactly the English keys, none empty', () => {
		expect(Object.keys(da).sort()).toEqual(Object.keys(en).sort());
		for (const value of Object.values(da)) expect(value.trim()).not.toBe('');
	});

	it('Danish keeps the same placeholders as English', () => {
		const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
		for (const key of Object.keys(en) as (keyof typeof en)[]) {
			expect(placeholders(da[key]), key).toEqual(placeholders(en[key]));
		}
	});
});

describe('translate', () => {
	it('interpolates and formats numbers per locale', () => {
		expect(translate('en', 'quicklog.now', { time: '09:41' })).toBe('Now, 09:41');
		expect(translate('da', 'entries.count_other', { count: 1234 })).toBe('1.234 registreringer');
	});

	it('leaves unknown placeholders visible rather than dropping them', () => {
		expect(translate('en', 'me.about.purpose')).toContain('{app}');
	});

	it('picks plural forms', () => {
		expect(translatePlural('en', 'entries.count', 1)).toBe('1 entry');
		expect(translatePlural('en', 'entries.count', 2)).toBe('2 entries');
		expect(translatePlural('da', 'entries.count', 1)).toBe('1 registrering');
	});
});

describe('negotiateLocale', () => {
	it.each([
		[['da-DK', 'en'], 'da'],
		[['nb-NO'], 'da'],
		[['en-GB', 'da'], 'en'],
		[['fr-FR'], 'en'],
		[[], 'en']
	])('%j -> %s', (prefs, expected) => {
		expect(negotiateLocale(prefs)).toBe(expected);
	});
});
