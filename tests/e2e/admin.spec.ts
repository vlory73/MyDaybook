import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { toB64 } from '../../src/lib/crypto';
import { test, expect } from './fixtures';
import {
	DATA_DIR,
	ORIGIN,
	loginApi,
	postJson,
	signUpApiAccount,
	unlockWith,
	type ApiAccount
} from './helpers';

// Synthetic data only. Every test creates its own people; the e2e database is shared, so lists are searched, not counted.

type ListedUser = Record<string, unknown> & { id: string; username: string | null };

const ctxs: APIRequestContext[] = [];
async function newCtx() {
	const c = await pwRequest.newContext({ baseURL: ORIGIN });
	ctxs.push(c);
	return c;
}
test.afterEach(async () => {
	await Promise.all(ctxs.splice(0).map((c) => c.dispose()));
});

async function users(ctx: APIRequestContext): Promise<ListedUser[]> {
	const res = await ctx.get('/api/admin/users');
	expect(res.status()).toBe(200);
	return (await res.json()).users;
}
const find = async (ctx: APIRequestContext, a: Pick<ApiAccount, 'username'>) =>
	(await users(ctx)).find((u) => u.username === a.username);

function auditRows(adminId: string, action?: string) {
	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
	const rows = db
		.prepare('SELECT action, target_id AS targetId, at FROM admin_audit WHERE admin_id = ? ORDER BY at')
		.all(adminId) as { action: string; targetId: string | null; at: number }[];
	db.close();
	return action ? rows.filter((r) => r.action === action) : rows;
}

async function adminAndMember() {
	const adminCtx = await newCtx();
	const admin = await signUpApiAccount(adminCtx, { prefix: 'adm', admin: true });
	const memberCtx = await newCtx();
	const member = await signUpApiAccount(memberCtx, { prefix: 'mem' });
	return { adminCtx, admin, memberCtx, member };
}

test('members get 403 on every admin API; strangers get 401', async () => {
	const { memberCtx, member } = await adminAndMember();
	const id = randomUUID();
	const anon = await newCtx();
	const calls: [string, string, unknown?][] = [
		['GET', '/api/admin/users'],
		['GET', '/api/admin/invites'],
		['POST', `/api/admin/users/${id}/disable`],
		['POST', `/api/admin/users/${id}/enable`],
		['POST', `/api/admin/users/${id}/delete`, { authKey: toB64(member.authKey) }],
		['POST', `/api/admin/invites/${id}/revoke`],
		['POST', '/api/invites', { role: 'member' }]
	];
	for (const [method, path, body] of calls) {
		const as = async (c: APIRequestContext) =>
			method === 'GET' ? c.get(path) : postJson(c, path, body ?? {});
		const forbidden = await as(memberCtx);
		expect(forbidden.status(), `${method} ${path} as member`).toBe(403);
		expect(await forbidden.json()).toEqual({ error: 'forbidden' });
		expect((await as(anon)).status(), `${method} ${path} signed out`).toBe(401);
	}
});

