/**
 * Encrypted records: pure helpers (cursor, validators) and the owner-scoped database operations behind
 * /api/records (ARCHITECTURE §5, §5.1). The server never looks inside a record: it checks sizes and the
 * envelope version byte, and stores opaque blobs.
 */
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import { db, writeTx } from './db';
import { records, users } from './db/schema';
import { WRAPPED_LEN } from './auth/validate';

export const RECORD_VERSION = 1;
const NONCE = 24;
const TAG = 16;
/** Padded plaintext of a record: 256 B (smallest bucket) up to 64 KiB. */
export const MIN_PLAIN = 256;
export const MAX_PLAIN = 64 * 1024;
export const MIN_CIPHERTEXT = 1 + NONCE + MIN_PLAIN + TAG;
export const MAX_CIPHERTEXT = 1 + NONCE + MAX_PLAIN + TAG;
export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 1000;

export type Cursor = { updatedAt: number; id: string };

/** Opaque to the client: base64url of `<updatedAt>.<id>`. */
export function encodeCursor(c: Cursor): string {
	return Buffer.from(`${c.updatedAt}.${c.id}`, 'utf8').toString('base64url');
}

const CURSOR_RE = /^(\d{1,16})\.([0-9a-f-]{36})$/;

export function decodeCursor(v: unknown): Cursor | null {
	if (typeof v !== 'string' || v.length === 0 || v.length > 120 || !/^[A-Za-z0-9_-]+$/.test(v)) return null;
	const m = CURSOR_RE.exec(Buffer.from(v, 'base64url').toString('utf8'));
	return m ? { updatedAt: Number(m[1]), id: m[2]! } : null;
}

/** Parses `limit`: absent means the default, otherwise an integer from 1 to MAX_LIMIT. */
export function parseLimit(v: string | null): number | null {
	if (v === null) return DEFAULT_LIMIT;
	if (!/^\d{1,5}$/.test(v)) return null;
	const n = Number(v);
	return n >= 1 && n <= MAX_LIMIT ? n : null;
}

const B64URL_RE = /^[A-Za-z0-9_-]*$/;

/** URL-safe base64 without padding, decoding to between `min` and `max` bytes (canonical spelling only). */
export function b64Range(v: unknown, min: number, max: number): Buffer | null {
	if (typeof v !== 'string' || v.length > Math.ceil((max * 4) / 3) + 4 || !B64URL_RE.test(v)) return null;
	const buf = Buffer.from(v, 'base64url');
	if (buf.length < min || buf.length > max) return null;
	return buf.toString('base64url') === v ? buf : null;
}

export function parseWrappedKey(v: unknown): Buffer | null {
	return b64Range(v, WRAPPED_LEN, WRAPPED_LEN);
}

/** Envelope v1: version byte 0x01, then the sizes allowed above. */
export function parseCiphertext(v: unknown): Buffer | null {
	const buf = b64Range(v, MIN_CIPHERTEXT, MAX_CIPHERTEXT);
	return buf && buf[0] === RECORD_VERSION ? buf : null;
}

/** undefined: not given; null: invalid; otherwise the revision the client based its change on. */
export function parseBaseRev(v: unknown): number | null | undefined {
	if (v === undefined || v === null) return undefined;
	return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2 ** 31 ? v : null;
}

export type WireRecord = {
	id: string;
	wrappedKey: string | null;
	ciphertext: string | null;
	rev: number;
	updatedAt: number;
	deletedAt: number | null;
};

type Row = typeof records.$inferSelect;

function toWire(r: Row): WireRecord {
	return {
		id: r.id,
		wrappedKey: r.wrappedKey ? r.wrappedKey.toString('base64url') : null,
		ciphertext: r.ciphertext ? r.ciphertext.toString('base64url') : null,
		rev: r.rev,
		updatedAt: r.updatedAt,
		deletedAt: r.deletedAt
	};
}

