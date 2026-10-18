import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDatabase, wrap } from './index';
import { migrateWithBackup } from './migrate';
import { NIGHTLY_PATTERN, nextRun, writeNightlyBackup } from './backup';
import { records, users } from './schema';
import { eq } from 'drizzle-orm';

const REAL_MIGRATIONS = resolve('drizzle');
const PRE_MIGRATE = /^pre-migrate-\d{4}-\d{2}-\d{2}T\d{6}Z-(\d+)-(\d+)\.db$/;

let root: string;
const open: Database.Database[] = [];

function tmp(): string {
	return mkdtempSync(join(tmpdir(), 'mydaybook-db-'));
}
function fresh(dir = join(root, 'data')) {
	const sqlite = openDatabase(dir);
	open.push(sqlite);
	return { sqlite, dir };
}
/** Copy of the real migrations plus one extra (synthetic) migration that is newer than all of them. */
function withExtraMigration(name: string, when: number, sql: string): string {
	const folder = join(root, `migrations-${name}`);
	cpSync(REAL_MIGRATIONS, folder, { recursive: true });
	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	journal.entries.push({ idx: journal.entries.length, version: '6', when, tag: name, breakpoints: true });
	writeFileSync(journalPath, JSON.stringify(journal));
	writeFileSync(join(folder, `${name}.sql`), sql);
	return folder;
}
function syntheticUser(id: string, username: string | null = id) {
	const b = Buffer.from('synthetic');
	return {
		id,
		username,
		kind: 'adult' as const,
		createdAt: 1,
		kdfSalt: b,
		kdfParams: '{}',
		authVerifier: b,
		recoveryVerifier: b,
		wrappedMkPw: b,
		wrappedMkRk: b,
		publicKey: b,
		wrappedPrivateKey: b
	};
}

beforeEach(() => {
	root = tmp();
});
afterEach(() => {
	for (const d of open.splice(0)) if (d.open) d.close();
	rmSync(root, { recursive: true, force: true });
});

describe('openDatabase', () => {
	it('creates the directory and sets the pragmas', () => {
		const { sqlite, dir } = fresh(join(root, 'nested', 'data'));
		expect(existsSync(join(dir, 'app.db'))).toBe(true);
		expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(sqlite.pragma('secure_delete', { simple: true })).toBe(1);
		expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
		expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
		expect(sqlite.pragma('synchronous', { simple: true })).toBe(1); // NORMAL
	});
});