test('the user list holds account facts only: no keys, verifiers, IPs or content', async () => {
	const { adminCtx, admin, member } = await adminAndMember();
	const res = await adminCtx.get('/api/admin/users');
	const text = await res.text();
	for (const word of [
		'wrappedMk',
		'authVerifier',
		'recoveryVerifier',
		'kdfSalt',
		'kdfParams',
		'wrappedPrivateKey',
		'publicKey',
		'totpSecret',
		'tokenHash',
		'ip'
	]) {
		expect(text, word).not.toContain(`"${word}`);
	}
	const mine = (JSON.parse(text).users as ListedUser[]).find((u) => u.username === member.username)!;
	expect(Object.keys(mine).sort()).toEqual(
		[
			'createdAt',
			'id',
			'kind',
			'lastActiveDay',
			'role',
			'status',
			'storageBytes',
			'totpEnabled',
			'username'
		].sort()
	);
	expect(mine).toMatchObject({
		role: 'member',
		kind: 'adult',
		status: 'active',
		storageBytes: 0,
		totpEnabled: false
	});
	// Day precision only.
	expect(mine.lastActiveDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	expect(mine.lastActiveDay).toBe(new Date().toISOString().slice(0, 10));
	const me = await find(adminCtx, admin);
	expect(me).toMatchObject({ role: 'admin', status: 'active' });
});

test('disable ends sessions and blocks sign-in; enable restores it; guards; audit rows', async () => {
	const { adminCtx, admin, memberCtx, member } = await adminAndMember();
	const target = (await find(adminCtx, member))!;
	expect((await memberCtx.get('/api/auth/session')).status()).toBe(200);

	// An admin cannot disable themselves; unknown ids are 404.
	const self = (await find(adminCtx, admin))!;
	const refused = await postJson(adminCtx, `/api/admin/users/${self.id}/disable`);
	expect(refused.status()).toBe(409);
	expect(await refused.json()).toEqual({ error: 'cannot_disable_self' });
	expect((await postJson(adminCtx, `/api/admin/users/${randomUUID()}/disable`)).status()).toBe(404);
	expect((await postJson(adminCtx, '/api/admin/users/not-a-uuid/disable')).status()).toBe(404);

	expect((await postJson(adminCtx, `/api/admin/users/${target.id}/disable`)).status()).toBe(200);
	expect((await find(adminCtx, member))!.status).toBe('disabled');
	expect((await memberCtx.get('/api/auth/session')).status()).toBe(401); // session revoked
	const fresh = await newCtx();
	const denied = await loginApi(fresh, member);
	expect(denied.status()).toBe(401);
	expect(await denied.json()).toEqual({ error: 'invalid_credentials' });

	expect((await postJson(adminCtx, `/api/admin/users/${target.id}/enable`)).status()).toBe(200);
	expect((await loginApi(fresh, member)).status()).toBe(200);
	expect((await find(adminCtx, member))!.status).toBe('active');

	const rows = auditRows(admin.userId).filter((r) => r.targetId === target.id);
	expect(rows.map((r) => r.action)).toEqual(['disable', 'enable']);
});

test('invites: create, list without token, revoke; a revoked invite cannot sign up', async () => {
	const { adminCtx, admin } = await adminAndMember();
	const before = (await (await adminCtx.get('/api/admin/invites')).json()).invites as { id: string }[];
	const made = await postJson(adminCtx, '/api/invites', { role: 'member', hours: 24 });
	expect(made.status()).toBe(200);
	const { token, expiresAt } = await made.json();
	expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

	const listRes = await adminCtx.get('/api/admin/invites');
	const listText = await listRes.text();
	expect(listText).not.toContain(token);
	expect(listText).not.toContain('token');
	const after = JSON.parse(listText).invites as {
		id: string;
		role: string;
		createdAt: number;
		expiresAt: number;
	}[];
	const invite = after.find((i) => !before.some((b) => b.id === i.id))!;
	expect(Object.keys(invite).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'role']);
	expect(invite).toMatchObject({ role: 'member', expiresAt });

	expect((await postJson(adminCtx, `/api/admin/invites/${invite.id}/revoke`)).status()).toBe(200);
	expect((await postJson(adminCtx, `/api/admin/invites/${invite.id}/revoke`)).status()).toBe(404);
	const gone = (await (await adminCtx.get('/api/admin/invites')).json()).invites as { id: string }[];
	expect(gone.some((i) => i.id === invite.id)).toBe(false);

	const stranger = await newCtx();
	await expect(signUpApiAccount(stranger, { inviteToken: token })).rejects.toThrow();
	const check = await postJson(stranger, '/api/invites/check', { token });
	expect(check.status()).toBe(404);

	expect(auditRows(admin.userId, 'revoke_invite').map((r) => r.targetId)).toEqual([invite.id]);
	expect(auditRows(admin.userId, 'invite').map((r) => r.targetId)).toContain(invite.id);
});

test('delete needs the admin auth key; the audit row stays, the person and their events go', async () => {
	const { adminCtx, admin, member } = await adminAndMember();
	const target = (await find(adminCtx, member))!;
	// Give the member a security event (a failed login) so there is something to erase.
	const other = await newCtx();
	expect((await loginApi(other, { username: member.username, authKey: randomBytes(32) })).status()).toBe(401);

	const wrong = await postJson(adminCtx, `/api/admin/users/${target.id}/delete`, {
		authKey: toB64(randomBytes(32))
	});
	expect(wrong.status()).toBe(401);
	expect(await wrong.json()).toEqual({ error: 'invalid_credentials' });
	expect((await postJson(adminCtx, `/api/admin/users/${target.id}/delete`, {})).status()).toBe(400);
	// Your own account goes through account deletion, not here.
	const self = (await find(adminCtx, admin))!;
	const own = await postJson(adminCtx, `/api/admin/users/${self.id}/delete`, {
		authKey: toB64(admin.authKey)
	});
	expect(own.status()).toBe(409);
	expect(await own.json()).toEqual({ error: 'cannot_delete_self' });
	expect(await find(adminCtx, member)).toBeDefined();

	const ok = await postJson(adminCtx, `/api/admin/users/${target.id}/delete`, {
		authKey: toB64(admin.authKey)
	});
	expect(ok.status()).toBe(200);
	expect(await find(adminCtx, member)).toBeUndefined();
	expect((await loginApi(other, member)).status()).toBe(401);
	expect(
		(
			await postJson(adminCtx, `/api/admin/users/${target.id}/delete`, { authKey: toB64(admin.authKey) })
		).status()
	).toBe(404);

	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
	const events = db.prepare('SELECT COUNT(*) AS n FROM security_events WHERE user_id = ?').get(target.id) as {
		n: number;
	};
	db.close();
	expect(events.n).toBe(0);
	expect(auditRows(admin.userId, 'delete').map((r) => r.targetId)).toEqual([target.id]);
});