export function listRecords(userId: string, since: Cursor | null, limit: number) {
	const where = since
		? and(
				eq(records.userId, userId),
				or(
					gt(records.updatedAt, since.updatedAt),
					and(eq(records.updatedAt, since.updatedAt), gt(records.id, since.id))
				)
			)
		: eq(records.userId, userId);
	const rows = db()
		.select()
		.from(records)
		.where(where)
		.orderBy(asc(records.updatedAt), asc(records.id))
		.limit(limit + 1)
		.all();
	const page = rows.slice(0, limit);
	const last = page[page.length - 1];
	return {
		records: page.map(toWire),
		cursor: last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null,
		hasMore: rows.length > limit
	};
}

export type PutResult =
	| { ok: true; id: string; rev: number; updatedAt: number }
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'conflict'; rev: number };

/** Strictly increasing per user, even within one millisecond, so a cursor never skips a change. */
function nextStamp(userId: string, now: number): number {
	const last = db()
		.select({ m: sql<number | null>`max(${records.updatedAt})` })
		.from(records)
		.where(eq(records.userId, userId))
		.get();
	return Math.max(now, (last?.m ?? 0) + 1);
}

function adjustStorage(userId: string, delta: number): void {
	if (delta === 0) return;
	db()
		.update(users)
		.set({ storageBytes: sql`max(0, ${users.storageBytes} + ${delta})` })
		.where(eq(users.id, userId))
		.run();
}

/** Looks the id up for this user. `foreign` means it exists for someone else (reported as not found, never revealed). */
function lookup(userId: string, id: string): { row?: Row; foreign: boolean } {
	const row = db().select().from(records).where(eq(records.id, id)).get();
	if (!row) return { foreign: false };
	return row.userId === userId ? { row, foreign: false } : { foreign: true };
}

export function putRecord(
	userId: string,
	id: string,
	wrappedKey: Buffer,
	ciphertext: Buffer,
	baseRev: number | undefined,
	now = Date.now()
): PutResult {
	return writeTx((): PutResult => {
		const { row, foreign } = lookup(userId, id);
		if (foreign) return { ok: false, reason: 'not_found' };
		if (baseRev !== undefined && baseRev !== (row?.rev ?? 0)) {
			return { ok: false, reason: 'conflict', rev: row?.rev ?? 0 };
		}
		const stamp = nextStamp(userId, now);
		const size = wrappedKey.length + ciphertext.length;
		if (row) {
			db()
				.update(records)
				.set({ wrappedKey, ciphertext, size, updatedAt: stamp, rev: row.rev + 1, deletedAt: null })
				.where(eq(records.id, id))
				.run();
			adjustStorage(userId, size - (row.deletedAt === null ? row.size : 0));
			return { ok: true, id, rev: row.rev + 1, updatedAt: stamp };
		}
		db()
			.insert(records)
			.values({ id, userId, wrappedKey, ciphertext, size, createdAt: stamp, updatedAt: stamp, rev: 1 })
			.run();
		adjustStorage(userId, size);
		return { ok: true, id, rev: 1, updatedAt: stamp };
	});
}

export function deleteRecord(userId: string, id: string, now = Date.now()): PutResult {
	return writeTx((): PutResult => {
		const { row } = lookup(userId, id);
		if (!row) return { ok: false, reason: 'not_found' };
		if (row.deletedAt !== null) return { ok: true, id, rev: row.rev, updatedAt: row.updatedAt };
		const stamp = nextStamp(userId, now);
		db()
			.update(records)
			.set({
				wrappedKey: null,
				ciphertext: null,
				size: 0,
				deletedAt: stamp,
				updatedAt: stamp,
				rev: row.rev + 1
			})
			.where(eq(records.id, id))
			.run();
		adjustStorage(userId, -row.size);
		return { ok: true, id, rev: row.rev + 1, updatedAt: stamp };
	});
}
