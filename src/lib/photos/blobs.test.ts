import { describe, expect, it } from 'vitest';
import { ApiError } from '$lib/api';
import { blobStates, flushBlobRows, refusedPhotos, type BlobRow } from './blobs';

// Synthetic ciphertext stand-ins only.
const row = (id: string, queuedAt: number, extra: Partial<BlobRow> = {}): BlobRow => ({
	id,
	blob: new Uint8Array([queuedAt]),
	queuedAt,
	photo: id.startsWith('t') ? `f${id.slice(1)}` : id,
	...extra
});

function run(rows: BlobRow[], fail: Record<string, unknown> = {}) {
	const log = { sent: [] as string[], tried: [] as string[], refused: [] as string[] };
	return flushBlobRows(rows, {
		send: async (r) => {
			log.tried.push(r.id);
			if (r.id in fail) throw fail[r.id];
		},
		sent: async (r) => void log.sent.push(r.id),
		refused: async (r) => void log.refused.push(r.id)
	}).then((res) => ({ stopped: res.stopped, ...log }));
}

describe('flushing the photo blob queue', () => {
	it('uploads oldest first', async () => {
		const res = await run([row('b', 3), row('a', 1), row('c', 2)]);
		expect(res.tried).toEqual(['a', 'c', 'b']);
		expect(res.stopped).toBe(false);
		expect(res.sent).toEqual(['a', 'c', 'b']);
	});

	it('stops at the first network error and leaves the rest queued', async () => {
		const res = await run([row('a', 1), row('b', 2), row('c', 3)], { b: new ApiError(0, 'network') });
		expect(res.tried).toEqual(['a', 'b']);
		expect(res.sent).toEqual(['a']);
		expect(res.stopped).toBe(true);
	});

	it('stops on server trouble and on a lost session', async () => {
		expect((await run([row('a', 1), row('b', 2)], { a: new ApiError(503, 'x') })).stopped).toBe(true);
		expect((await run([row('a', 1), row('b', 2)], { a: new ApiError(401, 'unauthenticated') })).stopped).toBe(
			true
		);
	});

	it('marks a blob the server refuses and carries on with the others', async () => {
		const res = await run([row('a', 1), row('b', 2), row('c', 3)], { b: new ApiError(413, 'too_large') });
		expect(res.refused).toEqual(['b']);
		expect(res.sent).toEqual(['a', 'c']);
		expect(res.stopped).toBe(false);
		expect((await run([row('a', 1)], { a: new ApiError(400, 'bad_request') })).refused).toEqual(['a']);
	});

	it('skips blobs that were refused earlier', async () => {
		const res = await run([row('a', 1, { refused: true }), row('b', 2)]);
		expect(res.tried).toEqual(['b']);
	});
});

describe('queue summaries', () => {
	it('names each blob as waiting or refused', () => {
		expect(blobStates([row('a', 1), row('b', 2, { refused: true })])).toEqual({
			a: 'waiting',
			b: 'refused'
		});
	});

	it('counts refused photos, not blobs (a photo is an image and a thumbnail)', () => {
		const rows = [
			row('f1', 1, { refused: true }),
			row('t1', 2, { refused: true }),
			row('f2', 3),
			row('f3', 4, { refused: true })
		];
		expect(refusedPhotos(rows)).toBe(2);
		expect(refusedPhotos([])).toBe(0);
	});
});
