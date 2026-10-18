#!/usr/bin/env node
// Operator CLI. Plain Node ESM, talks to the SQLite file directly and never runs migrations,
// so the server must have started at least once.
//
//   node scripts/cli.mjs invite [--admin] [--hours 72]
//   node scripts/cli.mjs backup
//
// invite prints one line: <PUBLIC_URL>/join#t=<token> (expires ...). The token sits in the URL fragment, so it never
// reaches server logs. Only SHA-256(token) is stored.
// backup runs the nightly backup once (same code as the server) and prints the dump file name. It is safe while the
// server is running (SQLite online backup). Folders: DATA_DIR, BACKUP_DIR (default <DATA_DIR>/../backup), BACKUP_KEEP.
import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { resolveBackupDir, resolveKeep, runBackup } from './backup-core.mjs';

function die(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function parseInvite(args) {
	let role = 'member';
	let hours = 72;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--admin') role = 'admin';
		else if (args[i] === '--hours') {
			hours = Number(args[++i]);
		} else die(`Unknown option: ${args[i]}`);
	}
	if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30)
		die('--hours must be a whole number from 1 to 720');
	return { role, hours };
}

function invite(args) {
	const { role, hours } = parseInvite(args);
	const dbPath = join(resolve(process.env.DATA_DIR || './data'), 'app.db');
	if (!existsSync(dbPath)) die(`No database at ${dbPath}. Start the server once first so it can create it.`);
	const sqlite = new Database(dbPath, { fileMustExist: true });
	try {
		sqlite.pragma('busy_timeout = 5000');
		const tables = new Set(
			sqlite
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all()
				.map((r) => r.name)
		);
		if (!tables.has('invites') || !tables.has('admin_audit')) {
			die('The database has no tables yet. Start the server once first so it can run its migrations.');
		}
		const token = randomBytes(32).toString('base64url');
		const now = Date.now();
		const expiresAt = now + hours * 3_600_000;
		const id = randomUUID();
		sqlite
			.transaction(() => {
				sqlite
					.prepare(
						'INSERT INTO invites (id, token_hash, created_by, role, created_at, expires_at) VALUES (?, ?, NULL, ?, ?, ?)'
					)
					.run(id, createHash('sha256').update(token).digest(), role, now, expiresAt);
				sqlite
					.prepare('INSERT INTO admin_audit (id, admin_id, action, target_id, at) VALUES (?, NULL, ?, ?, ?)')
					.run(randomUUID(), 'invite', id, now);
			})
			.immediate();
		const base = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/+$/, '');
		process.stdout.write(`${base}/join#t=${token} (${role}, expires ${new Date(expiresAt).toISOString()})\n`);
	} finally {
		sqlite.close();
	}
}

async function backup() {
	const dataDir = resolve(process.env.DATA_DIR || './data');
	const dbPath = join(dataDir, 'app.db');
	if (!existsSync(dbPath)) die(`No database at ${dbPath}. Start the server once first so it can create it.`);
	const sqlite = new Database(dbPath, { fileMustExist: true });
	try {
		sqlite.pragma('busy_timeout = 5000');
		const result = await runBackup({
			sqlite,
			dataDir,
			backupDir: resolveBackupDir(),
			keep: resolveKeep(process.env.BACKUP_KEEP)
		});
		process.stdout.write(`${basename(result.file)}\n`);
	} catch (err) {
		die(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		sqlite.close();
	}
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'invite') invite(rest);
else if (command === 'backup') await backup();
else die('Usage: node scripts/cli.mjs invite [--admin] [--hours 72] | backup');
