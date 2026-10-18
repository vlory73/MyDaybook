import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Regression test for a CI-only 500 on signup: another process (the invite CLI) committed a write while a
 * request's transaction had read but not yet written. In WAL mode a DEFERRED transaction then fails at once
 * with SQLITE_BUSY_SNAPSHOT (busy_timeout does not apply). IMMEDIATE transactions take the write lock up front.
 */
function open(file: string) {
	const s = new Database(file);
	s.pragma('journal_mode = WAL');
	s.pragma('busy_timeout = 2000');
	return s;
}

describe('write transactions across connections', () => {
	const dir = mkdtempSync(join(tmpdir(), 'mdb-tx-'));
	const file = join(dir, 'app.db');
	const setup = open(file);
	setup.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
	setup.close();

	it('a deferred read-then-write transaction fails if another connection commits in between', () => {
		const a = drizzle(open(file));
		const b = open(file);
		let error: unknown;
		try {
			a.transaction((tx) => {
				tx.all(sql`SELECT * FROM t`);
				b.prepare('INSERT INTO t (v) VALUES (?)').run('other process');
				tx.run(sql`INSERT INTO t (v) VALUES ('request')`);
			});
		} catch (err) {
			error = err;
		}
		// Drizzle wraps the driver error; the cause is SQLite's busy-snapshot error.
		const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
		expect(cause?.code).toMatch(/^SQLITE_BUSY/);
		b.close();
	});

	it('an immediate transaction holds the write lock, so the other writer waits instead', () => {
		const a = drizzle(open(file));
		const b = open(file);
		b.pragma('busy_timeout = 0');
		expect(() =>
			a.transaction(
				(tx) => {
					tx.all(sql`SELECT * FROM t`);
					// The competing writer is refused while we hold the lock (in real life it waits busy_timeout).
					expect(() => b.prepare('INSERT INTO t (v) VALUES (?)').run('other process')).toThrow(
						/SQLITE_BUSY|locked/
					);
					tx.run(sql`INSERT INTO t (v) VALUES ('request')`);
				},
				{ behavior: 'immediate' }
			)
		).not.toThrow();
		b.close();
		rmSync(dir, { recursive: true, force: true });
	});
});
