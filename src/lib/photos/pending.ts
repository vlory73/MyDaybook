/**
 * Deferred attachment deletion (so that Undo of a record delete still works).
 *
 * Deleting a record does not delete its photos at once: the blobs are queued for deletion after a grace period that is
 * longer than the Undo toast. Undo cancels the queue entry. The queue holds only attachment ids (random UUIDs the
 * server already knows, no keys) and survives a reload in localStorage; anything left over is deleted on the next
 * unlock. If storage is unavailable the timer still works for the current page.
 */
import { attachmentIds, deleteAttachment } from './client';
import type { AttachmentRef } from '$lib/records/types';

export const UNDO_GRACE_MS = 10_000;

type Entry = { token: string; ids: string[] };

const key = (userId: string) => `mdb.pendingAttachmentDeletes.${userId}`;

function read(userId: string): Entry[] {
	try {
		const raw = localStorage.getItem(key(userId));
		const list: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(list)
			? list.filter(
					(e): e is Entry =>
						typeof e?.token === 'string' &&
						Array.isArray(e.ids) &&
						e.ids.every((i: unknown) => typeof i === 'string')
				)
			: [];
	} catch {
		return [];
	}
}

function write(userId: string, list: Entry[]): void {
	try {
		if (list.length === 0) localStorage.removeItem(key(userId));
		else localStorage.setItem(key(userId), JSON.stringify(list));
	} catch {
		// Storage unavailable: the in-page timer is all we have.
	}
}

async function run(userId: string, token: string, ids: string[]): Promise<void> {
	const results = await Promise.all(ids.map(deleteAttachment));
	const left = ids.filter((_, i) => !results[i]);
	write(
		userId,
		read(userId).flatMap((e) => (e.token !== token ? [e] : left.length > 0 ? [{ ...e, ids: left }] : []))
	);
}

/** Queues the photos of a deleted record. `cancel()` (Undo) keeps them. */
export function scheduleAttachmentDelete(
	userId: string,
	refs: AttachmentRef[],
	graceMs = UNDO_GRACE_MS
): { cancel: () => void } {
	const token = crypto.randomUUID();
	const ids = attachmentIds(refs);
	write(userId, [...read(userId), { token, ids }]);
	const timer = setTimeout(() => void run(userId, token, ids), graceMs);
	return {
		cancel() {
			clearTimeout(timer);
			write(
				userId,
				read(userId).filter((e) => e.token !== token)
			);
		}
	};
}

/** After unlock: deletes whatever an earlier page left in the queue. */
export async function flushPendingAttachmentDeletes(userId: string): Promise<void> {
	for (const e of read(userId)) await run(userId, e.token, e.ids);
}