describe('migrateWithBackup', () => {
	it('applies migrations on a fresh database without a backup', async () => {
		const { sqlite, dir } = fresh();
		const result = await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		expect(result.applied).toBeGreaterThan(0);
		expect(result.backup).toBeNull();
		expect(existsSync(join(dir, 'backups'))).toBe(false);
		const tables = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as {
			name: string;
		}[];
		for (const t of ['users', 'records', 'sessions', 'security_events', 'admin_audit']) {
			expect(tables.map((r) => r.name)).toContain(t);
		}
	});

	it('writes no backup when nothing is pending', async () => {
		const { sqlite, dir } = fresh();
		await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		const again = await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		expect(again).toEqual({ applied: 0, backup: null });
		expect(existsSync(join(dir, 'backups'))).toBe(false);
	});

	it('backs up a non-empty database before applying a pending migration', async () => {
		const { sqlite, dir } = fresh();
		await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		wrap(sqlite).insert(users).values(syntheticUser('u1', 'alice')).run();

		const folder = withExtraMigration(
			'0001_extra',
			Date.now() + 10_000,
			'CREATE TABLE extra_t (id integer);'
		);
		const result = await migrateWithBackup(sqlite, dir, folder);

		expect(result.applied).toBe(1);
		const files = readdirSync(join(dir, 'backups'));
		expect(files).toHaveLength(1);
		const match = PRE_MIGRATE.exec(files[0] ?? '');
		expect(match).not.toBeNull();
		expect([match![1], match![2]]).toEqual(['1', '2']);

		// The backup holds the pre-migration state: the user, but not the new table.
		const snap = new Database(join(dir, 'backups', files[0]!), { readonly: true });
		expect(snap.prepare('SELECT username FROM users').get()).toEqual({ username: 'alice' });
		expect(snap.prepare(`SELECT name FROM sqlite_master WHERE name='extra_t'`).get()).toBeUndefined();
		snap.close();
		expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE name='extra_t'`).get()).toBeDefined();
	});

	it('refuses to migrate when the backup fails', async () => {
		const { sqlite, dir } = fresh();
		await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		writeFileSync(join(dir, 'backups'), 'not a directory');

		const folder = withExtraMigration(
			'0001_extra',
			Date.now() + 10_000,
			'CREATE TABLE extra_t (id integer);'
		);
		await expect(migrateWithBackup(sqlite, dir, folder)).rejects.toThrow(/Pre-migration backup failed/);
		expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE name='extra_t'`).get()).toBeUndefined();
		expect(sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get()).toEqual({ n: 1 });
	});

	it('keeps only the newest 5 pre-migration backups', async () => {
		const { sqlite, dir } = fresh();
		await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		const backups = join(dir, 'backups');
		mkdirSync(backups);
		for (let day = 1; day <= 6; day++) {
			writeFileSync(join(backups, `pre-migrate-2020-01-0${day}T000000Z-1-2.db`), 'old');
		}
		writeFileSync(join(backups, 'unrelated.txt'), 'keep me');

		const folder = withExtraMigration(
			'0001_extra',
			Date.now() + 10_000,
			'CREATE TABLE extra_t (id integer);'
		);
		await migrateWithBackup(sqlite, dir, folder);

		const files = readdirSync(backups).filter((f) => PRE_MIGRATE.test(f));
		expect(files).toHaveLength(5);
		expect(files).not.toContain('pre-migrate-2020-01-01T000000Z-1-2.db');
		expect(files).not.toContain('pre-migrate-2020-01-02T000000Z-1-2.db');
		expect(existsSync(join(backups, 'unrelated.txt'))).toBe(true);
	});
});

describe('schema', () => {
	it('cascades user deletion to records', async () => {
		const { sqlite, dir } = fresh();
		await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		const db = wrap(sqlite);
		db.insert(users).values(syntheticUser('u1', 'alice')).run();
		db.insert(users).values(syntheticUser('u2', 'bob')).run();
		const rec = (id: string, userId: string) => ({
			id,
			userId,
			wrappedKey: Buffer.from('k'),
			ciphertext: Buffer.from('c'),
			size: 1,
			createdAt: 1,
			updatedAt: 1
		});
		db.insert(records)
			.values([rec('r1', 'u1'), rec('r2', 'u1'), rec('r3', 'u2')])
			.run();

		db.delete(users).where(eq(users.id, 'u1')).run();
		expect(
			db
				.select()
				.from(records)
				.all()
				.map((r) => r.id)
		).toEqual(['r3']);
	});

	it('allows several dependents without a username but rejects duplicate usernames', async () => {
		const { sqlite, dir } = fresh();
		await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		const db = wrap(sqlite);
		db.insert(users).values(syntheticUser('d1', null)).run();
		db.insert(users).values(syntheticUser('d2', null)).run();
		db.insert(users).values(syntheticUser('u1', 'alice')).run();
		expect(() => db.insert(users).values(syntheticUser('u2', 'alice')).run()).toThrow();
	});
});

