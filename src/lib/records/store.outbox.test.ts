import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedRecord } from './codec';
import type { OutboxRow } from './outbox';

// Synthetic data only. The store with the IndexedDB cache and the server API replaced by in-memory fakes.
const fake = vi.hoisted(() => ({
	records: new Map<string, unknown>(),
	outbox: new Map<string, OutboxRow>(),
	cursor: null as string | null,
	kek: new Uint8Array(32),
	signOutHooks: [] as ((id: string | null, reason: string) => void)[],
	lockHooks: [] as (() => void)[],
	api: { put: vi.fn(), del: vi.fn(), get: vi.fn() },
	cacheCalls: { deleted: [] as string[], keptOutbox: [] as string[] }
}));

vi.mock('$lib/session.svelte', () => ({
	session: { status: 'unlocked', identity: { userId: 'u1', username: 'sam', role: 'member' } },
	getKeys: () => ({ kek: fake.kek }),
	onLock: (hook: () => void) => void fake.lockHooks.push(hook),
	onSignOut: (hook: (id: string | null, reason: string) => void) => void fake.signOutHooks.push(hook)
}));
vi.mock('$lib/photos/pending', () => ({
	flushPendingAttachmentDeletes: async () => undefined,
	scheduleAttachmentDelete: () => ({ cancel: () => undefined })
}));
vi.mock('$lib/api', async () => {
	const actual = await vi.importActual<typeof import('$lib/api')>('$lib/api');
	return { ...actual, apiPut: fake.api.put, apiDelete: fake.api.del, apiGet: fake.api.get };
});
vi.mock('./cache', () => ({
	readCache: async () => ({ records: [...fake.records.values()] as CachedRecord[], cursor: fake.cursor }),
	writeCache: async (_u: string, recs: CachedRecord[], cursor?: string) => {
		for (const r of recs) fake.records.set(r.id, r);
		if (cursor !== undefined) fake.cursor = cursor;
	},
	readOutbox: async () => [...fake.outbox.values()].sort((a, b) => a.queuedAt - b.queuedAt),
	putOutboxRow: async (_u: string, row: OutboxRow) => {
		fake.outbox.set(row.id, row);
		return true;
	},
	settleOutboxRow: async (_u: string, id: string, queuedAt: number, update?: Partial<OutboxRow>) => {
		const current = fake.outbox.get(id);
		if (!current || current.queuedAt !== queuedAt) return;
		if (update) fake.outbox.set(id, { ...current, ...update });
		else fake.outbox.delete(id);
	},
	deleteCache: async (id: string) => {
		fake.cacheCalls.deleted.push(id);
		fake.records.clear();
		fake.outbox.clear();
	},
	clearRecordsKeepOutbox: async (id: string) => {
		fake.cacheCalls.keptOutbox.push(id);
		fake.records.clear();
	}
}));

import { ApiError } from '$lib/api';
import { initCrypto } from '$lib/crypto/sodium';
import { randomBytes } from '$lib/crypto/keys';
import { setOnline } from '$lib/connection.svelte';
import { flushOutbox, outboxCount, remove, save, startRecords, store, sync, syncState } from './store.svelte';
import type { NotePayload } from './types';

const note = (text: string): NotePayload => ({
	v: 1,
	type: 'note',
	at: '2026-10-26T08:00:00+01:00',
	text,
	tags: []
});
const textOf = (id: string) => (store.items[id]?.payload as NotePayload | undefined)?.text;
const network = () => Promise.reject(new ApiError(0, 'network'));
const okPut = (rev = 1) => Promise.resolve({ id: 'x', rev, updatedAt: 500 + rev });

beforeAll(async () => {
	await initCrypto();
	fake.kek = new Uint8Array(randomBytes(32));
});

beforeEach(async () => {
	fake.lockHooks.forEach((h) => h()); // resets the store
	fake.records.clear();
	fake.outbox.clear();
	fake.cursor = null;
	fake.cacheCalls.deleted.length = 0;
	fake.cacheCalls.keptOutbox.length = 0;
	fake.api.put.mockReset();
	fake.api.del.mockReset();
	fake.api.get.mockReset().mockResolvedValue({ records: [], cursor: null, hasMore: false });
	setOnline(true);
	await startRecords();
});

