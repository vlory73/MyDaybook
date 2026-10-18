import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dumpName, resolveBackupDir, resolveKeep, runBackup } from '../../../../scripts/backup-core.mjs';
import { NIGHTLY_PATTERN, backupSettings, nextRun, startSchedule, writeNightlyBackup } from './backup';

// Synthetic data only: a tiny database with one made-up row is enough, the backup code does not know the schema.

let root: string;
let dataDir: string;
let backupDir: string;
const open: Database.Database[] = [];

function seeded() {
	mkdirSync(dataDir, { recursive: true });
	const sqlite = new Database(join(dataDir, 'app.db'));
	sqlite.pragma('journal_mode = WAL');
	sqlite.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT)');
	sqlite.prepare('INSERT INTO users VALUES (?, ?)').run('u1', 'alice');
	open.push(sqlite);
	return sqlite;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'mydaybook-backup-'));
	dataDir = join(root, 'data');
	backupDir = join(root, 'backup');
	vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	for (const d of open.splice(0)) if (d.open) d.close();
	rmSync(root, { recursive: true, force: true });
});

describe('database dump', () => {
	it('is named app-YYYY-MM-DDTHHMMSSZ.sqlite in UTC and holds the data', async () => {
		const sqlite = seeded();
		const now = new Date('2026-10-18T02:00:05.678Z');
		const r = await runBackup({ sqlite, dataDir, backupDir, now });

		expect(dumpName(now)).toBe('app-2026-10-18T020005Z.sqlite');
		expect(r.name).toBe('app-2026-10-18T020005Z.sqlite');
		expect(r.file).toBe(join(backupDir, 'db', r.name));
		expect(NIGHTLY_PATTERN.test(r.name)).toBe(true);
		expect(r.bytes).toBeGreaterThan(0);
		expect(readdirSync(join(backupDir, 'db'))).toEqual([r.name]); // no -wal/-shm/.partial next to it

		const snap = new Database(r.file, { readonly: true });
		expect(snap.pragma('quick_check', { simple: true })).toBe('ok');
		expect(snap.prepare('SELECT username FROM users').get()).toEqual({ username: 'alice' });
		snap.close();
	});

	it('only shows a finished file under the final name (temp name first, then rename)', async () => {
		const real = seeded();
		const seen: string[][] = [];
		const sqlite = {
			backup: async (path: string) => {
				await real.backup(path);
				seen.push(readdirSync(join(backupDir, 'db')));
			}
		} as unknown as Database.Database;
		const r = await runBackup({ sqlite, dataDir, backupDir });
		expect(seen).toHaveLength(1);
		expect(seen[0]!.some((f) => NIGHTLY_PATTERN.test(f))).toBe(false);
		expect(seen[0]).toEqual([`${r.name}.partial`]);
		expect(readdirSync(join(backupDir, 'db'))).toEqual([r.name]);
	});

	it('deletes the dump and fails when it does not verify', async () => {
		const sqlite = {
			backup: async (path: string) => writeFileSync(path, 'this is not a database'.repeat(50))
		} as unknown as Database.Database;
		await expect(runBackup({ sqlite, dataDir, backupDir })).rejects.toThrow();
		expect(readdirSync(join(backupDir, 'db'))).toEqual([]);
	});

	it('logs one line without user data, for success and failure', async () => {
		const sqlite = seeded();
		const write = vi.mocked(process.stdout.write);
		await writeNightlyBackup({ sqlite, dataDir, backupDir });
		const bad = {
			backup: async (p: string) => writeFileSync(p, 'x'.repeat(500))
		} as unknown as Database.Database;
		await expect(writeNightlyBackup({ sqlite: bad, dataDir, backupDir })).rejects.toThrow();
		const lines = write.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ event: 'backup', ok: true, blobs: 0 });
		expect(Object.keys(lines[0]!).sort()).toEqual(['blobs', 'bytes', 'event', 'ms', 'ok', 't']);
		expect(lines[1]).toMatchObject({ event: 'backup', ok: false });
		expect(JSON.stringify(lines)).not.toContain(root);
		expect(JSON.stringify(lines)).not.toContain('alice');
	});

	it('keeps exactly the newest N dumps and ignores other files', async () => {
		const sqlite = seeded();
		const dbDir = join(backupDir, 'db');
		mkdirSync(dbDir, { recursive: true });
		for (const d of ['01', '02', '03', '04'])
			writeFileSync(join(dbDir, `app-2020-01-${d}T040000Z.sqlite`), 'old');
		for (const other of [
			'notes.txt',
			'app-2020-01-01.sqlite',
			'app-2020-01-01T040000Z.sqlite.bak',
			'x.partial'
		])
			writeFileSync(join(dbDir, other), 'keep me');

		await runBackup({ sqlite, dataDir, backupDir, keep: 3 });

		const dumps = readdirSync(dbDir).filter((f) => NIGHTLY_PATTERN.test(f));
		expect(dumps).toHaveLength(3);
		expect(dumps).toContain('app-2020-01-04T040000Z.sqlite');
		expect(dumps).toContain('app-2020-01-03T040000Z.sqlite');
		expect(dumps).not.toContain('app-2020-01-01T040000Z.sqlite');
		expect(dumps).not.toContain('app-2020-01-02T040000Z.sqlite');
		for (const other of [
			'notes.txt',
			'app-2020-01-01.sqlite',
			'app-2020-01-01T040000Z.sqlite.bak',
			'x.partial'
		])
			expect(existsSync(join(dbDir, other))).toBe(true);
	});

	it('never runs two backups at once: concurrent calls share one run', async () => {
		const real = seeded();
		let started = 0;
		const sqlite = {
			backup: async (path: string) => {
				started++;
				await new Promise((r) => setTimeout(r, 30));
				await real.backup(path);
			}
		} as unknown as Database.Database;
		const [a, b] = await Promise.all([
			runBackup({ sqlite, dataDir, backupDir }),
			runBackup({ sqlite, dataDir, backupDir })
		]);
		expect(started).toBe(1);
		expect(b).toBe(a);
		expect(readdirSync(join(backupDir, 'db'))).toHaveLength(1);
		// The lock is released afterwards.
		await runBackup({ sqlite, dataDir, backupDir, now: new Date(Date.now() + 5000) });
		expect(started).toBe(2);
	});
});

