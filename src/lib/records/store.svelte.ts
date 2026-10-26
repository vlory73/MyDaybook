/**
 * The decrypted record store (ARCHITECTURE §5.1).
 *
 * - `store.items` holds decrypted records in memory only, reactive for the UI. Lock and sign-out empty it.
 * - IndexedDB (see cache.ts) holds ciphertext and the sync cursor, so a reload downloads only changes.
 * - Every write is encrypted on this device first, put in the outbox (IndexedDB, ciphertext only) and shown at once,
 *   then sent with the revision it was based on. Without a connection it simply waits there (`store.pending`) and goes
 *   out when the connection is back. A conflict is retried once on top of the server's revision (last writer wins,
 *   which suits one person on a few devices). The rules live in outbox.ts.
 * - Records that cannot be decrypted or validated are skipped and counted (`store.skipped`), never fatal.
 */
import { ApiError, apiDelete, apiGet, apiPut } from '$lib/api';
import { showToast } from '$lib/components/toast.svelte';
import { onReconnect } from '$lib/connection.svelte';
import { initCrypto } from '$lib/crypto/sodium';
import { t } from '$lib/i18n/index.svelte';
import { getKeys, onLock, onSignOut, session } from '$lib/session.svelte';
import {
	clearRecordsKeepOutbox,
	deleteCache,
	putOutboxRow,
	readCache,
	readOutbox,
	settleOutboxRow,
	writeCache
} from './cache';
import {
	open,
	recordsForDay,
	daysWithEntries,
	seal,
	wireToCached,
	type CachedRecord,
	type StoredRecord,
	type Wire
} from './codec';
import {
	SEND_TIMEOUT_MS,
	applyOutbox,
	deliver,
	flushRows,
	pendingOf,
	rowToCached,
	withTimeout,
	type OutboxRow,
	type Pending,
	type SendResult
} from './outbox';
import { flushPendingAttachmentDeletes, scheduleAttachmentDelete } from '$lib/photos/pending';
import type { Payload } from './types';

export type { StoredRecord } from './codec';

export const store = $state<{
	items: Record<string, StoredRecord>;
	/** `idle` until the first load after unlock has finished. */
	status: 'idle' | 'loading' | 'ready';
	syncing: boolean;
	/** The last sync could not reach the server. */
	syncFailed: boolean;
	/** Records that could not be decrypted or understood, since unlock. */
	skipped: number;
	/** Changes made on this device that the server has not accepted yet, by record id (deletes included). */
	pending: Record<string, Pending>;
	/** The outbox is being sent right now. */
	flushing: boolean;
	/** When the last sync or send went through (a time stamp only, kept in localStorage per user). */
	lastSyncedAt: number | null;
}>({
	items: {},
	status: 'idle',
	syncing: false,
	syncFailed: false,
	skipped: 0,
	pending: {},
	flushing: false,
	lastSyncedAt: null
});

const PAGE = 500;
/** Last known revision per id, tombstones included, used as `baseRev`. Not reactive. */
let revs: Record<string, number> = {};
let cursor: string | null = null;
let generation = 0;
let inflight: Promise<void> | null = null;
let lastSyncAt = 0;
let lastStamp = 0;

function userId(): string {
	const id = session.identity?.userId;
	if (!id) throw new Error('no session');
	return id;
}

function reset(): void {
	generation++;
	store.items = {};
	store.status = 'idle';
	store.syncing = false;
	store.syncFailed = false;
	store.skipped = 0;
	store.pending = {};
	store.flushing = false;
	store.lastSyncedAt = null;
	revs = {};
	cursor = null;
	inflight = null;
	lastSyncAt = 0;
}

onLock(reset);
onSignOut((id, reason) => {
	reset();
	if (!id) return;
	if (reason === 'ended') {
		// A session that ended on its own keeps the outbox, so the changes go out when the same person signs in again.
		void clearRecordsKeepOutbox(id);
	} else {
		void deleteCache(id);
		forgetLastSynced(id);
	}
});

