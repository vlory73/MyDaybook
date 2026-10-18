import { test, expect, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encryptAttachment, initCrypto } from '../../src/lib/crypto';
import { DATA_DIR, JSON_HEADERS, ORIGIN, signUpViaApi } from './helpers';

// Synthetic data only: a fake "JPEG" that starts with FF D8 FF and carries a marker string, encrypted like the app does.
test.describe.configure({ mode: 'serial' });

const RAW = { origin: ORIGIN, 'content-type': 'application/octet-stream' };
const MARKER = 'SYNTHETIC-PHOTO-MARKER-7f3a9c';

function fakePhoto(size = 5000): Uint8Array {
	const data = new Uint8Array(size);
	data.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46], 0); // "JFIF" header
	data.set(new TextEncoder().encode(MARKER), 100);
	return data;
}

const upload = (ctx: APIRequestContext, id: string, body: Buffer | Uint8Array) =>
	ctx.put(`/api/attachments/${id}`, { headers: RAW, data: Buffer.from(body) });

function dbRow(userId: string, id: string) {
	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
	try {
		return db.prepare('SELECT size FROM attachments WHERE id = ? AND user_id = ?').get(id, userId) as
			{ size: number } | undefined;
	} finally {
		db.close();
	}
}
function storageBytes(userId: string): number {
	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
	try {
		return (db.prepare('SELECT storage_bytes AS n FROM users WHERE id = ?').get(userId) as { n: number }).n;
	} finally {
		db.close();
	}
}
const blobFile = (userId: string, id: string) => resolve(DATA_DIR, 'blobs', userId, id);

test.beforeAll(async () => {
	await initCrypto();
});

test('requires a session', async ({ request }) => {
	const id = randomUUID();
	expect((await upload(request, id, Buffer.from('x'))).status()).toBe(401);
	expect((await request.get(`/api/attachments/${id}`)).status()).toBe(401);
	expect((await request.delete(`/api/attachments/${id}`, { headers: RAW })).status()).toBe(401);
});

