import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobRow } from './blobs';

// Synthetic data only. Photo viewing and cleaning up with a queue of photos not yet uploaded; IndexedDB and the API
// are in-memory fakes.
const fake = vi.hoisted(() => ({
	blobs: new Map<string, BlobRow>(),
	get: vi.fn(),
	del: vi.fn(),
	putBytes: vi.fn()
}));

vi.mock('$lib/session.svelte', () => ({
	session: { status: 'unlocked', identity: { userId: 'u1', username: 'sam', role: 'member' } },
	onLock: () => () => undefined,
	onSignOut: () => () => undefined
}));
vi.mock('$lib/api', async () => {
	const actual = await vi.importActual<typeof import('$lib/api')>('$lib/api');
	return { ...actual, apiGetBytes: fake.get, apiDelete: fake.del, apiPutBytes: fake.putBytes };
});
vi.mock('$lib/records/cache', () => ({
	readBlobs: async () => [...fake.blobs.values()].sort((a, b) => a.queuedAt - b.queuedAt),
	readBlob: async (_u: string, id: string) => fake.blobs.get(id) ?? null,
	putBlobs: async (_u: string, rows: BlobRow[]) => {
		for (const r of rows) fake.blobs.set(r.id, r);
		return true;
	},
	deleteBlobs: async (_u: string, ids: string[]) => {
		for (const id of ids) fake.blobs.delete(id);
	},
	markBlobs: async () => undefined
}));

import { initCrypto } from '$lib/crypto/sodium';
import { acquirePhoto, deleteAttachment, encryptPhoto, sendPhoto } from './client';
import { PhotoDrafts } from './drafts.svelte';
import { loadPhotoQueue, photoQueue, queuePhotoBlobs, queuedBlob, resetPhotoQueue } from './queue.svelte';
import type { ProcessedPhoto } from './process';

const photo = (): ProcessedPhoto => ({
	full: new Uint8Array([1, 2, 3, 4]),
	thumb: new Uint8Array([9, 8]),
	w: 4,
	h: 3
});

beforeAll(async () => {
	await initCrypto();
});

beforeEach(async () => {
	fake.blobs.clear();
	fake.get.mockReset();
	fake.del.mockReset().mockResolvedValue({});
	fake.putBytes.mockReset().mockResolvedValue({});
	resetPhotoQueue();
	await loadPhotoQueue();
});

async function queued() {
	const enc = await encryptPhoto(photo());
	await queuePhotoBlobs(enc.ref.id, enc.blobs);
	return enc;
}

describe('the blob queue', () => {
	it('adds, reads and deletes ciphertext, in upload order', async () => {
		const enc = await queued();
		expect([...fake.blobs.keys()]).toEqual([enc.ref.id, enc.ref.thumbId]);
		expect(photoQueue.ids).toEqual({ [enc.ref.id]: 'waiting', [enc.ref.thumbId]: 'waiting' });
		expect(await queuedBlob(enc.ref.id)).toEqual(enc.blobs[0].blob);
		expect(await queuedBlob('not-queued')).toBeNull();
		// Only ciphertext and ids are stored: no key.
		expect([...fake.blobs.values()].flatMap((r) => Object.keys(r)).join()).not.toContain('key');
		const [a, b] = [...fake.blobs.values()];
		expect(a!.queuedAt).toBeLessThan(b!.queuedAt);
	});
});

describe('showing a photo that is only queued', () => {
	it('decrypts from the local ciphertext without downloading', async () => {
		const enc = await queued();
		const make = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
		const { url, release } = acquirePhoto(enc.ref, 'thumb');
		expect(await url).toBe('blob:local');
		expect(fake.get).not.toHaveBeenCalled();
		expect((make.mock.calls[0]![0] as Blob).size).toBe(2);
		release();
		await Promise.resolve();
		await Promise.resolve();
		expect(revoke).toHaveBeenCalledWith('blob:local');
		make.mockRestore();
		revoke.mockRestore();
	});

	it('downloads a photo that is not queued, and fails offline without trouble', async () => {
		const enc = await encryptPhoto(photo());
		fake.get.mockRejectedValue(new Error('network'));
		const { url, release } = acquirePhoto(enc.ref, 'full');
		await expect(url).rejects.toThrow();
		expect(fake.get).toHaveBeenCalledTimes(1);
		release();
	});
});

describe('removing queued photos', () => {
	it('deleteAttachment drops a queued blob locally and does not ask the server', async () => {
		const enc = await queued();
		expect(await deleteAttachment(enc.ref.id)).toBe(true);
		expect(fake.blobs.has(enc.ref.id)).toBe(false);
		expect(fake.blobs.has(enc.ref.thumbId)).toBe(true);
		expect(photoQueue.ids[enc.ref.id]).toBeUndefined();
		expect(fake.del).not.toHaveBeenCalled();
		await deleteAttachment('on-the-server');
		expect(fake.del).toHaveBeenCalledTimes(1);
	});

	it('discardUnsaved removes the queued blobs of a photo that was never saved', async () => {
		const enc = await queued();
		const drafts = new PhotoDrafts();
		drafts.reset([]);
		drafts.items = [{ kind: 'saved', key: 's1', ref: enc.ref }];
		await drafts.discardUnsaved();
		expect(fake.blobs.size).toBe(0);
		expect(fake.del).not.toHaveBeenCalled();
		drafts.destroy();
	});

	it('settle drops a photo removed while editing that was still queued', async () => {
		const enc = await queued();
		const drafts = new PhotoDrafts();
		drafts.reset([enc.ref]);
		drafts.remove('s0');
		await drafts.settle();
		expect(fake.blobs.size).toBe(0);
		expect(fake.del).not.toHaveBeenCalled();
		drafts.destroy();
	});
});

describe('uploading a photo on Save', () => {
	it('sends both blobs, image first', async () => {
		const enc = await encryptPhoto(photo());
		await sendPhoto(enc);
		expect(fake.putBytes.mock.calls.map((c) => c[0])).toEqual([
			`/api/attachments/${enc.ref.id}`,
			`/api/attachments/${enc.ref.thumbId}`
		]);
	});
});
