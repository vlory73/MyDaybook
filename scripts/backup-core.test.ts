import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/lib/server/db';
// @ts-expect-error plain JS module without types
import { runBackup } from './backup-core.mjs';

const mode = (p: string) => statSync(p).mode & 0o777;
let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'mydaybook-modes-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('owner-only files', () => {
	it('opens the database folder and file as 700 / 600, also when they existed with wider modes', () => {
		const data = join(root, 'data');
		mkdirSync(data, { mode: 0o755 });
		openDatabase(data).close();
		expect(mode(data)).toBe(0o700);
		expect(mode(join(data, 'app.db'))).toBe(0o600);
		chmodSync(join(data, 'app.db'), 0o644);
		openDatabase(data).close();
		expect(mode(join(data, 'app.db'))).toBe(0o600);
	});

	it('writes dumps and the mirrored photos owner-only', async () => {
		const data = join(root, 'data');
		const backup = join(root, 'backup');
		const sqlite = openDatabase(data);
		sqlite.exec('CREATE TABLE t (x)');
		mkdirSync(join(data, 'blobs', 'u1'), { recursive: true });
		writeFileSync(join(data, 'blobs', 'u1', 'b1'), 'cipher', { mode: 0o644 });
		mkdirSync(backup, { mode: 0o755 });
		const res = await runBackup({ sqlite, dataDir: data, backupDir: backup });
		expect(mode(backup)).toBe(0o700);
		expect(mode(join(backup, 'db'))).toBe(0o700);
		expect(mode(res.file)).toBe(0o600);
		expect(mode(join(backup, 'blobs'))).toBe(0o700);
		expect(mode(join(backup, 'blobs', 'u1'))).toBe(0o700);
		expect(mode(join(backup, 'blobs', 'u1', 'b1'))).toBe(0o600);
		// A second run with nothing to copy tightens an older mirror too.
		chmodSync(join(backup, 'blobs', 'u1', 'b1'), 0o644);
		await runBackup({ sqlite, dataDir: data, backupDir: backup });
		expect(mode(join(backup, 'blobs', 'u1', 'b1'))).toBe(0o600);
		sqlite.close();
	});
});
