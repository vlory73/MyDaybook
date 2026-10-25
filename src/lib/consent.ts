/**
 * Versioned consent text. The server stores `{ version, textHash, locale }` next to a server-side timestamp, so it
 * can later show exactly which words a person agreed to. Changing any consent string means a new version (add
 * `consent.v3.*` keys and bump CONSENT_VERSION); never edit an older version in place, and keep every old version
 * bundled forever. People who agreed to an older version keep it; every new account gets the newest.
 *
 * The hashed text is what is shown on screen: title, age line (v2), paragraphs and checkbox label, with the real
 * number of days filled in. v2 depends on the server's backup retention setting, so its hash depends on the days.
 * The "Read how your data is handled" link next to the text is not part of it.
 */
import { brand } from '$lib/brand';
import { translate, type Locale } from '$lib/i18n/core';
import type { MessageKey } from '$lib/i18n/en';

export const CONSENT_VERSION = 'consent-v2';
export const CONSENT_VERSIONS = ['consent-v1', 'consent-v2'] as const;
export type ConsentVersion = (typeof CONSENT_VERSIONS)[number];

/** Version 1 spoke of a fixed 14 days; it has no age line. */
const V1_DAYS = 14;

const KEYS: Record<ConsentVersion, { age: MessageKey | null; keys: readonly MessageKey[] }> = {
	'consent-v1': {
		age: null,
		keys: ['consent.v1.title', 'consent.v1.p1', 'consent.v1.p2', 'consent.v1.p3', 'consent.v1.checkbox']
	},
	'consent-v2': {
		age: 'consent.v2.age',
		keys: ['consent.v2.title', 'consent.v2.p1', 'consent.v2.p2', 'consent.v2.p3', 'consent.v2.checkbox']
	}
};

export type ConsentText = {
	title: string;
	/** The calm age line shown at the top (v2 and later); null for v1. */
	age: string | null;
	paragraphs: string[];
	checkbox: string;
};

export function isConsentVersion(v: unknown): v is ConsentVersion {
	return typeof v === 'string' && (CONSENT_VERSIONS as readonly string[]).includes(v);
}

export function consentText(
	locale: Locale,
	version: ConsentVersion = CONSENT_VERSION,
	backupDays = V1_DAYS
): ConsentText {
	const spec = KEYS[version];
	const vars = { app: brand.displayName, days: backupDays };
	const [title, p1, p2, p3, checkbox] = spec.keys.map((key) => translate(locale, key, vars));
	return {
		title: title!,
		age: spec.age ? translate(locale, spec.age, vars) : null,
		paragraphs: [p1!, p2!, p3!],
		checkbox: checkbox!
	};
}

/** Hex SHA-256 of the exact text shown (title, age line, paragraphs and checkbox label, joined by newlines). */
export async function consentHash(
	locale: Locale,
	version: ConsentVersion = CONSENT_VERSION,
	backupDays = V1_DAYS
): Promise<string> {
	const { title, age, paragraphs, checkbox } = consentText(locale, version, backupDays);
	const parts = [title, ...(age === null ? [] : [age]), ...paragraphs, checkbox];
	const data = new TextEncoder().encode(parts.join('\n'));
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
