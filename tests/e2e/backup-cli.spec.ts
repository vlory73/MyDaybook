import { request as pwRequest } from '@playwright/test';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from './fixtures';
import { DATA_DIR, ORIGIN, signUpApiAccount } from './helpers';

// Synthetic data only. The CLI backs up the live e2e database while the server is running.

test('`cli.mjs backup` writes a verified dump of the running server database', async () => {
	const ctx = await pwRequest.newContext({ baseURL: ORIGIN });
	const account = await signUpApiAccount(ctx, { prefix: 'bak' });
	await ctx.dispose();

	const backupDir = mkdtempSync(join(tmpdir(), 'mydaybook-e2e-backup-'));
	try {
		const out = execFileSync('node', ['scripts/cli.mjs', 'backup'], {
			env: { ...process.env, DATA_DIR, BACKUP_DIR: backupDir },
			encoding: 'utf8'
		}).trim();
		expect(out).toMatch(/^app-\d{4}-\d{2}-\d{2}T\d{6}Z\.sqlite$/);
		expect(readdirSync(join(backupDir, 'db'))).toEqual([out]);

		const dump = new Database(join(backupDir, 'db', out), { readonly: true });
		expect(dump.pragma('integrity_check', { simple: true })).toBe('ok');
		const row = dump.prepare('SELECT id FROM users WHERE username = ?').get(account.username);
		dump.close();
		expect(row).toEqual({ id: account.userId });
	} finally {
		rmSync(backupDir, { recursive: true, force: true });
	}
});
