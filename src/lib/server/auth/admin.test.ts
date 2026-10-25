import { describe, expect, it } from 'vitest';
import { checkDelete, checkSelfDelete, checkDisable, dayOf } from './admin';

const member = { id: 'm', role: 'member', status: 'active' } as const;
const admin = { id: 'a2', role: 'admin', status: 'active' } as const;

describe('admin guards', () => {
	it('the last active admin cannot delete their own account', () => {
		expect(checkSelfDelete(admin, 1)).toBe('last_admin');
		expect(checkSelfDelete(admin, 2)).toBeNull();
		expect(checkSelfDelete(member, 1)).toBeNull();
	});

	it('an admin cannot disable or delete themselves', () => {
		expect(checkDisable('a2', admin, 2)).toBe('cannot_disable_self');
		expect(checkDelete('a2', admin, 2)).toBe('cannot_delete_self');
	});

	it('the last active admin can be neither disabled nor deleted', () => {
		expect(checkDisable('a1', admin, 1)).toBe('last_admin');
		expect(checkDelete('a1', admin, 1)).toBe('last_admin');
		expect(checkDisable('a1', admin, 2)).toBeNull();
		expect(checkDelete('a1', admin, 2)).toBeNull();
	});

	it('members and already disabled admins are always fine for someone else to act on', () => {
		expect(checkDisable('a1', member, 1)).toBeNull();
		expect(checkDelete('a1', member, 1)).toBeNull();
		expect(checkDisable('a1', { ...admin, status: 'disabled' }, 1)).toBeNull();
	});
});

describe('dayOf', () => {
	it('keeps the calendar day only (UTC), never the time', () => {
		expect(dayOf(Date.UTC(2026, 9, 18, 23, 59, 59))).toBe('2026-10-18');
		expect(dayOf(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
	});
});
