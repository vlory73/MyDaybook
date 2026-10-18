import { test, expect, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { encryptRecord, initCrypto, randomBytes, toB64 } from '../../src/lib/crypto';
import { DATA_DIR, JSON_HEADERS, signUpViaApi, type TestUser } from './helpers';

// Synthetic data only. The server never decrypts, so a random KEK is enough to build well-formed records.
test.describe.configure({ mode: 'serial' });

type Wire = {
	id: string;
	wrappedKey: string | null;
	ciphertext: string | null;
	rev: number;
	updatedAt: number;
	deletedAt: number | null;
};

const kek = () => randomBytes(32);

function sealed(user: TestUser, id: string, text = 'synthetic') {
	const enc = encryptRecord(kek(), user.userId, id, {
		v: 1,
		type: 'note',
		at: '2026-10-18T08:10:00+02:00',
		text,
		tags: []
	});
	return { wrappedKey: toB64(enc.wrappedKey), ciphertext: toB64(enc.ciphertext) };
}

const put = (ctx: APIRequestContext, id: string, data: object) =>
	ctx.put(`/api/records/${id}`, { headers: JSON_HEADERS, data });
const del = (ctx: APIRequestContext, id: string) =>
	ctx.delete(`/api/records/${id}`, { headers: JSON_HEADERS, data: {} });
const list = async (ctx: APIRequestContext, query = '') => {
	const res = await ctx.get(`/api/records${query}`);
	expect(res.status()).toBe(200);
	expect(res.headers()['cache-control']).toBe('no-store');
	return (await res.json()) as { records: Wire[]; cursor: string | null; hasMore: boolean };
};

function storageBytes(userId: string): number {
	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
	try {
		return (db.prepare('SELECT storage_bytes AS n FROM users WHERE id = ?').get(userId) as { n: number }).n;
	} finally {
		db.close();
	}
}

test.beforeAll(async () => {
	await initCrypto();
});

test('requires a session', async ({ request }) => {
	expect((await request.get('/api/records')).status()).toBe(401);
	expect((await put(request, randomUUID(), {})).status()).toBe(401);
	expect((await del(request, randomUUID())).status()).toBe(401);
});

test('put, get, update, conflict, delete and tombstone sync', async ({ page }) => {
	const user = await signUpViaApi(page, 'rec');
	const ctx = page.request;
	const id = randomUUID();

	expect((await list(ctx)).records).toEqual([]);

	// Create
	const first = sealed(user, id, 'one');
	const created = await put(ctx, id, first);
	expect(created.status()).toBe(200);
	const c = (await created.json()) as { id: string; rev: number; updatedAt: number };
	expect(c).toMatchObject({ id, rev: 1 });
	const size1 =
		Buffer.from(first.wrappedKey, 'base64url').length + Buffer.from(first.ciphertext, 'base64url').length;
	expect(storageBytes(user.userId)).toBe(size1);

	const afterCreate = await list(ctx);
	expect(afterCreate.records).toHaveLength(1);
	expect(afterCreate.records[0]).toMatchObject({ id, rev: 1, deletedAt: null, ...first });
	expect(afterCreate.hasMore).toBe(false);
	expect(afterCreate.cursor).toBeTruthy();

	// Update with the right baseRev
	const second = sealed(user, id, 'two');
	const updated = await put(ctx, id, { ...second, baseRev: 1 });
	expect(updated.status()).toBe(200);
	const u = (await updated.json()) as { rev: number; updatedAt: number };
	expect(u.rev).toBe(2);
	expect(u.updatedAt).toBeGreaterThan(c.updatedAt);

	// Stale baseRev: 409 with the current revision
	const stale = await put(ctx, id, { ...sealed(user, id, 'three'), baseRev: 1 });
	expect(stale.status()).toBe(409);
	expect(await stale.json()).toEqual({ error: 'conflict', rev: 2 });
	// baseRev for a record that does not exist yet is a conflict too
	expect((await put(ctx, randomUUID(), { ...first, baseRev: 5 })).status()).toBe(409);

	// Only the change since the cursor comes back
	const changes = await list(ctx, `?since=${afterCreate.cursor}`);
	expect(changes.records.map((r) => [r.id, r.rev])).toEqual([[id, 2]]);
	expect((await list(ctx, `?since=${changes.cursor}`)).records).toEqual([]);

	// Delete: tombstone without blobs, visible to sync, storage released
	const deleted = await del(ctx, id);
	expect(deleted.status()).toBe(200);
	expect(((await deleted.json()) as { rev: number }).rev).toBe(3);
	expect(storageBytes(user.userId)).toBe(0);
	const tomb = await list(ctx, `?since=${changes.cursor}`);
	expect(tomb.records).toHaveLength(1);
	expect(tomb.records[0]).toMatchObject({ id, rev: 3, wrappedKey: null, ciphertext: null });
	expect(tomb.records[0]!.deletedAt).toBeGreaterThan(0);

	// Writing to the tombstone brings it back (this is how Undo works)
	const revived = await put(ctx, id, { ...second, baseRev: 3 });
	expect(revived.status()).toBe(200);
	expect(((await revived.json()) as { rev: number }).rev).toBe(4);
	expect((await list(ctx)).records[0]).toMatchObject({ id, rev: 4, deletedAt: null });
	expect(storageBytes(user.userId)).toBe(size1);
});

test('updated_at is strictly increasing and paging follows the cursor', async ({ page }) => {
	const user = await signUpViaApi(page, 'rec');
	const ctx = page.request;
	const ids = Array.from({ length: 5 }, () => randomUUID());
	for (const id of ids) expect((await put(ctx, id, sealed(user, id))).status()).toBe(200);

	const seen: Wire[] = [];
	let cursor: string | null = null;
	for (let guard = 0; guard < 10; guard++) {
		const query: string = `?limit=2${cursor ? `&since=${cursor}` : ''}`;
		const res = await list(ctx, query);
		seen.push(...res.records);
		cursor = res.cursor;
		if (!res.hasMore) break;
	}
	expect(seen.map((r) => r.id)).toEqual(ids);
	const stamps = seen.map((r) => r.updatedAt);
	expect(new Set(stamps).size).toBe(5);
	expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
});

test('rejects malformed input', async ({ page }) => {
	const user = await signUpViaApi(page, 'rec');
	const ctx = page.request;
	const id = randomUUID();
	const good = sealed(user, id);

	expect((await put(ctx, 'not-a-uuid', good)).status()).toBe(400);
	expect((await put(ctx, id, { ...good, wrappedKey: toB64(new Uint8Array(71)) })).status()).toBe(400);
	expect((await put(ctx, id, { ...good, ciphertext: toB64(new Uint8Array(100)) })).status()).toBe(400);
	const wrongVersion = Buffer.from(good.ciphertext, 'base64url');
	wrongVersion[0] = 2;
	expect((await put(ctx, id, { ...good, ciphertext: wrongVersion.toString('base64url') })).status()).toBe(
		400
	);
	const tooBig = Buffer.alloc(1 + 24 + 64 * 1024 + 16 + 1);
	tooBig[0] = 1;
	expect((await put(ctx, id, { ...good, ciphertext: tooBig.toString('base64url') })).status()).toBe(400);
	expect((await put(ctx, id, { ...good, baseRev: -1 })).status()).toBe(400);
	expect((await ctx.get('/api/records?since=garbage')).status()).toBe(400);
	expect((await ctx.get('/api/records?limit=0')).status()).toBe(400);
	expect((await ctx.get('/api/records?limit=1001')).status()).toBe(400);
	// Same origin and JSON rules as the rest of the API
	expect((await ctx.put(`/api/records/${id}`, { data: good })).status()).toBe(403);
	// Nothing was stored by any of the above
	expect((await list(ctx)).records).toEqual([]);
});

test('another user cannot read, overwrite or delete a record', async ({ browser }) => {
	const a = await browser.newContext();
	const b = await browser.newContext();
	try {
		const pageA = await a.newPage();
		const pageB = await b.newPage();
		const userA = await signUpViaApi(pageA, 'reca');
		const userB = await signUpViaApi(pageB, 'recb');
		const id = randomUUID();
		const mine = sealed(userA, id, 'private to A');
		expect((await put(a.request, id, mine)).status()).toBe(200);

		// B sees nothing of it
		expect((await list(b.request)).records).toEqual([]);
		// B's attempts look exactly like "not found"
		expect((await put(b.request, id, sealed(userB, id, 'attack'))).status()).toBe(404);
		expect((await put(b.request, id, { ...sealed(userB, id), baseRev: 1 })).status()).toBe(404);
		expect((await del(b.request, id)).status()).toBe(404);
		expect((await del(b.request, randomUUID())).status()).toBe(404);

		// A's record is untouched
		const still = await list(a.request);
		expect(still.records).toHaveLength(1);
		expect(still.records[0]).toMatchObject({ id, rev: 1, deletedAt: null, ...mine });
		expect(storageBytes(userB.userId)).toBe(0);
	} finally {
		await a.close();
		await b.close();
	}
});
