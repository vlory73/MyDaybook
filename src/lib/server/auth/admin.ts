import { randomUUID } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import { adminAudit, users } from '../db/schema';
import type { Db } from '../db';

/** Admin action guards and helpers (ARCHITECTURE §7). Pure where possible, so they are unit-tested directly. */
export type GuardError = 'cannot_disable_self' | 'cannot_delete_self' | 'last_admin';

type Target = { id: string; role: 'member' | 'admin'; status: 'active' | 'disabled' };

/** An admin cannot lock themselves out, and the last active admin can never be disabled. Null means allowed. */
export function checkDisable(adminId: string, target: Target, activeAdmins: number): GuardError | null {
	if (target.id === adminId) return 'cannot_disable_self';
	if (target.role === 'admin' && target.status === 'active' && activeAdmins <= 1) return 'last_admin';
	return null;
}

/** Deleting yourself goes through account deletion; the last active admin can never be deleted. */
export function checkDelete(adminId: string, target: Target, activeAdmins: number): GuardError | null {
	if (target.id === adminId) return 'cannot_delete_self';
	if (target.role === 'admin' && target.status === 'active' && activeAdmins <= 1) return 'last_admin';
	return null;
}

/** Deleting your own account: the last active admin may not, or nobody could run the instance. Null means allowed. */
export function checkSelfDelete(self: Target, activeAdmins: number): GuardError | null {
	if (self.role === 'admin' && self.status === 'active' && activeAdmins <= 1) return 'last_admin';
	return null;
}

/** The calendar day (UTC, YYYY-MM-DD) of a timestamp. Admins only ever see the day, never the time. */
export function dayOf(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

type Reader = Pick<Db, 'select'>;

export function activeAdminCount(d: Reader): number {
	return d
		.select({ n: count() })
		.from(users)
		.where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
		.get()!.n;
}

type Writer = Pick<Db, 'insert'>;

export function audit(
	d: Writer,
	adminId: string,
	action: (typeof adminAudit.$inferInsert)['action'],
	targetId: string | null,
	at = Date.now()
): void {
	d.insert(adminAudit).values({ id: randomUUID(), adminId, action, targetId, at }).run();
}
