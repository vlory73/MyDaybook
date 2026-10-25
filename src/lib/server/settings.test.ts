import { afterEach, describe, expect, it } from 'vitest';
import { backupRetentionDays, optionalText, privacySettings } from './settings';

describe('backupRetentionDays', () => {
	it('defaults to 14', () => {
		expect(backupRetentionDays(undefined)).toBe(14);
		expect(backupRetentionDays('')).toBe(14);
	});
	it('takes a whole number of days, 2 or more', () => {
		expect(backupRetentionDays('30')).toBe(30);
		expect(backupRetentionDays(' 21 ')).toBe(21);
		expect(backupRetentionDays('2')).toBe(2);
	});
	it('falls back on anything else', () => {
		for (const bad of ['0', '1', '-5', '1.5', 'abc', '14 days', '99999', '1e3']) {
			expect(backupRetentionDays(bad)).toBe(14);
		}
	});
});

describe('optionalText', () => {
	it('is empty when unset, single-line and trimmed otherwise', () => {
		expect(optionalText(undefined)).toBe('');
		expect(optionalText('   ')).toBe('');
		expect(optionalText('  The  Lory\nfamily ')).toBe('The Lory family');
		expect(optionalText('x'.repeat(500))).toHaveLength(120);
	});
});

describe('privacySettings', () => {
	const saved = process.env.IP_RETENTION_DAYS;
	afterEach(() => {
		if (saved === undefined) delete process.env.IP_RETENTION_DAYS;
		else process.env.IP_RETENTION_DAYS = saved;
	});

	it('returns only the four public values, with defaults', () => {
		delete process.env.IP_RETENTION_DAYS;
		expect(privacySettings({})).toEqual({
			ipRetentionDays: 7,
			backupRetentionDays: 14,
			operatorName: '',
			operatorContact: ''
		});
	});
	it('reads the operator values and the IP retention (0 means not kept)', () => {
		process.env.IP_RETENTION_DAYS = '0';
		const s = privacySettings({
			BACKUP_RETENTION_DAYS: '30',
			OPERATOR_NAME: 'The Example family',
			OPERATOR_CONTACT: 'family@example.org',
			SESSION_SECRET: 'must not leak'
		});
		expect(s).toEqual({
			ipRetentionDays: 0,
			backupRetentionDays: 30,
			operatorName: 'The Example family',
			operatorContact: 'family@example.org'
		});
	});
	it('a bad IP_RETENTION_DAYS falls back to 7', () => {
		process.env.IP_RETENTION_DAYS = 'many';
		expect(privacySettings({}).ipRetentionDays).toBe(7);
	});
});
