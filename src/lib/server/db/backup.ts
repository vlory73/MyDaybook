import type Database from 'better-sqlite3';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	utimesSync
} from 'node:fs';
import { join } from 'node:path';
import { logLine, utcStamp } from './log';

/** Stable name pattern the NAS job relies on (docs/HOME_DEPLOYMENT.md). */
export const NIGHTLY_PATTERN = /^app-\d{4}-\d{2}-\d{2}T\d{6}Z\.sqlite$/;

export interface NightlyOptions {
	sqlite: Database.Database;
	dataDir: string;
	backupDir: string;
	keep?: number;
}

function mirrorDir(src: string, dest: string): { copied: number; deleted: number } {
	let copied = 0;
	let deleted = 0;
	mkdirSync(dest, { recursive: true });
	const wanted = new Map(
		existsSync(src) ? readdirSync(src, { withFileTypes: true }).map((e) => [e.name, e]) : []
	);
	for (const [name, entry] of wanted) {
		const from = join(src, name);
		const to = join(dest, name);
		if (entry.isDirectory()) {
			const sub = mirrorDir(from, to);
			copied += sub.copied;
			deleted += sub.deleted;
		} else if (entry.isFile()) {
			const s = statSync(from);
			const d = existsSync(to) ? statSync(to) : undefined;
			if (!d || !d.isFile() || d.size !== s.size || Math.floor(d.mtimeMs) !== Math.floor(s.mtimeMs)) {
				const tmp = `${to}.partial`;
				copyFileSync(from, tmp);
				utimesSync(tmp, s.atime, s.mtime);
				renameSync(tmp, to);
				copied++;
			}
		}
	}
	for (const entry of readdirSync(dest, { withFileTypes: true })) {
		if (!wanted.has(entry.name) && !entry.name.endsWith('.partial')) {
			rmSync(join(dest, entry.name), { recursive: true, force: true });
			deleted++;
		}
	}
	return { copied, deleted };
}

/** Consistent DB snapshot via the online backup API, then a mirror of the encrypted blob store. */
export async function writeNightlyBackup(opts: NightlyOptions): Promise<{ file: string }> {
	const keep = Math.max(1, opts.keep ?? 3);
	const dbDir = join(opts.backupDir, 'db');
	mkdirSync(dbDir, { recursive: true });

	const name = `app-${utcStamp()}.sqlite`;
	const tmp = join(dbDir, `${name}.partial`); // never matches NIGHTLY_PATTERN
	try {
		await opts.sqlite.backup(tmp);
		renameSync(tmp, join(dbDir, name));
	} catch (err) {
		rmSync(tmp, { force: true });
		throw err;
	}
	const files = readdirSync(dbDir)
		.filter((f) => NIGHTLY_PATTERN.test(f))
		.sort();
	for (const old of files.slice(0, Math.max(0, files.length - keep)))
		rmSync(join(dbDir, old), { force: true });

	// Blobs are immutable and written atomically, so mirroring after the snapshot is consistent.
	const blobs = mirrorDir(join(opts.dataDir, 'blobs'), join(opts.backupDir, 'blobs'));
	logLine({
		event: 'nightly_backup_written',
		file: name,
		blobs_copied: blobs.copied,
		blobs_deleted: blobs.deleted
	});
	return { file: join(dbDir, name) };
}

/** Next occurrence of HH:MM in server local time, strictly after `now`. Invalid input falls back to 04:00. */
export function nextRun(now: Date, time: string): Date {
	const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	let h = m ? Number(m[1]) : 4;
	let min = m ? Number(m[2]) : 0;
	if (h > 23 || min > 59) {
		h = 4;
		min = 0;
	}
	const next = new Date(now);
	next.setHours(h, min, 0, 0);
	if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
	return next;
}

/** Runs the nightly backup daily when BACKUP_DIR is set. Never throws into the process. */
export function scheduleNightlyBackup(
	getHandle: () => { sqlite: Database.Database; dataDir: string }
): (() => void) | undefined {
	const backupDir = process.env.BACKUP_DIR;
	if (!backupDir) return undefined;
	const time = process.env.BACKUP_TIME || '04:00';
	const keep = Number.parseInt(process.env.BACKUP_KEEP ?? '3', 10) || 3;
	let timer: NodeJS.Timeout | undefined;
	let stopped = false;

	const arm = () => {
		if (stopped) return;
		const at = nextRun(new Date(), time);
		timer = setTimeout(run, at.getTime() - Date.now());
		timer.unref();
		logLine({ event: 'nightly_backup_scheduled', at: at.toISOString() });
	};
	const run = async () => {
		try {
			const { sqlite, dataDir } = getHandle();
			await writeNightlyBackup({ sqlite, dataDir, backupDir, keep });
		} catch (err) {
			logLine({ event: 'nightly_backup_failed', reason: err instanceof Error ? err.message : String(err) });
		} finally {
			arm();
		}
	};
	arm();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