describe('nightly backup', () => {
	async function seeded() {
		const { sqlite, dir } = fresh();
		await migrateWithBackup(sqlite, dir, REAL_MIGRATIONS);
		wrap(sqlite).insert(users).values(syntheticUser('u1', 'alice')).run();
		return { sqlite, dir, backupDir: join(root, 'backup') };
	}

	it('writes a valid snapshot with the stable name pattern and keeps the newest N', async () => {
		const { sqlite, dir, backupDir } = await seeded();
		const dbDir = join(backupDir, 'db');
		mkdirSync(dbDir, { recursive: true });
		for (const d of ['01', '02', '03', '04'])
			writeFileSync(join(dbDir, `app-2020-01-${d}T040000Z.sqlite`), 'old');

		const { file } = await writeNightlyBackup({ sqlite, dataDir: dir, backupDir, keep: 3 });

		const files = readdirSync(dbDir);
		expect(files.every((f) => NIGHTLY_PATTERN.test(f))).toBe(true); // no .partial leftovers
		expect(files).toHaveLength(3);
		expect(files).not.toContain('app-2020-01-01T040000Z.sqlite');
		expect(files).not.toContain('app-2020-01-02T040000Z.sqlite');
		const snap = new Database(file, { readonly: true });
		expect(snap.prepare('SELECT username FROM users').get()).toEqual({ username: 'alice' });
		snap.close();
	});

	it('mirrors blobs: copies new files, updates changed ones, deletes removed ones', async () => {
		const { sqlite, dir, backupDir } = await seeded();
		const blobs = join(dir, 'blobs');
		mkdirSync(join(blobs, 'user1'), { recursive: true });
		writeFileSync(join(blobs, 'user1', 'a'), 'aaa');
		writeFileSync(join(blobs, 'user1', 'b'), 'bbb');
		await writeNightlyBackup({ sqlite, dataDir: dir, backupDir });
		expect(readFileSync(join(backupDir, 'blobs', 'user1', 'a'), 'utf8')).toBe('aaa');
		expect(readFileSync(join(backupDir, 'blobs', 'user1', 'b'), 'utf8')).toBe('bbb');

		rmSync(join(blobs, 'user1', 'a'));
		writeFileSync(join(blobs, 'user1', 'b'), 'bbbbbb');
		utimesSync(join(blobs, 'user1', 'b'), new Date(), new Date(Date.now() + 5000));
		writeFileSync(join(blobs, 'user1', 'c'), 'ccc');
		mkdirSync(join(blobs, 'user2'));
		writeFileSync(join(blobs, 'user2', 'd'), 'ddd');
		await writeNightlyBackup({ sqlite, dataDir: dir, backupDir });

		expect(existsSync(join(backupDir, 'blobs', 'user1', 'a'))).toBe(false);
		expect(readFileSync(join(backupDir, 'blobs', 'user1', 'b'), 'utf8')).toBe('bbbbbb');
		expect(readFileSync(join(backupDir, 'blobs', 'user1', 'c'), 'utf8')).toBe('ccc');
		expect(readFileSync(join(backupDir, 'blobs', 'user2', 'd'), 'utf8')).toBe('ddd');

		rmSync(join(blobs, 'user2'), { recursive: true });
		await writeNightlyBackup({ sqlite, dataDir: dir, backupDir });
		expect(existsSync(join(backupDir, 'blobs', 'user2'))).toBe(false);
	});

	it('works when there is no blob store yet', async () => {
		const { sqlite, dir, backupDir } = await seeded();
		await writeNightlyBackup({ sqlite, dataDir: dir, backupDir });
		expect(readdirSync(join(backupDir, 'blobs'))).toEqual([]);
	});
});

describe('nextRun', () => {
	it('returns the next occurrence of HH:MM, today or tomorrow', () => {
		const now = new Date(2026, 9, 18, 3, 0, 0);
		expect(nextRun(now, '04:00')).toEqual(new Date(2026, 9, 18, 4, 0, 0));
		expect(nextRun(new Date(2026, 9, 18, 4, 0, 0), '04:00')).toEqual(new Date(2026, 9, 19, 4, 0, 0));
		expect(nextRun(now, 'nonsense')).toEqual(new Date(2026, 9, 18, 4, 0, 0));
	});
});
