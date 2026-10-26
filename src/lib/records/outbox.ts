/**
 * The outbox (ARCHITECTURE §5.1): changes made on this device that the server has not accepted yet.
 *
 * A row holds only what `seal()` produced (wrapped key and ciphertext as base64) or a delete marker. Nothing here is
 * plaintext. This file is pure logic (no IndexedDB, no store), so the rules can be tested on their own:
 * how rows are laid over the cached records, how a row is delivered, and in which order a flush goes.
 */
import { ApiError } from '$lib/api';
import { fromB64 } from '$lib/crypto/encoding';
import type { CachedRecord, StoredRecord } from './codec';
import type { Payload } from './types';

export type OutboxRow = {
	id: string;
	op: 'put' | 'delete';
	wrappedKey?: string;
	ciphertext?: string;
	/** The revision the change was based on when it was made; the flush uses a newer known one when there is. */
	baseRev?: number;
	/** When the change was made. Also the version stamp of the row: a newer change to the same id has a larger one. */
	queuedAt: number;
	/** Network failures so far; a row with attempts > 0 was really waiting, so finishing it deserves "All synced". */
	attempts: number;
	/** The server answered with a refusal. The row stays on the device and is shown on the Sync card. */
	refused?: boolean;
};

export type Pending = 'waiting' | 'refused';

export type SendResult = { rev: number; updatedAt: number };

export function pendingOf(rows: OutboxRow[]): Record<string, Pending> {
	const out: Record<string, Pending> = {};
	for (const row of rows) out[row.id] = row.refused ? 'refused' : 'waiting';
	return out;
}

/** The row as a cached record, so it can be opened like one. */
export function rowToCached(row: OutboxRow, rev: number): CachedRecord {
	return {
		id: row.id,
		wrappedKey: row.wrappedKey ? fromB64(row.wrappedKey) : null,
		ciphertext: row.ciphertext ? fromB64(row.ciphertext) : null,
		rev,
		updatedAt: row.queuedAt,
		deletedAt: row.op === 'delete' ? row.queuedAt : null
	};
}

/**
 * Lays the waiting changes over the records in memory: a waiting put shows its own version, a waiting delete hides the
 * record. `openRow` decrypts a put row (null when it cannot be opened: the row is kept, it just shows nothing).
 */
export function applyOutbox(
	items: Record<string, StoredRecord>,
	rows: OutboxRow[],
	openRow: (row: OutboxRow) => Payload | null,
	revOf: (id: string) => number
): void {
	for (const row of [...rows].sort((a, b) => a.queuedAt - b.queuedAt)) {
		if (row.op === 'delete') {
			delete items[row.id];
			continue;
		}
		const payload = openRow(row);
		if (payload) items[row.id] = { id: row.id, rev: revOf(row.id), updatedAt: row.queuedAt, payload };
	}
}

export type FailKind = 'network' | 'auth' | 'conflict' | 'missing' | 'transient' | 'refused';

/** What an error from the records API means for a waiting row. */
export function classify(err: unknown): FailKind {
	if (!(err instanceof ApiError)) return 'transient';
	if (err.status === 0) return 'network';
	if (err.status === 401) return 'auth';
	if (err.status === 409) return 'conflict';
	if (err.status === 404) return 'missing';
	if (err.status >= 500 || err.status === 429 || err.status === 408) return 'transient';
	return 'refused';
}

export type Outcome =
	| { kind: 'sent'; res: SendResult }
	| { kind: 'refused' }
	| { kind: 'stop'; why: 'network' | 'auth' | 'transient' };

/**
 * Sends one row. A conflict on a put is retried once without `baseRev` (last change wins); a delete of an id the
 * server never had counts as done; other refusals mark the row refused; trouble that may pass stops the flush.
 */
export async function deliver(
	row: OutboxRow,
	baseRev: number | undefined,
	send: (row: OutboxRow, baseRev: number | undefined) => Promise<SendResult>
): Promise<Outcome> {
	let rev = baseRev;
	for (let attempt = 0; ; attempt++) {
		try {
			return { kind: 'sent', res: await send(row, rev) };
		} catch (err) {
			const kind = classify(err);
			if (kind === 'conflict' && row.op === 'put' && attempt === 0) {
				rev = undefined;
				continue;
			}
			if (kind === 'missing' && row.op === 'delete') {
				return { kind: 'sent', res: { rev: baseRev ?? 0, updatedAt: Date.now() } };
			}
			if (kind === 'network' || kind === 'auth' || kind === 'transient') return { kind: 'stop', why: kind };
			return { kind: 'refused' };
		}
	}
}

export type FlushHooks = {
	send: (row: OutboxRow, baseRev: number | undefined) => Promise<SendResult>;
	baseRevOf: (row: OutboxRow) => number | undefined;
	sent: (row: OutboxRow, res: SendResult) => Promise<void>;
	refused: (row: OutboxRow) => Promise<void>;
	/** A network or server problem: the row stays and is counted as an attempt. */
	failed: (row: OutboxRow) => Promise<void>;
};

/** Sends the rows oldest first, skipping refused ones, and stops at the first network or server problem. */
export async function flushRows(
	rows: OutboxRow[],
	hooks: FlushHooks
): Promise<{ sent: OutboxRow[]; stopped: boolean }> {
	const sent: OutboxRow[] = [];
	const queue = rows.filter((r) => !r.refused).sort((a, b) => a.queuedAt - b.queuedAt);
	for (const row of queue) {
		const outcome = await deliver(row, hooks.baseRevOf(row), hooks.send);
		if (outcome.kind === 'sent') {
			await hooks.sent(row, outcome.res);
			sent.push(row);
		} else if (outcome.kind === 'refused') {
			await hooks.refused(row);
		} else {
			if (outcome.why !== 'auth') await hooks.failed(row);
			return { sent, stopped: true };
		}
	}
	return { sent, stopped: false };
}

/** Give a request this long before it counts as a network failure (a hung connection must not block the flush). */
export const SEND_TIMEOUT_MS = 30_000;

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new ApiError(0, 'network')), ms);
		work.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			}
		);
	});
}
