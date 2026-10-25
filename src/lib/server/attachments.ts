/**
 * Encrypted attachments (ARCHITECTURE §5.2). The server keeps opaque blobs under `<DATA_DIR>/blobs/<userId>/<id>` and
 * one `attachments` row per blob (owner, size, created_at). Which record a blob belongs to exists only inside the
 * encrypted record, so the server cannot link them. Blobs are written atomically (temp file, then rename).
 */
import { and, eq } from 'drizzle-orm';
import {
	createReadStream,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { dataDir, db, writeTx } from './db';
import { attachments } from './db/schema';
import { adjustStorage } from './records';

/** Ciphertext limit per attachment (1.25 MiB): header + 19 chunks of 64 KiB fit; a typical photo needs 3. */
export const MAX_BLOB_BYTES = 1.25 * 1024 * 1024;

const blobDir = (userId: string) => join(dataDir(), 'blobs', userId);
export const blobPath = (userId: string, id: string) => join(blobDir(userId), id);

class ForeignBlob extends Error {}

export type PutBlobResult = { ok: true; size: number } | { ok: false; reason: 'not_found' };

/** Stores or replaces the owner's blob. An id that belongs to someone else is reported as not found. */
export function putBlob(userId: string, id: string, bytes: Buffer, now = Date.now()): PutBlobResult {
	const early = db().select().from(attachments).where(eq(attachments.id, id)).get();
	if (early && early.userId !== userId) return { ok: false, reason: 'not_found' };

	mkdirSync(blobDir(userId), { recursive: true, mode: 0o700 });
	const target = blobPath(userId, id);
	const tmp = `${target}.${process.pid}.tmp`;
	writeFileSync(tmp, bytes, { mode: 0o600 });
	renameSync(tmp, target);

	let existed = early !== undefined;
	try {
		writeTx(() => {
			const existing = db().select().from(attachments).where(eq(attachments.id, id)).get();
			existed = existing !== undefined;
			if (existing && existing.userId !== userId) throw new ForeignBlob();
			if (existing) {
				db().update(attachments).set({ size: bytes.length }).where(eq(attachments.id, id)).run();
				adjustStorage(userId, bytes.length - existing.size);
			} else {
				db().insert(attachments).values({ id, userId, size: bytes.length, createdAt: now }).run();
				adjustStorage(userId, bytes.length);
			}
		});
	} catch (err) {
		if (!existed || err instanceof ForeignBlob) rmSync(target, { force: true });
		if (err instanceof ForeignBlob) return { ok: false, reason: 'not_found' };
		throw err;
	}
	return { ok: true, size: bytes.length };
}

/** The owner's blob as a stream with its size, or null when it is missing or belongs to someone else. */
export function openBlob(userId: string, id: string) {
	const row = db()
		.select()
		.from(attachments)
		.where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
		.get();
	const path = blobPath(userId, id);
	if (!row || !existsSync(path)) return null;
	return { size: statSync(path).size, stream: createReadStream(path) };
}

/** Removes file, row and storage accounting. False when it is missing or belongs to someone else. */
export function deleteBlob(userId: string, id: string): boolean {
	return writeTx(() => {
		const row = db()
			.select()
			.from(attachments)
			.where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
			.get();
		if (!row) return false;
		db().delete(attachments).where(eq(attachments.id, id)).run();
		adjustStorage(userId, -row.size);
		rmSync(blobPath(userId, id), { force: true });
		return true;
	});
}
