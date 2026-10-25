import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, CONSENT_VERSIONS, consentHash, consentText, isConsentVersion } from './consent';

describe('consent', () => {
	it('is at version 2, and keeps version 1 bundled', () => {
		expect(CONSENT_VERSION).toBe('consent-v2');
		expect(CONSENT_VERSIONS).toContain('consent-v1');
		expect(isConsentVersion('consent-v1')).toBe(true);
		expect(isConsentVersion('consent-v9')).toBe(false);
		expect(isConsentVersion(2)).toBe(false);
	});

	it('v1 is unchanged: no age line, a fixed 14 days, whatever days are passed', () => {
		for (const locale of ['en', 'da'] as const) {
			const text = consentText(locale, 'consent-v1', 30);
			expect(text.age).toBeNull();
			expect(text.paragraphs).toHaveLength(3);
			expect(text.paragraphs.join(' ')).not.toMatch(/\{\w+\}/);
			expect(text.paragraphs[2]).toMatch(/14/);
			expect(text.paragraphs[2]).not.toMatch(/30/);
		}
		expect(consentText('en', 'consent-v1').checkbox).toBe(
			'I understand, and I agree to my diary being stored this way.'
		);
	});

	it('v2 has the age line, the 13+ checkbox and the real number of days, in both languages', () => {
		for (const locale of ['en', 'da'] as const) {
			const text = consentText(locale, 'consent-v2', 30);
			expect(text.age).toMatch(/13/);
			expect(text.checkbox).toMatch(/13/);
			expect(text.paragraphs).toHaveLength(3);
			expect([text.title, text.age, ...text.paragraphs, text.checkbox].join(' ')).not.toMatch(/\{\w+\}/);
			expect(text.paragraphs[2]).toMatch(/30/);
			expect(text.paragraphs[2]).not.toMatch(/14/);
		}
		expect(consentText('en').age).toBe('MyDaybook is for people aged 13 and over.');
	});

	it('hashes the exact text: hex SHA-256, stable, different per locale and per version', async () => {
		const en = await consentHash('en');
		expect(en).toMatch(/^[0-9a-f]{64}$/);
		expect(await consentHash('en')).toBe(en);
		expect(await consentHash('da')).not.toBe(en);
		expect(await consentHash('en', 'consent-v1')).not.toBe(await consentHash('en', 'consent-v2', 14));
	});

	it('the v2 hash depends on the days; v1 does not', async () => {
		expect(await consentHash('en', 'consent-v2', 14)).not.toBe(await consentHash('en', 'consent-v2', 30));
		expect(await consentHash('en', 'consent-v2', 30)).toBe(await consentHash('en', 'consent-v2', 30));
		expect(await consentHash('en', 'consent-v1', 14)).toBe(await consentHash('en', 'consent-v1', 30));
	});

	it('the v1 hash is what version 1 always produced (title, paragraphs, checkbox)', async () => {
		const { title, paragraphs, checkbox } = consentText('en', 'consent-v1');
		const data = new TextEncoder().encode([title, ...paragraphs, checkbox].join('\n'));
		const digest = await crypto.subtle.digest('SHA-256', data);
		const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
		expect(await consentHash('en', 'consent-v1')).toBe(hex);
	});
});
