import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '$lib/api';
import type { StoredRecord } from './codec';
import {
	applyOutbox,
	classify,
	deliver,
	flushRows,
	pendingOf,
	withTimeout,
	type FlushHooks,
	type OutboxRow,
	type SendResult
} from './outbox';
import type { NotePayload } from './types';

// Synthetic data only.
const note = (text: string): NotePayload => ({
	v: 1,
	type: 'note',
	at: '2026-10-26T08:00:00+01:00',
	text,
	tags: []
});
const row = (id: string, queuedAt: number, extra: Partial<OutboxRow> = {}): OutboxRow => ({
	id,
	op: 'put',
	wrappedKey: 'a2V5',
	ciphertext: 'Y2lwaGVy',
	queuedAt,
	attempts: 0,
	...extra
});
const ok = (rev = 1): SendResult => ({ rev, updatedAt: 100 });

describe('pendingOf', () => {
	it('marks waiting and refused rows by record id', () => {
		expect(pendingOf([row('a', 1), row('b', 2, { refused: true }), row('c', 3, { op: 'delete' })])).toEqual({
			a: 'waiting',
			b: 'refused',
			c: 'waiting'
		});
	});
});

describe('applyOutbox', () => {
	const stored = (id: string, text: string, rev = 3): StoredRecord => ({
		id,
		rev,
		updatedAt: 1,
		payload: note(text)
	});

	it('shows a waiting change over the cached version and keeps the known revision', () => {
		const items = { a: stored('a', 'old') };
		applyOutbox(
			items,
			[row('a', 10)],
			() => note('new'),
			() => 3
		);
		expect(items.a).toMatchObject({ rev: 3, updatedAt: 10 });
		expect((items.a!.payload as NotePayload).text).toBe('new');
	});

	it('adds a record the server has never seen', () => {
		const items: Record<string, StoredRecord> = {};
		applyOutbox(
			items,
			[row('n', 10)],
			() => note('fresh'),
			() => 0
		);
		expect(items.n?.rev).toBe(0);
	});

	it('hides a record with a waiting delete', () => {
		const items = { a: stored('a', 'x'), b: stored('b', 'y') };
		applyOutbox(
			items,
			[row('a', 10, { op: 'delete' })],
			() => null,
			() => 3
		);
		expect(Object.keys(items)).toEqual(['b']);
	});

	it('applies rows oldest first, so a later delete wins over an earlier put', () => {
		const items: Record<string, StoredRecord> = {};
		applyOutbox(
			items,
			[row('a', 20, { op: 'delete' }), row('a', 10)],
			() => note('x'),
			() => 0
		);
		expect(items.a).toBeUndefined();
	});

	it('leaves the cached version when a row cannot be opened', () => {
		const items = { a: stored('a', 'old') };
		applyOutbox(
			items,
			[row('a', 10)],
			() => null,
			() => 3
		);
		expect((items.a!.payload as NotePayload).text).toBe('old');
	});
});

describe('classify', () => {
	it('tells network trouble, conflicts, missing records, server trouble and refusals apart', () => {
		expect(classify(new ApiError(0, 'network'))).toBe('network');
		expect(classify(new ApiError(401, 'unauthenticated'))).toBe('auth');
		expect(classify(new ApiError(409, 'conflict'))).toBe('conflict');
		expect(classify(new ApiError(404, 'not_found'))).toBe('missing');
		expect(classify(new ApiError(503, 'x'))).toBe('transient');
		expect(classify(new ApiError(429, 'x'))).toBe('transient');
		expect(classify(new ApiError(400, 'bad_request'))).toBe('refused');
		expect(classify(new ApiError(413, 'too_large'))).toBe('refused');
		expect(classify(new Error('boom'))).toBe('transient');
	});
});

