import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { findProfile, fullName, greetingName, profileFromInput, reportName } from './profile';
import { parsePayload, type Payload, type ProfilePayload } from './types';

// Synthetic data only.
const rec = (id: string, payload: Payload, updatedAt = 1): StoredRecord =>
	({
		id,
		payload,
		updatedAt
	}) as unknown as StoredRecord;
const p = (firstName?: string, lastName?: string): ProfilePayload => ({
	v: 1,
	type: 'profile',
	firstName,
	lastName
});

describe('profile payload', () => {
	it('accepts either part, both or none', () => {
		expect(parsePayload({ v: 1, type: 'profile' })).not.toBeNull();
		expect(parsePayload({ v: 1, type: 'profile', firstName: 'Ada' })).not.toBeNull();
		expect(parsePayload({ v: 1, type: 'profile', firstName: 'Ada', lastName: 'Test' })).not.toBeNull();
	});
	it('refuses untrimmed, empty, long or non-text names', () => {
		expect(parsePayload({ v: 1, type: 'profile', firstName: ' Ada' })).toBeNull();
		expect(parsePayload({ v: 1, type: 'profile', firstName: '' })).toBeNull();
		expect(parsePayload({ v: 1, type: 'profile', lastName: 'x'.repeat(61) })).toBeNull();
		expect(parsePayload({ v: 1, type: 'profile', lastName: 3 })).toBeNull();
	});
});

describe('profile helpers', () => {
	it('builds the payload from typed text', () => {
		expect(profileFromInput('  Ada ', ' ')).toEqual({ v: 1, type: 'profile', firstName: 'Ada' });
		expect(profileFromInput('Ada  Marie', 'Test')).toEqual({
			v: 1,
			type: 'profile',
			firstName: 'Ada Marie',
			lastName: 'Test'
		});
		expect(profileFromInput('', '  ')).toBeNull();
		expect(profileFromInput('x'.repeat(100), '')!.firstName).toHaveLength(60);
	});
	it('names', () => {
		expect(fullName(p('Ada', 'Test'))).toBe('Ada Test');
		expect(fullName(p(undefined, 'Test'))).toBe('Test');
		expect(fullName(undefined)).toBe('');
		expect(greetingName(p('Ada', 'Test'), 'login')).toBe('Ada');
		expect(greetingName(p(undefined, 'Test'), 'login')).toBe('Test');
		expect(greetingName(undefined, 'login')).toBe('login');
		expect(reportName(p('Ada', 'Test'), 'login')).toBe('Ada Test');
		expect(reportName(undefined, 'login')).toBe('login');
	});
	it('the latest record wins', () => {
		const a = rec('a', p('Old'), 1);
		const b = rec('b', p('New'), 2);
		expect(findProfile([a, b, rec('c', { v: 1, type: 'tag', name: 'x' }, 9)])?.id).toBe('b');
		expect(findProfile([])).toBeUndefined();
	});
});
