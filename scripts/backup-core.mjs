// Backup core shared by the server (src/lib/server/db/backup.ts) and the operator CLI (scripts/cli.mjs backup).
// Plain Node ESM, no logging and no SvelteKit imports. It never touches anything but the folders it is given.
//
//   <backupDir>/db/app-YYYY-MM-DDTHHMMSSZ.sqlite   consistent snapshot (the file name pattern is a contract with the NAS job)
//   <backupDir>/blobs/                              mirror of <dataDir>/blobs (encrypted photos)
import Database from 'better-sqlite3';
import {
	chmodSync,
	copyFileSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	utimesSync
} from 'node:fs';
import { join, resolve } from 'node:path';

/** Stable name pattern the NAS job relies on (docs/HOME_DEPLOYMENT.md, "Agreed" item 6). */
export const DUMP_PATTERN = /^app-\d{4}-\d{2}-\d{2}T\d{6}Z\.sqlite$/;
export const DEFAULT_KEEP = 3;
/** Late evening: the owner's NAS is switched off during the night, and its copy job must finish by 01:00. */
export const DEFAULT_TIME = '23:30';

/**
 * `app-YYYY-MM-DDTHHMMSSZ.sqlite` for the given instant, in UTC.
 * @param {Date} [date]
 */
export function dumpName(date = new Date()) {
	return `app-${date
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replace(/:/g, '')}.sqlite`;
}

/**
 * Where backups go: BACKUP_DIR, or `<DATA_DIR>/../backup`. In the container (DATA_DIR=/data) that is `/backup`,
 * which Compose mounts from `./backup`.
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveBackupDir(env = process.env) {
	if (env.BACKUP_DIR) return resolve(env.BACKUP_DIR);
	return resolve(env.DATA_DIR || './data', '..', 'backup');
}

/**
 * BACKUP_KEEP as a positive whole number, default 3.
 * @param {string | undefined} value
 */
export function resolveKeep(value) {
	const n = Number.parseInt(value ?? '', 10);
	return Number.isInteger(n) && n >= 1 ? n : DEFAULT_KEEP;
}

/** @param {string} dir */
function dirEntries(dir) {
	try {
		return readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return [];
		throw err;
	}
}

/** @param {string} path */
function lstatOrNull(path) {
	try {
		return lstatSync(path);
	} catch {
		return null;
	}
}

/**
 * Mirrors `src` into `dest`: copies new or changed files (by size and mtime), removes what is gone from `src`.
 * Symlinks are never followed (they are neither copied nor kept in the destination). Files are copied to a
 * `.partial` name and renamed, so a reader never sees half a file.
 * @param {string} src
 * @param {string} dest
 * @returns {{ files: number, copied: number, deleted: number }}
 */
export function mirrorDir(src, dest) {
	const out = { files: 0, copied: 0, deleted: 0 };
	const destStat = lstatOrNull(dest);
	if (destStat && !destStat.isDirectory()) rmSync(dest, { force: true, recursive: true });
	mkdirSync(dest, { recursive: true, mode: 0o700 });
	restrict(dest, 0o700);
	const wanted = new Map(dirEntries(src).map((e) => [e.name, e]));
	for (const [name, entry] of wanted) {
		const from = join(src, name);
		const to = join(dest, name);
		if (entry.isDirectory()) {
			const sub = mirrorDir(from, to);
			out.files += sub.files;
			out.copied += sub.copied;
			out.deleted += sub.deleted;
		} else if (entry.isFile()) {
			out.files++;
			const s = statSync(from);
			const d = lstatOrNull(to);
			// The copy's time is set through seconds, so it can land a hair below the source's; allow under 1 ms.
			if (!d || !d.isFile() || d.size !== s.size || Math.abs(d.mtimeMs - s.mtimeMs) >= 1) {
				if (d) rmSync(to, { force: true, recursive: true });
				const tmp = `${to}.partial`;
				copyFileSync(from, tmp);
				chmodSync(tmp, 0o600);
				utimesSync(tmp, s.atime, s.mtime);
				renameSync(tmp, to);
				out.copied++;
			} else {
				restrict(to, 0o600);
			}
		}
	}
	for (const entry of dirEntries(dest)) {
		// A `.partial` belongs to a copy in progress or a crashed one; it is replaced on the next copy of that name.
		if (!wanted.has(entry.name) && !(entry.isFile() && entry.name.endsWith('.partial'))) {
			rmSync(join(dest, entry.name), { recursive: true, force: true });
			out.deleted++;
		}
	}
	return out;
}

