import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { logLine, utcStamp } from './log';

export const PRE_MIGRATE_KEEP = 5;
const PRE_MIGRATE_PATTERN = /^pre-migrate-\d{4}-\d{2}-\d{2}T\d{6}Z-\d+-\d+\.db$/;

export interface MigrationResult {
	applied: number;
	backup: string | null;
}

function appliedCount(sqlite: Database.Database): number {
	const table = sqlite
		.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`)
		.get();
	if (!table) return 0;
	return (sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;
}

function lastAppliedMillis(sqlite: Database.Database): number {
	const table = sqlite
		.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`)
		.get();
	if (!table) return 0;
	const row = sqlite.prepare('SELECT MAX(created_at) AS m FROM __drizzle_migrations').get() as {
		m: number | null;
	};
	return row.m ?? 0;
}

function hasUserTables(sqlite: Database.Database): boolean {
	const row = sqlite
		.prepare(
			`SELECT COUNT(*) AS n FROM sqlite_master
			 WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> '__drizzle_migrations'`
		)
		.get() as { n: number };
	return row.n > 0;
}

function pruneBackups(dir: string, keep: number): void {
	const files = readdirSync(dir)
		.filter((f) => PRE_MIGRATE_PATTERN.test(f))
		.sort(); // fixed-width UTC stamp first, so name order is time order
	for (const old of files.slice(0, Math.max(0, files.length - keep))) {
		rmSync(join(dir, old), { force: true });
		logLine({ event: 'pre_migrate_backup_pruned', file: old });
	}
}

/**
 * Applies pending migrations. If any are pending on a database that already holds data, a consistent
 * backup is written first with SQLite's online backup API. If that fails, this throws and nothing is migrated.
 */
export async function migrateWithBackup(
	sqlite: Database.Database,
	dataDir: string,
	migrationsFolder: string
): Promise<MigrationResult> {
	const all = readMigrationFiles({ migrationsFolder });
	const last = lastAppliedMillis(sqlite);
	const pending = all.filter((m) => m.folderMillis > last);
	if (pending.length === 0) {
		logLine({ event: 'migrations_up_to_date', total: all.length });
		return { applied: 0, backup: null };
	}

	const from = appliedCount(sqlite);
	const to = all.length;
	let backup: string | null = null;

	if (from > 0 || hasUserTables(sqlite)) {
		const dir = join(dataDir, 'backups');
		const name = `pre-migrate-${utcStamp()}-${from}-${to}.db`;
		const tmp = join(dir, `${name}.partial`);
		try {
			mkdirSync(dir, { recursive: true });
			await sqlite.backup(tmp);
			renameSync(tmp, join(dir, name));
			pruneBackups(dir, PRE_MIGRATE_KEEP);
		} catch (err) {
			if (existsSync(tmp)) rmSync(tmp, { force: true });
			const reason = err instanceof Error ? err.message : String(err);
			logLine({ event: 'pre_migrate_backup_failed', from, to, reason });
			throw new Error(`Pre-migration backup failed, refusing to migrate: ${reason}`, { cause: err });
		}
		backup = join(dir, name);
		logLine({ event: 'pre_migrate_backup_written', file: name, from, to });
	}

	migrate(drizzle(sqlite), { migrationsFolder });
	logLine({ event: 'migrations_applied', applied: pending.length, from, to });
	return { applied: pending.length, backup };
}
