import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

/** Opens `<dataDir>/app.db` (creating the directory) with the pragmas from ARCHITECTURE §10. */
export function openDatabase(dataDir: string): Database.Database {
	mkdirSync(dataDir, { recursive: true });
	const sqlite = new Database(join(dataDir, 'app.db'));
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('secure_delete = ON');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('synchronous = NORMAL');
	return sqlite;
}

export function wrap(sqlite: Database.Database): Db {
	return drizzle(sqlite, { schema });
}

// Plain process.env works in vitest and in the built server (adapter-node passes the real environment).
export function dataDir(): string {
	return resolve(process.env.DATA_DIR || './data');
}

/** Folder with the generated SQL migrations. The Docker image must contain it next to the build. */
export function migrationsFolder(): string {
	return resolve(process.env.MIGRATIONS_DIR || './drizzle');
}

let instance: { sqlite: Database.Database; db: Db } | undefined;

function ensure() {
	if (!instance) {
		const sqlite = openDatabase(dataDir());
		instance = { sqlite, db: wrap(sqlite) };
	}
	return instance;
}

/** Lazily created singleton drizzle handle. */
export function db(): Db {
	return ensure().db;
}

/** The raw better-sqlite3 handle of the singleton (backups, health check). */
export function sqliteHandle(): Database.Database {
	return ensure().sqlite;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Runs `fn` in an IMMEDIATE transaction: the write lock is taken up front. A deferred transaction that reads and
 * then writes fails at once (SQLITE_BUSY_SNAPSHOT) if another process, such as the invite CLI, committed in
 * between; with IMMEDIATE the other writer waits for busy_timeout instead. Use this for every write.
 */
export function writeTx<T>(fn: (tx: Tx) => T): T {
	return db().transaction(fn, { behavior: 'immediate' });
}
