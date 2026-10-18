import { describe, expect, it } from 'vitest';
import { checkNewPassphrase, passphraseStrength } from './passphrase';

// Synthetic passphrases only.
describe('passphraseStrength', () => {
	it('calls short, repetitive and common passphrases weak', () => {
		expect(passphraseStrength('')).toBe('weak');
		expect(passphraseStrength('abc123')).toBe('weak');
		expect(passphraseStrength('aaaaaaaaaaaaaaaa')).toBe('weak');
		expect(passphraseStrength('Password')).toBe('weak');
		expect(passphraseStrength('1234567890')).toBe('weak');
	});

	it('calls mid-length passphrases okay', () => {
		expect(passphraseStrength('tulip meadow ok')).toBe('okay');
		expect(passphraseStrength('Blue7!kite')).toBe('okay');
	});

	it('calls 16+ characters or 4+ words strong', () => {
		expect(passphraseStrength('correct horse battery')).toBe('strong');
		expect(passphraseStrength('quiet fern lamp owl')).toBe('strong');
		expect(passphraseStrength('synthetic passphrase abc123')).toBe('strong');
	});

	it('counts letters like æ, ø and å as characters', () => {
		expect(passphraseStrength('blåbærgrød og rød')).toBe('strong');
	});
});

describe('checkNewPassphrase', () => {
	it('requires at least okay, then a matching repeat', () => {
		expect(checkNewPassphrase('short', 'short')).toBe('weak');
		expect(checkNewPassphrase('quiet fern lamp owl', 'quiet fern lamp')).toBe('mismatch');
		expect(checkNewPassphrase('quiet fern lamp owl', 'quiet fern lamp owl')).toBe('ok');
	});
});
