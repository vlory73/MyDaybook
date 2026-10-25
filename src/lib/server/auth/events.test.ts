import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'mydaybook-events-'));
	vi.stubEnv('DATA_DIR', dir);
	vi.resetModules();
});
afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(dir, { recursive: true, force: true });
});

const b = Buffer.from('synthetic');
const DAY = 86_400_000;

describe('pruneSpentTokens', () => {
	it('removes expired recovery tokens and expired or long-used invites, nothing else', async () => {
		const dbm = await import('../db');
		const { migrateWithBackup } = await import('../db/migrate');
		const { invites, recoveryTokens, users } = await import('../db/schema');
		await migrateWithBackup(dbm.sqliteHandle(), dir, resolve('drizzle'));
		const { pruneSpentTokens } = await import('./events');
		const d = dbm.db();
		const now = Date.parse('2026-10-20T12:00:00Z');
		d.insert(users)
			.values({
				id: 'u1',
				username: 'u1',
				kind: 'adult',
				createdAt: 1,
				kdfSalt: b,
				kdfParams: '{}',
				authVerifier: b,
				recoveryVerifier: b,
				wrappedMkPw: b,
				wrappedMkRk: b,
				publicKey: b,
				wrappedPrivateKey: b
			})
			.run();
		d.insert(recoveryTokens)
			.values([
				{ id: 'r-old', tokenHash: Buffer.from('r1'), userId: 'u1', expiresAt: now - 1 },
				{ id: 'r-live', tokenHash: Buffer.from('r2'), userId: 'u1', expiresAt: now + 1000 }
			])
			.run();
		const invite = (id: string, over: Partial<typeof invites.$inferInsert>) => ({
			id,
			tokenHash: Buffer.from(id),
			createdAt: now - 10 * DAY,
			expiresAt: now + DAY,
			...over
		});
		d.insert(invites)
			.values([
				invite('i-expired', { expiresAt: now - 1 }),
				invite('i-open', {}),
				invite('i-used-old', { usedAt: now - 8 * DAY }),
				invite('i-used-new', { usedAt: now - DAY })
			])
			.run();

		expect(pruneSpentTokens(now)).toBe(3);
		expect(
			d
				.select()
				.from(recoveryTokens)
				.all()
				.map((r) => r.id)
		).toEqual(['r-live']);
		expect(
			d
				.select()
				.from(invites)
				.all()
				.map((r) => r.id)
				.sort()
		).toEqual(['i-open', 'i-used-new']);
	});
});