const syncedKey = (uid: string) => `mdb.lastSynced.${uid}`;
function readLastSynced(uid: string): number | null {
	try {
		const n = Number(localStorage.getItem(syncedKey(uid)));
		return Number.isFinite(n) && n > 0 ? n : null;
	} catch {
		return null;
	}
}
function forgetLastSynced(uid: string): void {
	try {
		localStorage.removeItem(syncedKey(uid));
	} catch {
		// Nothing stored.
	}
}
function touchSynced(uid: string): void {
	const now = Date.now();
	store.lastSyncedAt = now;
	try {
		localStorage.setItem(syncedKey(uid), String(now));
	} catch {
		// Only a time stamp; not remembering it is fine.
	}
}

/** Applies cached or downloaded records to memory; records that fail to open are skipped and counted. */
function apply(records: CachedRecord[]): void {
	const kek = getKeys().kek;
	const uid = userId();
	for (const rec of records) {
		revs[rec.id] = rec.rev;
		// A change of this device is waiting to be sent: its version stays on screen; only the revision is remembered.
		if (store.pending[rec.id]) continue;
		const res = open(kek, uid, rec);
		if (res.ok) {
			store.items[rec.id] = { id: rec.id, rev: rec.rev, updatedAt: rec.updatedAt, payload: res.payload };
		} else {
			delete store.items[rec.id];
			if (res.reason !== 'tombstone') store.skipped++;
		}
	}
}

/** Shows the waiting changes on top of what the cache holds (decrypting put rows like cached records). */
function overlay(rows: OutboxRow[]): void {
	const kek = getKeys().kek;
	const uid = userId();
	applyOutbox(
		store.items,
		rows,
		(row) => {
			const res = open(kek, uid, rowToCached(row, revs[row.id] ?? 0));
			return res.ok ? res.payload : null;
		},
		(id) => revs[id] ?? 0
	);
}

/** Re-reads which changes are still waiting (a finished send or another tab may have changed that). */
async function refreshPending(gen: number, uid: string): Promise<void> {
	const rows = await readOutbox(uid);
	if (gen === generation) store.pending = pendingOf(rows);
}

/** First thing after unlock: show what the cache holds, then send what is waiting and fetch changes. */
export async function startRecords(): Promise<void> {
	if (session.status !== 'unlocked' || store.status !== 'idle') return;
	const gen = generation;
	store.status = 'loading';
	await initCrypto();
	const uid = userId();
	const [cached, rows] = await Promise.all([readCache(uid), readOutbox(uid)]);
	if (gen !== generation) return;
	cursor = cached.cursor;
	store.pending = pendingOf(rows);
	store.lastSyncedAt = readLastSynced(uid);
	apply(cached.records);
	overlay(rows);
	store.status = 'ready';
	void flushPendingAttachmentDeletes(uid);
	void flushOutbox();
	await sync();
}

/** Downloads changes since the cursor until there are no more. Concurrent calls share one run. */
export function sync(): Promise<void> {
	if (inflight) return inflight;
	if (session.status !== 'unlocked') return Promise.resolve();
	const gen = generation;
	store.syncing = true;
	const run = (async () => {
		try {
			let more = true;
			while (more) {
				const query = `limit=${PAGE}${cursor ? `&since=${cursor}` : ''}`;
				const page = await apiGet<{ records: Wire[]; cursor: string | null; hasMore: boolean }>(
					`/api/records?${query}`
				);
				if (gen !== generation) return;
				const cached = page.records.map(wireToCached);
				apply(cached);
				if (page.cursor) cursor = page.cursor;
				await writeCache(userId(), cached, page.cursor ?? undefined);
				more = page.hasMore;
			}
			store.syncFailed = false;
			lastSyncAt = Date.now();
			if (Object.keys(store.pending).length === 0) touchSynced(userId());
		} catch {
			if (gen === generation) store.syncFailed = true;
		} finally {
			if (gen === generation) {
				store.syncing = false;
				inflight = null;
			}
		}
	})();
	inflight = run;
	return run;
}

