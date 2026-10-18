import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { dataDir, sqliteHandle, writeTx } from '../db';
import { adminAudit, securityEvents, users } from '../db/schema';
import { ApiError } from './http';

/** Dependents for whom this user is the only guardian (decision D12). */
export function soleGuardianOf(userId: string): number {
	const row = sqliteHandle()
		.prepare(
			`SELECT COUNT(*) AS n FROM guardianships g
			 WHERE g.guardian_id = ? AND NOT EXISTS (
				SELECT 1 FROM guardianships o WHERE o.dependent_id = g.dependent_id AND o.guardian_id <> g.guardian_id
			 )`
		)
		.get(userId) as { n: number };
	return row.n;
}

/**
 * Art. 17 erasure, shared by account deletion and the admin's delete. Foreign keys cascade to records, sessions,
 * consents, guardianships, push subscriptions and reminder slots. The user's security_events go too; admin_audit rows
 * stay for accountability (D23). Throws 409 `last_guardian` (D12). `audit` adds an admin_audit row in the same
 * transaction, so the trail cannot be missing after a delete.
 */
export function eraseUser(userId: string, audit?: { adminId: string }): void {
	writeTx((tx) => {
		if (soleGuardianOf(userId) > 0) throw new ApiError(409, 'last_guardian');
		tx.delete(securityEvents).where(eq(securityEvents.userId, userId)).run();
		tx.delete(users).where(eq(users.id, userId)).run();
		if (audit) {
			tx.insert(adminAudit)
				.values({
					id: randomUUID(),
					adminId: audit.adminId,
					action: 'delete',
					targetId: userId,
					at: Date.now()
				})
				.run();
		}
	});
	rmSync(join(dataDir(), 'blobs', userId), { recursive: true, force: true });
	sqliteHandle().pragma('wal_checkpoint(TRUNCATE)');
}
