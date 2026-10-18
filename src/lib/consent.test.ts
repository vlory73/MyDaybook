import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, consentHash, consentText } from './consent';

describe('consent', () => {
	it('is versioned and shown in full in both languages', () => {
		expect(CONSENT_VERSION).toBe('consent-v1');
		for (const locale of ['en', 'da'] as const) {
			const text = consentText(locale);
			expect(text.paragraphs).toHaveLength(3);
			expect(text.paragraphs.join(' ')).not.toContain('{app}');
			expect(text.paragraphs[2]).toMatch(/14/);
		}
	});

	it('hashes the exact text: hex SHA-256, stable, different per locale', async () => {
		const en = await consentHash('en');
		expect(en).toMatch(/^[0-9a-f]{64}$/);
		expect(await consentHash('en')).toBe(en);
		expect(await consentHash('da')).not.toBe(en);
	});
});