// ---- UI ----

async function openAdminPage(page: Page): Promise<{ admin: ApiAccount }> {
	const admin = await signUpApiAccount(page.request, { prefix: 'adm', admin: true });
	await page.goto('/me');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, admin.passphrase);
	return { admin };
}

const row = (page: Page, username: string) => page.locator(`li.person[data-username="${username}"]`);
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });

test('members see no Admin entry in Me and are sent back from /me/admin', async ({ page }) => {
	const member = await signUpApiAccount(page.request, { prefix: 'mem' });
	await page.goto('/me');
	await unlockWith(page, member.passphrase);
	await expect(page.getByRole('heading', { name: 'Two-step sign-in' })).toBeVisible();
	await expect(page.getByTestId('admin-link')).toHaveCount(0);
	await page.goto('/me/admin');
	await unlockWith(page, member.passphrase);
	await expect(page.getByRole('heading', { name: 'Two-step sign-in' })).toBeVisible();
	await expect(page.getByTestId('admin-users')).toHaveCount(0);
});

test('admin: people list, disable with Undo, delete with passphrase, invite link and revoke', async ({
	page
}) => {
	const target = await signUpApiAccount(await newCtx(), { prefix: 'tgt' });
	const { admin } = await openAdminPage(page);
	await page.getByTestId('admin-link').click();
	await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
	await expect(page.getByText("You can manage accounts, but you can't see anyone's diary.")).toBeVisible();

	// People: facts only, and no actions on yourself.
	const mine = row(page, admin.username);
	await expect(mine).toContainText('You');
	await expect(mine).toContainText('Admin');
	await expect(mine.getByRole('button')).toHaveCount(0);
	const theirs = row(page, target.username);
	await expect(theirs).toContainText('Member');
	await expect(theirs).toContainText('Storage 0 B');
	await expect(theirs).toContainText('Two-step off');
	await expect(theirs).toContainText('Last active');

	// Disable, with Undo.
	await theirs.getByRole('button', { name: `Disable ${target.username}` }).click();
	await expect(toast(page, `${target.username} is disabled and signed out.`)).toBeVisible();
	await expect(theirs).toContainText('Disabled');
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(theirs.getByRole('button', { name: `Disable ${target.username}` })).toBeVisible();
	await expect(theirs).not.toContainText('Disabled');
	const check = await newCtx();
	expect((await loginApi(check, target)).status()).toBe(200);

	// Delete: a confirmation sheet and the admin's passphrase.
	await theirs.getByRole('button', { name: `Delete ${target.username}` }).click();
	const sheet = page.getByRole('dialog', { name: `Delete ${target.username}` });
	await expect(sheet.getByText(/can't be undone/)).toBeVisible();
	await sheet.getByLabel('Your passphrase').fill('wrong passphrase');
	await sheet.getByRole('button', { name: 'Delete permanently' }).click();
	await expect(sheet.getByText("That passphrase doesn't match.")).toBeVisible();
	await sheet.getByLabel('Your passphrase').fill(admin.passphrase);
	await sheet.getByRole('button', { name: 'Delete permanently' }).click();
	await expect(toast(page, `${target.username} was deleted.`)).toBeVisible();
	await expect(row(page, target.username)).toHaveCount(0);

	// Invite someone: the link shows once, with Copy and an expiry note; then it is listed and can be revoked.
	await page.getByRole('radio', { name: 'Admin' }).click();
	await page.getByRole('button', { name: 'Create invite link' }).click();
	const link = page.getByTestId('invite-link');
	await expect(link).toHaveValue(/\/join#t=[A-Za-z0-9_-]{43}$/);
	await expect(page.getByText(/shown only once and expires/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
	const token = (await link.inputValue()).split('#t=')[1]!;
	const open = page.getByTestId('admin-invites').locator('li', { hasText: 'Admin, expires' });
	await expect(open).toHaveCount(1);
	await open.getByRole('button', { name: /^Revoke Admin invite/ }).click();
	await expect(toast(page, 'Invite revoked.')).toBeVisible();
	// Only this invite: other tests share the database and may have open invites of their own.
	await expect(open).toHaveCount(0);
	const stranger = await newCtx();
	expect((await postJson(stranger, '/api/invites/check', { token })).status()).toBe(404);
});