describe('saving without a connection', () => {
	it('keeps the change encrypted in the outbox, shows it at once and does not throw', async () => {
		fake.api.put.mockImplementation(network);
		const id = await save(note('offline synthetic note'));
		expect(textOf(id)).toBe('offline synthetic note');
		expect(syncState(id)).toBe('waiting');
		expect(await outboxCount()).toBe(1);
		const row = fake.outbox.get(id)!;
		expect(row.op).toBe('put');
		expect(row.attempts).toBe(1);
		// Only ciphertext and the wrapped key are stored, never the text.
		expect(JSON.stringify(row)).not.toContain('offline synthetic note');
		expect(fake.records.has(id)).toBe(false);
	});

	it('sends the change when the flush runs again, then clears the marker and fills the cache', async () => {
		fake.api.put.mockImplementationOnce(network);
		const id = await save(note('later'));
		fake.api.put.mockImplementation(() => okPut(7));
		await flushOutbox();
		expect(syncState(id)).toBe('synced');
		expect(fake.outbox.size).toBe(0);
		expect(store.items[id]?.rev).toBe(7);
		expect((fake.records.get(id) as CachedRecord).rev).toBe(7);
	});

	it('sends a new change to the same record instead of the old one (the newest wins)', async () => {
		fake.api.put.mockImplementation(network);
		const id = await save(note('first'));
		await save(note('second'), id);
		expect(fake.outbox.size).toBe(1);
		fake.api.put.mockImplementation(() => okPut());
		await flushOutbox();
		expect(fake.api.put).toHaveBeenCalledTimes(3); // two failed tries, one send
		expect(fake.outbox.size).toBe(0);
		expect(textOf(id)).toBe('second');
	});

	it('flushes the oldest change first and stops at the first network error', async () => {
		fake.api.put.mockImplementation(network);
		const a = await save(note('a'));
		const b = await save(note('b'));
		fake.api.put.mockReset();
		fake.api.put.mockImplementationOnce(() => okPut()).mockImplementation(network);
		await flushOutbox();
		expect(fake.api.put.mock.calls.map((c) => (c[0] as string).split('/').pop())).toEqual([a, b]);
		expect(syncState(a)).toBe('synced');
		expect(syncState(b)).toBe('waiting');
	});

	it('tells the person once everything has been sent', async () => {
		fake.api.put.mockImplementation(network);
		await save(note('x'));
		fake.api.put.mockImplementation(() => okPut());
		await flushOutbox();
		const { toasts } = await import('$lib/components/toast.svelte');
		expect(toasts.current?.message).toBe('All synced');
	});
});

describe('answers from the server', () => {
	it('retries a conflict once without the base revision', async () => {
		fake.api.put.mockImplementationOnce(() => okPut(2));
		const id = await save(note('v1'));
		fake.api.put.mockReset();
		fake.api.put.mockRejectedValueOnce(new ApiError(409, 'conflict')).mockImplementationOnce(() => okPut(5));
		await save(note('v2'), id);
		const bodies = fake.api.put.mock.calls.map((c) => c[1] as { baseRev?: number });
		expect(bodies[0]!.baseRev).toBe(2);
		expect(bodies[1]!.baseRev).toBeUndefined();
		expect(syncState(id)).toBe('synced');
	});

	it('marks a refused change, keeps it on the device and does not throw', async () => {
		fake.api.put.mockRejectedValue(new ApiError(413, 'too_large'));
		const id = await save(note('too much'));
		expect(syncState(id)).toBe('refused');
		expect(fake.outbox.get(id)?.refused).toBe(true);
		expect(textOf(id)).toBe('too much');
		// Another pass leaves it alone until the person asks again.
		fake.api.put.mockClear();
		await flushOutbox();
		expect(fake.api.put).not.toHaveBeenCalled();
		fake.api.put.mockImplementation(() => okPut());
		await flushOutbox({ retryRefused: true });
		expect(syncState(id)).toBe('synced');
	});

	it('counts a delete of an id the server never had as done', async () => {
		fake.api.put.mockImplementation(network);
		const id = await save(note('never uploaded'));
		fake.api.del.mockRejectedValue(new ApiError(404, 'not_found'));
		fake.api.put.mockImplementation(() => okPut());
		await remove(id);
		expect(textOf(id)).toBeUndefined();
		expect(syncState(id)).toBe('synced');
		expect(fake.outbox.size).toBe(0);
	});
});

