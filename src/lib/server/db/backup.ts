import type Database from 'better-sqlite3';
import {
	DEFAULT_TIME,
	DUMP_PATTERN,
	resolveBackupDir,
	resolveKeep,
	runBackup,
	type BackupResult
} from '../../../../scripts/backup-core.mjs';
import { logLine } from './log';

/** Stable name pattern the NAS job relies on (docs/HOME_DEPLOYMENT.md). */
export const NIGHTLY_PATTERN: RegExp = DUMP_PATTERN;

export interface NightlyOptions {
	sqlite: Database.Database;
	dataDir: string;
	backupDir: string;
	keep?: number;
}

/**
 * Runs one backup and logs one line without any user data. Rethrows after logging, so callers decide what failure means.
 */
export async function writeNightlyBackup(opts: NightlyOptions): Promise<BackupResult> {
	try {
		const r = await runBackup(opts);
		logLine({ event: 'backup', ok: true, bytes: r.bytes, blobs: r.blobs, ms: r.ms });
		return r;
	} catch (err) {
		// Error messages can contain paths; log only a code.
		const code = (err as NodeJS.ErrnoException).code;
		logLine({ event: 'backup', ok: false, reason: typeof code === 'string' ? code : 'error' });
		throw err;
	}
}

/** Next occurrence of HH:MM in server local time (TZ), strictly after `now`. Invalid input falls back to 04:00. */
export function nextRun(now: Date, time: string): Date {
	const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	let h = m ? Number(m[1]) : 4;
	let min = m ? Number(m[2]) : 0;
	if (h > 23 || min > 59) {
		h = 4;
		min = 0;
	}
	// Local wall-clock arithmetic on the calendar day, so a 23 h or 25 h day (DST change) still lands on HH:MM.
	const next = new Date(now);
	next.setHours(h, min, 0, 0);
	if (next.getTime() <= now.getTime()) {
		next.setDate(next.getDate() + 1);
		next.setHours(h, min, 0, 0);
	}
	return next;
}

export interface BackupSettings {
	enabled: boolean;
	time: string;
	keep: number;
	backupDir: string;
}

/** BACKUP_TIME=off disables the schedule; an invalid time falls back to 04:00. */
export function backupSettings(env: Record<string, string | undefined> = process.env): BackupSettings {
	const raw = (env.BACKUP_TIME ?? '').trim();
	const enabled = raw.toLowerCase() !== 'off';
	const valid = /^([01]?\d|2[0-3]):[0-5]\d$/.test(raw);
	if (enabled && raw && !valid) logLine({ event: 'backup_time_invalid', fallback: DEFAULT_TIME });
	return {
		enabled,
		time: valid ? raw : DEFAULT_TIME,
		keep: resolveKeep(env.BACKUP_KEEP),
		backupDir: resolveBackupDir(env)
	};
}

/**
 * Calls `run` daily at `time` (local). Each run re-computes the next time from the wall clock, so DST changes and a
 * late timer (sleeping host) cost at most one run, never a replay loop. A timer that fires early re-arms instead of running.
 */
export function startSchedule(time: string, run: () => Promise<unknown>): () => void {
	let timer: NodeJS.Timeout | undefined;
	let stopped = false;
	const arm = () => {
		if (stopped) return;
		const at = nextRun(new Date(), time);
		timer = setTimeout(fire(at), at.getTime() - Date.now());
		timer.unref();
	};
	const fire = (at: Date) => async () => {
		if (Date.now() < at.getTime()) return arm();
		try {
			await run();
		} catch {
			// already logged by the runner
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

/** Starts the nightly job unless BACKUP_TIME=off. Never throws into the process. */
export function scheduleNightlyBackup(
	getHandle: () => { sqlite: Database.Database; dataDir: string }
): (() => void) | undefined {
	const s = backupSettings();
	if (!s.enabled) {
		logLine({ event: 'backup_schedule', enabled: false });
		return undefined;
	}
	logLine({ event: 'backup_schedule', enabled: true, time: s.time, keep: s.keep });
	return startSchedule(s.time, () => {
		const { sqlite, dataDir } = getHandle();
		return writeNightlyBackup({ sqlite, dataDir, backupDir: s.backupDir, keep: s.keep });
	});
}