/** Sync if the last successful one is older than `maxAgeMs` (for visibility changes). Also sends what is waiting. */
export function syncIfStale(maxAgeMs = 15_000): void {
	if (session.status === 'unlocked' && store.status === 'ready') {
		void flushOutbox();
		if (Date.now() - lastSyncAt > maxAgeMs) void sync();
	}
}

type PutResponse = { id: string; rev: number; updatedAt: number };

/** One request for one row. */
function sendRow(row: OutboxRow, baseRev: number | undefined): Promise<SendResult> {
	const work =
		row.op === 'put'
			? apiPut<PutResponse>(`/api/records/${row.id}`, {
					wrappedKey: row.wrappedKey,
					ciphertext: row.ciphertext,
					baseRev
				})
			: apiDelete<PutResponse>(`/api/records/${row.id}`);
	return withTimeout(work, SEND_TIMEOUT_MS);
}

const stamp = (): number => (lastStamp = Math.max(Date.now(), lastStamp + 1));

/** What the cache should hold once the server has accepted a row. */
function cachedAfter(row: OutboxRow, res: SendResult): CachedRecord {
	if (row.op === 'put') return { ...rowToCached(row, res.rev), updatedAt: res.updatedAt };
	return {
		id: row.id,
		wrappedKey: null,
		ciphertext: null,
		rev: res.rev,
		updatedAt: res.updatedAt,
		deletedAt: res.updatedAt
	};
}

let flushing: Promise<void> | null = null;
let flushAgain = false;

/**
 * Sends the waiting changes, oldest first, stopping at the first network problem. One run at a time in this tab (a
 * request during a run asks for one more pass), and one tab at a time where Web Locks exist. Needs no keys: the rows
 * are already sealed, so it also works while the diary is locked. `retryRefused` gives refused changes another go.
 */
export function flushOutbox(opts: { retryRefused?: boolean } = {}): Promise<void> {
	const uid = session.identity?.userId;
	if (!uid || (session.status !== 'unlocked' && session.status !== 'locked')) return Promise.resolve();
	if (flushing) {
		flushAgain = true;
		return flushing;
	}
	const gen = generation;
	const run = (async () => {
		store.flushing = true;
		try {
			if (opts.retryRefused) {
				for (const row of await readOutbox(uid)) {
					if (row.refused) await settleOutboxRow(uid, row.id, row.queuedAt, { refused: false });
				}
				await refreshPending(gen, uid);
			}
			const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
			let stopped = false;
			do {
				flushAgain = false;
				stopped = locks
					? await locks.request('mydaybook-outbox', { ifAvailable: true }, async (lock) =>
							lock ? flushPass(uid, gen) : true
						)
					: await flushPass(uid, gen);
			} while (flushAgain && !stopped);
		} finally {
			flushAgain = false;
			flushing = null;
			if (gen === generation) store.flushing = false;
		}
	})();
	flushing = run;
	return run;
}

/** One pass over the outbox. Returns true when it stopped early (network or server trouble). */
async function flushPass(uid: string, gen: number): Promise<boolean> {
	const rows = await readOutbox(uid);
	if (rows.length === 0) return false;
	const { sent, stopped } = await flushRows(rows, {
		send: sendRow,
		baseRevOf: (row) => (gen === generation ? (revs[row.id] ?? row.baseRev) : row.baseRev),
		sent: async (row, res) => {
			await writeCache(uid, [cachedAfter(row, res)]);
			await settleOutboxRow(uid, row.id, row.queuedAt);
			if (gen === generation) {
				revs[row.id] = res.rev;
				const item = store.items[row.id];
				if (item && row.op === 'put') item.rev = res.rev;
			}
		},
		refused: async (row) => {
			await settleOutboxRow(uid, row.id, row.queuedAt, { refused: true });
		},
		failed: async (row) => {
			await settleOutboxRow(uid, row.id, row.queuedAt, { attempts: row.attempts + 1 });
		}
	});
	await refreshPending(gen, uid);
	if (sent.length > 0) touchSynced(uid);
	const allDone = !stopped && gen === generation && Object.keys(store.pending).length === 0;
	if (allDone && sent.some((r) => r.attempts > 0)) {
		// Everything that was waiting is on the server now: say so once, and fetch what changed elsewhere.
		showToast(t('outbox.toast.synced'));
		void sync();
	}
	return stopped;
}