describe('deleting without a connection', () => {
	it('hides the entry, queues the delete, and Undo puts it back', async () => {
		fake.api.put.mockImplementationOnce(() => okPut(1));
		const id = await save(note('keep me'));
		fake.api.del.mockImplementation(network);
		const undo = await remove(id);
		expect(textOf(id)).toBeUndefined();
		expect(syncState(id)).toBe('waiting');
		expect(fake.outbox.get(id)?.op).toBe('delete');
		fake.api.put.mockImplementation(network);
		await undo();
		expect(textOf(id)).toBe('keep me');
		expect(fake.outbox.get(id)?.op).toBe('put');
	});
});

describe('loading and syncing with changes waiting', () => {
	it('lays the outbox over the cache when the diary opens', async () => {
		fake.api.put.mockImplementation(network);
		const keep = await save(note('waiting entry'));
		const gone = await save(note('to delete'));
		fake.api.del.mockImplementation(network);
		await remove(gone);
		fake.lockHooks.forEach((h) => h()); // lock: memory is emptied, the outbox stays
		expect(store.items[keep]).toBeUndefined();
		await startRecords();
		expect(textOf(keep)).toBe('waiting entry');
		expect(textOf(gone)).toBeUndefined();
		expect(syncState(keep)).toBe('waiting');
		expect(syncState(gone)).toBe('waiting');
	});

	it('does not replace a waiting version with the downloaded one, but remembers its revision', async () => {
		fake.api.put.mockImplementation(network);
		const id = await save(note('my offline edit'));
		const downloaded = { ...fake.outbox.get(id)!, rev: 9, updatedAt: 9, deletedAt: null };
		fake.api.get.mockResolvedValue({
			records: [
				{
					id,
					wrappedKey: downloaded.wrappedKey,
					ciphertext: downloaded.ciphertext,
					rev: 9,
					updatedAt: 9,
					deletedAt: null
				}
			],
			cursor: 'c1',
			hasMore: false
		});
		await sync();
		expect(textOf(id)).toBe('my offline edit');
		expect(syncState(id)).toBe('waiting');
		// The send then uses the revision the server has.
		fake.api.put.mockReset().mockImplementation(() => okPut(10));
		await flushOutbox();
		expect((fake.api.put.mock.calls[0]![1] as { baseRev?: number }).baseRev).toBe(9);
	});
});

describe('when the session ends', () => {
	it('keeps the outbox when the session ended on its own', async () => {
		fake.api.put.mockImplementation(network);
		await save(note('still mine'));
		fake.signOutHooks.forEach((h) => h('u1', 'ended'));
		expect(fake.cacheCalls.keptOutbox).toEqual(['u1']);
		expect(fake.cacheCalls.deleted).toEqual([]);
		expect(fake.outbox.size).toBe(1);
		expect(store.items).toEqual({});
	});

	it('sends the kept outbox when the same person signs in again', async () => {
		fake.api.put.mockImplementation(network);
		const id = await save(note('sent after sign-in'));
		fake.signOutHooks.forEach((h) => h('u1', 'ended'));
		fake.api.put.mockReset().mockImplementation(() => okPut(3));
		await startRecords();
		await flushOutbox();
		expect(fake.api.put).toHaveBeenCalled();
		expect(fake.outbox.size).toBe(0);
		expect(syncState(id)).toBe('synced');
	});

	it.each(['signout', 'deleted'])('deletes the whole cache including the outbox on %s', async (reason) => {
		fake.api.put.mockImplementation(network);
		await save(note('lost on purpose'));
		fake.signOutHooks.forEach((h) => h('u1', reason));
		await Promise.resolve();
		expect(fake.cacheCalls.deleted).toEqual(['u1']);
		expect(fake.outbox.size).toBe(0);
	});
});