describe('blob mirror', () => {
	it('copies new files, updates changed ones, removes deleted ones and ignores symlinks', async () => {
		const sqlite = seeded();
		const blobs = join(dataDir, 'blobs');
		mkdirSync(join(blobs, 'user1'), { recursive: true });
		writeFileSync(join(blobs, 'user1', 'a'), 'aaa');
		writeFileSync(join(blobs, 'user1', 'b'), 'bbb');
		const first = await runBackup({ sqlite, dataDir, backupDir });
		expect(first).toMatchObject({ blobs: 2, blobsCopied: 2, blobsDeleted: 0 });
		expect(readFileSync(join(backupDir, 'blobs', 'user1', 'a'), 'utf8')).toBe('aaa');

		const again = await runBackup({ sqlite, dataDir, backupDir, now: new Date(Date.now() + 5000) });
		expect(again).toMatchObject({ blobs: 2, blobsCopied: 0 }); // unchanged files are not copied again

		rmSync(join(blobs, 'user1', 'a'));
		writeFileSync(join(blobs, 'user1', 'b'), 'bbbbbb');
		utimesSync(join(blobs, 'user1', 'b'), new Date(), new Date(Date.now() + 5000));
		writeFileSync(join(blobs, 'user1', 'c'), 'ccc');
		mkdirSync(join(blobs, 'user2'));
		writeFileSync(join(blobs, 'user2', 'd'), 'ddd');
		symlinkSync(join(root, 'data', 'app.db'), join(blobs, 'user2', 'link'));
		await runBackup({ sqlite, dataDir, backupDir, now: new Date(Date.now() + 10_000) });

		expect(existsSync(join(backupDir, 'blobs', 'user1', 'a'))).toBe(false);
		expect(readFileSync(join(backupDir, 'blobs', 'user1', 'b'), 'utf8')).toBe('bbbbbb');
		expect(readFileSync(join(backupDir, 'blobs', 'user1', 'c'), 'utf8')).toBe('ccc');
		expect(readFileSync(join(backupDir, 'blobs', 'user2', 'd'), 'utf8')).toBe('ddd');
		expect(existsSync(join(backupDir, 'blobs', 'user2', 'link'))).toBe(false);

		rmSync(join(blobs, 'user2'), { recursive: true });
		await runBackup({ sqlite, dataDir, backupDir, now: new Date(Date.now() + 15_000) });
		expect(existsSync(join(backupDir, 'blobs', 'user2'))).toBe(false);
	});

	it('works when there is no blob store yet', async () => {
		const sqlite = seeded();
		await runBackup({ sqlite, dataDir, backupDir });
		expect(readdirSync(join(backupDir, 'blobs'))).toEqual([]);
	});
});