test('upload, download, replace and delete; blob on disk is opaque', async ({ page }) => {
	const user = await signUpViaApi(page, 'att');
	const ctx = page.request;
	const id = randomUUID();
	const { blob } = encryptAttachment(fakePhoto());

	const put = await upload(ctx, id, blob);
	expect(put.status()).toBe(200);
	expect(await put.json()).toEqual({ id, size: blob.length });
	expect(dbRow(user.userId, id)).toEqual({ size: blob.length });
	expect(storageBytes(user.userId)).toBe(blob.length);

	const got = await ctx.get(`/api/attachments/${id}`);
	expect(got.status()).toBe(200);
	expect(got.headers()['content-type']).toBe('application/octet-stream');
	expect(got.headers()['cache-control']).toBe('no-store');
	expect(Buffer.from(await got.body()).equals(Buffer.from(blob))).toBe(true);

	// Privacy: the stored file is exactly the ciphertext, with no JPEG header, no EXIF/JFIF marker, no plaintext.
	const onDisk = readFileSync(blobFile(user.userId, id));
	expect(onDisk.equals(Buffer.from(blob))).toBe(true);
	expect(onDisk.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
	for (const needle of [MARKER, 'JFIF', 'Exif']) expect(onDisk.includes(needle)).toBe(false);

	// Replace with a larger blob (same id): size and storage follow
	const bigger = encryptAttachment(fakePhoto(150_000)).blob;
	expect((await upload(ctx, id, bigger)).status()).toBe(200);
	expect(dbRow(user.userId, id)).toEqual({ size: bigger.length });
	expect(storageBytes(user.userId)).toBe(bigger.length);

	// Delete: file, row and storage go; afterwards it is 404
	const del = await ctx.delete(`/api/attachments/${id}`, { headers: RAW });
	expect(del.status()).toBe(200);
	expect(existsSync(blobFile(user.userId, id))).toBe(false);
	expect(dbRow(user.userId, id)).toBeUndefined();
	expect(storageBytes(user.userId)).toBe(0);
	expect((await ctx.get(`/api/attachments/${id}`)).status()).toBe(404);
	expect((await ctx.delete(`/api/attachments/${id}`, { headers: RAW })).status()).toBe(404);
});

test('another user cannot read, overwrite or delete an attachment', async ({ browser }) => {
	const a = await browser.newContext();
	const b = await browser.newContext();
	try {
		const userA = await signUpViaApi(await a.newPage(), 'atta');
		const userB = await signUpViaApi(await b.newPage(), 'attb');
		const id = randomUUID();
		const mine = encryptAttachment(fakePhoto()).blob;
		expect((await upload(a.request, id, mine)).status()).toBe(200);

		expect((await b.request.get(`/api/attachments/${id}`)).status()).toBe(404);
		expect((await upload(b.request, id, encryptAttachment(fakePhoto()).blob)).status()).toBe(404);
		expect((await b.request.delete(`/api/attachments/${id}`, { headers: RAW })).status()).toBe(404);

		// A's blob is untouched, B has nothing
		const still = await a.request.get(`/api/attachments/${id}`);
		expect(Buffer.from(await still.body()).equals(Buffer.from(mine))).toBe(true);
		expect(existsSync(blobFile(userB.userId, id))).toBe(false);
		expect(storageBytes(userB.userId)).toBe(0);
		expect(storageBytes(userA.userId)).toBe(mine.length);
	} finally {
		await a.close();
		await b.close();
	}
});

test('size limit, content types, ids and origin', async ({ page }) => {
	const user = await signUpViaApi(page, 'attlim');
	const ctx = page.request;
	const id = randomUUID();

	// Exactly 4 MiB is accepted; one byte more is 413
	expect((await upload(ctx, id, Buffer.alloc(4 * 1024 * 1024, 7))).status()).toBe(200);
	const tooBig = await upload(ctx, randomUUID(), Buffer.alloc(4 * 1024 * 1024 + 1, 7));
	expect(tooBig.status()).toBe(413);
	expect(await tooBig.json()).toEqual({ error: 'too_large' });
	expect((await ctx.delete(`/api/attachments/${id}`, { headers: RAW })).status()).toBe(200);
	expect(storageBytes(user.userId)).toBe(0);

	// Empty body, bad id
	expect((await upload(ctx, randomUUID(), Buffer.alloc(0))).status()).toBe(400);
	expect((await upload(ctx, 'not-a-uuid', Buffer.from('x'))).status()).toBe(400);

	// Content types: JSON is passed by the guard but this endpoint wants raw bytes (415); other types are 403
	const body = Buffer.from('x');
	const json = await ctx.put(`/api/attachments/${randomUUID()}`, { headers: JSON_HEADERS, data: body });
	expect(json.status()).toBe(415);
	const text = await ctx.put(`/api/attachments/${randomUUID()}`, {
		headers: { origin: ORIGIN, 'content-type': 'text/plain' },
		data: body
	});
	expect(text.status()).toBe(403);
	expect(await text.json()).toEqual({ error: 'bad_content_type' });

	// Raw bytes are not accepted anywhere else, and the Origin check still applies
	const elsewhere = await ctx.put(`/api/records/${randomUUID()}`, { headers: RAW, data: body });
	expect(elsewhere.status()).toBe(403);
	const noOrigin = await ctx.put(`/api/attachments/${randomUUID()}`, {
		headers: { 'content-type': 'application/octet-stream' },
		data: body
	});
	expect(noOrigin.status()).toBe(403);
	expect(await noOrigin.json()).toEqual({ error: 'bad_origin' });
	const evil = await ctx.put(`/api/attachments/${randomUUID()}`, {
		headers: { ...RAW, origin: 'https://evil.test' },
		data: body
	});
	expect(evil.status()).toBe(403);
});