/**
 * Turns a fresh online-backup file into a standalone single-file database and checks it.
 * @param {string} file
 */
export function finaliseAndVerify(file) {
	const dump = new Database(file, { fileMustExist: true });
	try {
		dump.pragma('journal_mode = DELETE'); // no -wal/-shm next to the dump
		const rows = /** @type {{ integrity_check: string }[]} */ (dump.pragma('integrity_check'));
		if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
			throw Object.assign(new Error('Backup failed its integrity check'), { code: 'INTEGRITY' });
		}
	} finally {
		dump.close();
	}
}

/**
 * Deletes all but the newest `keep` files matching DUMP_PATTERN in `dir`; other files are never touched.
 * @param {string} dir
 * @param {number} keep
 */
export function pruneDumps(dir, keep) {
	const files = readdirSync(dir)
		.filter((f) => DUMP_PATTERN.test(f))
		.sort(); // fixed-width UTC stamp, so name order is time order
	for (const old of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, old), { force: true });
}

/**
 * Best effort: makes `path` owner-only (a folder or file from before this was enforced, or one we do not own, is left).
 * @param {string} path
 * @param {number} mode
 */
function restrict(path, mode) {
	try {
		chmodSync(path, mode);
	} catch {
		/* not the owner: the operator sets the mode */
	}
}

/**
 * @typedef {{ file: string, name: string, bytes: number, blobs: number, blobsCopied: number, blobsDeleted: number, ms: number }} BackupResult
 * @typedef {{ sqlite: import('better-sqlite3').Database, dataDir: string, backupDir: string, keep?: number, now?: Date }} BackupOptions
 */

/** @type {Promise<BackupResult> | null} */
let inFlight = null;

/**
 * One backup: online snapshot of `sqlite` (verified, then renamed into place), retention, blob mirror.
 * Calls made while one is running share that run instead of starting another.
 * @param {BackupOptions} opts
 * @returns {Promise<BackupResult>}
 */
export function runBackup(opts) {
	if (inFlight) return inFlight;
	const p = doBackup(opts).finally(() => {
		inFlight = null;
	});
	inFlight = p;
	return p;
}

/**
 * @param {BackupOptions} opts
 * @returns {Promise<BackupResult>}
 */
async function doBackup(opts) {
	const started = Date.now();
	const keep = Math.max(1, opts.keep ?? DEFAULT_KEEP);
	const dbDir = join(opts.backupDir, 'db');
	mkdirSync(dbDir, { recursive: true, mode: 0o700 });
	restrict(opts.backupDir, 0o700);
	restrict(dbDir, 0o700);
	// Leftovers of a crashed run (a running one is younger than an hour).
	for (const f of readdirSync(dbDir)) {
		if (f.endsWith('.partial') && Date.now() - statSync(join(dbDir, f)).mtimeMs > 3_600_000) {
			rmSync(join(dbDir, f), { force: true });
		}
	}

	const name = dumpName(opts.now);
	const file = join(dbDir, name);
	const tmp = `${file}.partial`; // never matches DUMP_PATTERN, so the NAS job cannot pick it up
	try {
		await opts.sqlite.backup(tmp);
		chmodSync(tmp, 0o600);
		finaliseAndVerify(tmp);
		renameSync(tmp, file);
	} catch (err) {
		rmSync(tmp, { force: true });
		throw err;
	}
	pruneDumps(dbDir, keep);
	for (const f of readdirSync(dbDir)) if (DUMP_PATTERN.test(f)) restrict(join(dbDir, f), 0o600);

	// Blobs are immutable and written atomically, so mirroring after the snapshot is consistent.
	const blobs = mirrorDir(join(opts.dataDir, 'blobs'), join(opts.backupDir, 'blobs'));
	return {
		file,
		name,
		bytes: statSync(file).size,
		blobs: blobs.files,
		blobsCopied: blobs.copied,
		blobsDeleted: blobs.deleted,
		ms: Date.now() - started
	};
}
