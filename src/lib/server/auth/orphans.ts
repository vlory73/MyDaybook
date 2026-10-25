import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, sqliteHandle } from '../db';
import { logLine } from '../db/log';

/**
 * Removes `blobs/<user id>` folders whose user no longer exists. Erasure commits the database change first and then
 * deletes the folder, so a crash in between leaves an orphan; this finishes the job at startup and in the hourly
 * housekeeping. Returns how many folders were removed. `exists` is injectable for tests.
 */
export function removeOrphanBlobs(
	dir: string = dataDir(),
	exists: (userId: string) => boolean = (id) =>
		sqliteHandle().prepare('SELECT 1 FROM users WHERE id = ?').get(id) !== undefined
): number {
	const root = join(dir, 'blobs');
	if (!existsSync(root)) return 0;
	let removed = 0;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory() || exists(entry.name)) continue;
		rmSync(join(root, entry.name), { recursive: true, force: true });
		removed++;
	}
	if (removed > 0) logLine({ event: 'orphan_blobs_removed', folders: removed });
	return removed;
}