describe('deliver', () => {
	it('retries a conflict once without the base revision', async () => {
		const send = vi
			.fn<(r: OutboxRow, b: number | undefined) => Promise<SendResult>>()
			.mockRejectedValueOnce(new ApiError(409, 'conflict'))
			.mockResolvedValueOnce(ok(5));
		expect(await deliver(row('a', 1), 3, send)).toEqual({ kind: 'sent', res: ok(5) });
		expect(send.mock.calls.map((c) => c[1])).toEqual([3, undefined]);
	});

	it('refuses the row when the second try conflicts too', async () => {
		const send = vi.fn().mockRejectedValue(new ApiError(409, 'conflict'));
		expect(await deliver(row('a', 1), 3, send)).toEqual({ kind: 'refused' });
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('counts a delete of an id the server never had as done', async () => {
		const send = vi.fn().mockRejectedValue(new ApiError(404, 'not_found'));
		const outcome = await deliver(row('a', 1, { op: 'delete' }), undefined, send);
		expect(outcome.kind).toBe('sent');
	});

	it('does not count a missing record on a put as done', async () => {
		const send = vi.fn().mockRejectedValue(new ApiError(404, 'not_found'));
		expect(await deliver(row('a', 1), undefined, send)).toEqual({ kind: 'refused' });
	});

	it('marks other refusals, and stops on network, server and sign-in trouble', async () => {
		const failWith = (err: ApiError) => deliver(row('a', 1), undefined, vi.fn().mockRejectedValue(err));
		expect(await failWith(new ApiError(400, 'bad_request'))).toEqual({ kind: 'refused' });
		expect(await failWith(new ApiError(413, 'too_large'))).toEqual({ kind: 'refused' });
		expect(await failWith(new ApiError(0, 'network'))).toEqual({ kind: 'stop', why: 'network' });
		expect(await failWith(new ApiError(502, 'x'))).toEqual({ kind: 'stop', why: 'transient' });
		expect(await failWith(new ApiError(401, 'unauthenticated'))).toEqual({ kind: 'stop', why: 'auth' });
	});
});

describe('flushRows', () => {
	function hooks(send: FlushHooks['send']) {
		const log: string[] = [];
		const h: FlushHooks = {
			send,
			baseRevOf: (r) => r.baseRev,
			sent: async (r) => void log.push(`sent:${r.id}`),
			refused: async (r) => void log.push(`refused:${r.id}`),
			failed: async (r) => void log.push(`failed:${r.id}`)
		};
		return { h, log };
	}

	it('sends oldest first, whatever order the rows come in', async () => {
		const order: string[] = [];
		const { h } = hooks(async (r) => {
			order.push(r.id);
			return ok();
		});
		const result = await flushRows([row('c', 30), row('a', 10), row('b', 20)], h);
		expect(order).toEqual(['a', 'b', 'c']);
		expect(result.sent).toHaveLength(3);
		expect(result.stopped).toBe(false);
	});

	it('stops at the first network error and leaves the rest waiting', async () => {
		const send = vi
			.fn<FlushHooks['send']>()
			.mockResolvedValueOnce(ok())
			.mockRejectedValueOnce(new ApiError(0, 'network'));
		const { h, log } = hooks(send);
		const result = await flushRows([row('a', 1), row('b', 2), row('c', 3)], h);
		expect(log).toEqual(['sent:a', 'failed:b']);
		expect(send).toHaveBeenCalledTimes(2);
		expect(result.stopped).toBe(true);
	});

	it('marks a refused row and carries on with the next one', async () => {
		const send = vi
			.fn<FlushHooks['send']>()
			.mockRejectedValueOnce(new ApiError(400, 'bad_request'))
			.mockResolvedValueOnce(ok());
		const { h, log } = hooks(send);
		const result = await flushRows([row('a', 1), row('b', 2)], h);
		expect(log).toEqual(['refused:a', 'sent:b']);
		expect(result.stopped).toBe(false);
	});

	it('skips rows that were refused earlier', async () => {
		const send = vi.fn<FlushHooks['send']>().mockResolvedValue(ok());
		const { h, log } = hooks(send);
		await flushRows([row('a', 1, { refused: true }), row('b', 2)], h);
		expect(log).toEqual(['sent:b']);
	});

	it('does not count a sign-in problem as an attempt', async () => {
		const { h, log } = hooks(async () => {
			throw new ApiError(401, 'unauthenticated');
		});
		const result = await flushRows([row('a', 1)], h);
		expect(log).toEqual([]);
		expect(result.stopped).toBe(true);
	});

	it('uses the base revision the hooks know now', async () => {
		const send = vi.fn<FlushHooks['send']>().mockResolvedValue(ok());
		const { h } = hooks(send);
		await flushRows([row('a', 1, { baseRev: 2 })], { ...h, baseRevOf: () => 7 });
		expect(send.mock.calls[0]![1]).toBe(7);
	});
});

describe('withTimeout', () => {
	it('turns a request that never answers into a network error', async () => {
		vi.useFakeTimers();
		const pending = withTimeout(new Promise<number>(() => undefined), 1000);
		const check = expect(pending).rejects.toMatchObject({ status: 0, code: 'network' });
		await vi.advanceTimersByTimeAsync(1001);
		await check;
		vi.useRealTimers();
	});

	it('passes an answer through', async () => {
		expect(await withTimeout(Promise.resolve(4), 1000)).toBe(4);
	});
});