// The connection came back (also while the diary is locked): send what is waiting.
onReconnect(() => void flushOutbox());

/** How long a save waits for the server before it lets the person carry on (the change then goes out later). */
const SETTLE_MS = 5000;
const settled = (): Promise<unknown> =>
	Promise.race([flushOutbox(), new Promise((resolve) => setTimeout(resolve, SETTLE_MS))]);

/** Without an outbox (no IndexedDB): send now and throw when it did not work, as before offline support. */
async function sendNow(row: OutboxRow): Promise<SendResult> {
	const outcome = await deliver(row, revs[row.id], sendRow);
	if (outcome.kind === 'sent') return outcome.res;
	throw outcome.kind === 'stop' ? new ApiError(0, 'network') : new ApiError(400, 'bad_request');
}

/** How many changes of the signed-in person are waiting on this device (read from the outbox, so it also works before the diary is loaded). */
export async function outboxCount(): Promise<number> {
	const uid = session.identity?.userId;
	return uid ? (await readOutbox(uid)).length : 0;
}

/** Whether a change to this record is still waiting to be sent (or was refused). Reactive. */
export const syncState = (id: string): 'synced' | Pending => store.pending[id] ?? 'synced';

/**
 * Creates or replaces a record. It is shown at once and kept on the device until the server has it; without a
 * connection it waits (see `syncState(id)`). Throws only when the change could not be kept at all.
 */
export async function save(payload: Payload, id: string = crypto.randomUUID()): Promise<string> {
	const gen = generation;
	const uid = userId();
	const sealed = seal(getKeys().kek, uid, id, payload);
	const row: OutboxRow = { id, op: 'put', ...sealed, baseRev: revs[id], queuedAt: stamp(), attempts: 0 };
	if (await putOutboxRow(uid, row)) {
		if (gen === generation) {
			store.items[id] = { id, rev: revs[id] ?? 0, updatedAt: row.queuedAt, payload };
			store.pending[id] = 'waiting';
		}
		await settled();
		return id;
	}
	const res = await sendNow(row);
	if (gen === generation) {
		revs[id] = res.rev;
		store.items[id] = { id, rev: res.rev, updatedAt: res.updatedAt, payload };
	}
	await writeCache(uid, [cachedAfter(row, res)]);
	return id;
}

/**
 * Deletes a record. Returns `undo()`, which puts the same payload back under the same id.
 * The record's photos are deleted on the server only after a grace period longer than the Undo toast
 * (see photos/pending.ts); Undo keeps them.
 */
export async function remove(id: string): Promise<() => Promise<void>> {
	const previous = store.items[id];
	const gen = generation;
	const uid = userId();
	const row: OutboxRow = { id, op: 'delete', baseRev: revs[id], queuedAt: stamp(), attempts: 0 };
	if (await putOutboxRow(uid, row)) {
		if (gen === generation) {
			delete store.items[id];
			store.pending[id] = 'waiting';
		}
		await settled();
	} else {
		const res = await sendNow(row);
		if (gen === generation) {
			revs[id] = res.rev;
			delete store.items[id];
		}
		await writeCache(uid, [cachedAfter(row, res)]);
	}
	const photos = previous?.payload.attachments;
	const pending = photos?.length ? scheduleAttachmentDelete(uid, photos) : null;
	return async () => {
		if (!previous) return;
		await save(previous.payload, id);
		pending?.cancel();
	};
}

// ---- Selectors (reactive when called inside effects or deriveds) ----

export const allRecords = (): StoredRecord[] => Object.values(store.items);
export const recordsOnDay = (day: string) => recordsForDay(allRecords(), day);
export const daysInRange = (from: string, to: string) => daysWithEntries(allRecords(), from, to);
