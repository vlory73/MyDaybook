/**
 * Versioned consent text. The server stores `{ version, textHash, locale }` next to a server-side timestamp, so it
 * can later show exactly which words a person agreed to. Changing any consent string means a new version (add
 * `consent.v2.*` keys and bump CONSENT_VERSION); never edit v1 in place.
 */
import { brand } from '$lib/brand';
import { translate, type Locale } from '$lib/i18n/core';
import type { MessageKey } from '$lib/i18n/en';

export const CONSENT_VERSION = 'consent-v1';

const KEYS = [
	'consent.v1.title',
	'consent.v1.p1',
	'consent.v1.p2',
	'consent.v1.p3',
	'consent.v1.checkbox'
] as const satisfies readonly MessageKey[];

export type ConsentText = { title: string; paragraphs: string[]; checkbox: string };

export function consentText(locale: Locale): ConsentText {
	const [title, p1, p2, p3, checkbox] = KEYS.map((key) => translate(locale, key, { app: brand.displayName }));
	return { title: title!, paragraphs: [p1!, p2!, p3!], checkbox: checkbox! };
}

/** Hex SHA-256 of the exact text shown (title, paragraphs and checkbox label, joined by newlines). */
export async function consentHash(locale: Locale): Promise<string> {
	const { title, paragraphs, checkbox } = consentText(locale);
	const data = new TextEncoder().encode([title, ...paragraphs, checkbox].join('\n'));
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