describe('settings', () => {
	it('defaults to 04:00, keep 3 and <DATA_DIR>/../backup', () => {
		const s = backupSettings({ DATA_DIR: '/data' });
		expect(s).toEqual({ enabled: true, time: '04:00', keep: 3, backupDir: '/backup' });
	});
	it('reads BACKUP_DIR, BACKUP_TIME and BACKUP_KEEP; off disables', () => {
		expect(backupSettings({ BACKUP_DIR: '/b', BACKUP_TIME: '23:30', BACKUP_KEEP: '7' })).toEqual({
			enabled: true,
			time: '23:30',
			keep: 7,
			backupDir: '/b'
		});
		expect(backupSettings({ BACKUP_TIME: 'off' }).enabled).toBe(false);
		expect(backupSettings({ BACKUP_TIME: 'OFF' }).enabled).toBe(false);
		expect(backupSettings({ BACKUP_TIME: '25:99' }).time).toBe('04:00');
		expect(resolveKeep('0')).toBe(3);
		expect(resolveKeep('abc')).toBe(3);
		expect(resolveBackupDir({ BACKUP_DIR: '/x', DATA_DIR: '/data' })).toBe('/x');
	});
});

describe('schedule', () => {
	const savedTz = process.env.TZ;
	beforeEach(() => {
		process.env.TZ = 'Europe/Copenhagen';
	});
	afterEach(() => {
		if (savedTz === undefined) delete process.env.TZ;
		else process.env.TZ = savedTz;
	});

	it('finds the next 04:00 local time, also across the DST changes', () => {
		// 2026-10-25: clocks go back, the day has 25 hours. 04:30 CEST -> 04:00 CET.
		expect(nextRun(new Date('2026-10-24T02:30:00Z'), '04:00').toISOString()).toBe('2026-10-25T03:00:00.000Z');
		expect(nextRun(new Date('2026-10-25T03:00:00Z'), '04:00').toISOString()).toBe('2026-10-26T03:00:00.000Z');
		// 2027-03-28: clocks go forward, the day has 23 hours. 04:30 CET -> 04:00 CEST.
		expect(nextRun(new Date('2027-03-27T03:30:00Z'), '04:00').toISOString()).toBe('2027-03-28T02:00:00.000Z');
		// Before 04:00 the same day.
		expect(nextRun(new Date('2026-10-18T01:00:00Z'), '04:00').toISOString()).toBe('2026-10-18T02:00:00.000Z');
		expect(nextRun(new Date('2026-10-18T01:00:00Z'), 'nonsense').toISOString()).toBe(
			'2026-10-18T02:00:00.000Z'
		);
	});

	it('runs once per day at the local time and re-arms from the wall clock', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-24T02:30:00Z'));
		const run = vi.fn(async () => {});
		const stop = startSchedule('04:00', run);

		await vi.advanceTimersByTimeAsync(24.5 * 3_600_000 - 1);
		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1); // 2026-10-25T03:00Z = 04:00 CET
		expect(run).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(24 * 3_600_000 - 1);
		expect(run).toHaveBeenCalledTimes(1); // no replay loop
		await vi.advanceTimersByTimeAsync(1);
		expect(run).toHaveBeenCalledTimes(2);
		stop();
		await vi.advanceTimersByTimeAsync(48 * 3_600_000);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('keeps scheduling after a failed run and does not run early when the clock moved back', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-18T01:00:00Z'));
		const run = vi.fn(async () => {
			throw new Error('boom');
		});
		const stop = startSchedule('04:00', run);
		vi.setSystemTime(new Date('2026-10-18T00:00:00Z')); // clock stepped back by an hour
		await vi.advanceTimersByTimeAsync(3_600_000); // the original timer fires, but it is not yet 04:00 local
		expect(run).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(3_600_000); // 02:00Z
		expect(run).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(24 * 3_600_000);
		expect(run).toHaveBeenCalledTimes(2);
		stop();
	});
});
