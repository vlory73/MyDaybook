import { test, expect, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
	initCrypto,
	createAccount,
	toB64,
	fromB64,
	unlockWithPassphrase,
	unlockWithRecoveryKey,
	rewrapForPassphrase,
	rewrapForNewRecoveryKey,
	formatRecoveryKey,
	deriveFromPassphrase,
	deriveFromRecoveryKey,
	type KdfParams
} from '../../src/lib/crypto';

// Synthetic data only. Real client crypto with cheap KDF parameters; the server is the production build.
const ORIGIN = `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}`;
const DATA_DIR = 'test-results/e2e-data';
const FAST: KdfParams = { alg: 'argon2id13', ops: 1, memBytes: 8 * 1024 * 1024 };
const JSON_HEADERS = { origin: ORIGIN, 'content-type': 'application/json' };

test.describe.configure({ mode: 'serial' });

type Bundle = ReturnType<typeof createAccount>['bundle'];
type Account = {
	userId: string;
	username: string;
	passphrase: string;
	bundle: Bundle;
	recoveryKey: Uint8Array;
	masterKey: Uint8Array;
};

function post(
	ctx: APIRequestContext,
	path: string,
	data: unknown,
	headers: Record<string, string> = JSON_HEADERS
) {
	return ctx.post(path, { headers, data: data as object });
}

function inviteFromCli(admin: boolean): string {
	const out = execFileSync('node', ['scripts/cli.mjs', 'invite', ...(admin ? ['--admin'] : [])], {
		env: { ...process.env, DATA_DIR, PUBLIC_URL: ORIGIN },
		encoding: 'utf8'
	});
	const m = /\/join#t=([A-Za-z0-9_-]{43})/.exec(out);
	if (!m) throw new Error('no invite token in CLI output');
	return m[1]!;
}

function newAccount(prefix: string): Account {
	const userId = randomUUID();
	const username = `${prefix}-${randomBytes(4).toString('hex')}`;
	const passphrase = `synthetic passphrase ${randomBytes(6).toString('hex')}`;
	const acct = createAccount(userId, passphrase, FAST);
	return {
		userId,
		username,
		passphrase,
		bundle: acct.bundle,
		recoveryKey: acct.recoveryKey,
		masterKey: acct.keys.masterKey
	};
}

function signupBody(a: Account, inviteToken: string) {
	const b = a.bundle;
	return {
		inviteToken,
		userId: a.userId,
		username: a.username,
		kdfSalt: toB64(b.kdfSalt),
		kdfParams: b.kdfParams,
		authKey: toB64(b.authKey),
		recoveryAuthKey: toB64(b.recoveryAuthKey),
		wrappedMkByPassphrase: toB64(b.wrappedMkByPassphrase),
		wrappedMkByRecovery: toB64(b.wrappedMkByRecovery),
		publicKey: toB64(b.publicKey),
		wrappedPrivateKey: toB64(b.wrappedPrivateKey),
		consent: { version: '1', textHash: 'synthetic-consent-hash', locale: 'en' }
	};
}

function unlockFrom(a: Pick<Account, 'userId'>, passphrase: string, bundle: Record<string, unknown>) {
	return unlockWithPassphrase(a.userId, passphrase, {
		kdfSalt: fromB64(bundle.kdfSalt as string),
		kdfParams: bundle.kdfParams as KdfParams,
		wrappedMkByPassphrase: fromB64(bundle.wrappedMkByPassphrase as string),
		wrappedPrivateKey: fromB64(bundle.wrappedPrivateKey as string),
		publicKey: fromB64(bundle.publicKey as string)
	});
}

function readDb<T>(fn: (db: Database.Database) => T): T {
	const db = new Database(resolve(DATA_DIR, 'app.db'), { readonly: true });
	try {
		db.pragma('busy_timeout = 5000');
		return fn(db);
	} finally {
		db.close();
	}
}

const loginBody = (a: Account, authKey: Uint8Array = a.bundle.authKey) => ({
	username: a.username,
	authKey: toB64(authKey)
});

let admin: Account;
let member: Account;
let adminInvite: string;
let fresh: () => Promise<APIRequestContext>;
let main: APIRequestContext; // the first admin's cookie jar, shared by the tests that need it

test.beforeAll(async ({ playwright }) => {
	await initCrypto();
	fresh = () => playwright.request.newContext({ baseURL: ORIGIN });
	admin = newAccount('e2e-admin');
	member = newAccount('e2e-member');
	main = await fresh();
	adminInvite = inviteFromCli(true);
});

test('origin and content-type guard on /api writes', async ({ request }) => {
	const body = { token: 'x' };
	expect(
		(await post(request, '/api/invites/check', body, { 'content-type': 'application/json' })).status()
	).toBe(403);
	expect(
		(
			await post(request, '/api/invites/check', body, { ...JSON_HEADERS, origin: 'https://evil.example' })
		).status()
	).toBe(403);
	const wrongType = await request.post('/api/invites/check', {
		headers: { origin: ORIGIN, 'content-type': 'text/plain' },
		data: JSON.stringify(body)
	});
	expect(wrongType.status()).toBe(403);
	expect(await wrongType.json()).toEqual({ error: 'bad_content_type' });
	expect(wrongType.headers()['cache-control']).toBe('no-store');
	// Reads need no Origin.
	expect((await request.get('/api/auth/session')).status()).toBe(401);
});

test('invite check, signup (first admin), session bundle and unlock', async () => {
	const request = main;
	const bad = await post(request, '/api/invites/check', { token: randomBytes(32).toString('base64url') });
	expect(bad.status()).toBe(404);
	expect(await bad.json()).toEqual({ error: 'invalid_invite' });

	const ok = await post(request, '/api/invites/check', { token: adminInvite });
	expect(ok.status()).toBe(200);
	expect(await ok.json()).toEqual({ ok: true, role: 'admin' });

	const invalid = await post(request, '/api/auth/signup', {
		...signupBody(admin, adminInvite),
		authKey: 'short'
	});
	expect(invalid.status()).toBe(400);

	const res = await post(request, '/api/auth/signup', signupBody(admin, adminInvite));
	expect(res.status()).toBe(200);
	expect(await res.json()).toEqual({ userId: admin.userId, username: admin.username, role: 'admin' });
	const setCookie = res.headers()['set-cookie'] ?? '';
	expect(setCookie).toMatch(/^sid=/);
	expect(setCookie).toMatch(/HttpOnly/i);
	expect(setCookie).toMatch(/SameSite=Strict/i);
	expect(setCookie).not.toMatch(/Secure/i);

	const session = await request.get('/api/auth/session');
	expect(session.status()).toBe(200);
	expect(session.headers()['cache-control']).toBe('no-store');
	const s = await session.json();
	expect(s).toMatchObject({ userId: admin.userId, username: admin.username, role: 'admin' });
	const keys = unlockFrom(admin, admin.passphrase, s.bundle);
	expect(toB64(keys.masterKey)).toBe(toB64(admin.masterKey));
	expect(() => unlockFrom(admin, 'wrong passphrase', s.bundle)).toThrow();

	// Only hashes are stored: the raw auth key and invite token do not appear in the database.
	readDb((db) => {
		const row = db.prepare('SELECT auth_verifier AS v FROM users WHERE id = ?').get(admin.userId) as {
			v: Buffer;
		};
		expect(row.v.equals(Buffer.from(admin.bundle.authKey))).toBe(false);
		expect(row.v).toHaveLength(32);
	});
});

test('a used invite cannot be used again', async ({ request }) => {
	const other = newAccount('e2e-reuse');
	const res = await post(request, '/api/auth/signup', signupBody(other, adminInvite));
	expect(res.status()).toBe(404);
	expect(await res.json()).toEqual({ error: 'invalid_invite' });
	expect((await post(request, '/api/invites/check', { token: adminInvite })).status()).toBe(404);
});

test('admin creates an invite; taken usernames do not burn it; members cannot invite', async () => {
	const request = main;
	const anon = await fresh();
	expect((await post(anon, '/api/invites', {})).status()).toBe(401);
	await anon.dispose();

	const created = await post(request, '/api/invites', { hours: 1 });
	expect(created.status()).toBe(200);
	const { token, expiresAt } = await created.json();
	expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(expiresAt).toBeGreaterThan(Date.now());
	expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000 + 5_000);
	expect((await post(request, '/api/invites', { role: 'owner' })).status()).toBe(400);
	expect((await post(request, '/api/invites', { hours: 0 })).status()).toBe(400);

	// Same username as the admin: 409, and the invite survives.
	const clash = { ...signupBody(member, token), username: admin.username };
	const taken = await post(request, '/api/auth/signup', clash);
	expect(taken.status()).toBe(409);
	expect(await taken.json()).toEqual({ error: 'username_taken' });
	expect((await post(request, '/api/invites/check', { token })).status()).toBe(200);

	const memberCtx = await fresh();
	const signup = await post(memberCtx, '/api/auth/signup', signupBody(member, token));
	expect(signup.status()).toBe(200);
	expect((await signup.json()).role).toBe('member');
	expect((await post(memberCtx, '/api/invites', {})).status()).toBe(403);
	await memberCtx.dispose();

	readDb((db) => {
		const n = db
			.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE admin_id = ? AND action = 'invite'")
			.get(admin.userId) as {
			n: number;
		};
		expect(n.n).toBeGreaterThanOrEqual(1);
		const c = db
			.prepare('SELECT COUNT(*) AS n FROM consents WHERE user_id = ? AND actor = ?')
			.get(member.userId, 'self') as {
			n: number;
		};
		expect(c.n).toBe(1);
	});
});

test('prelogin: real salt for users, stable 16-byte fake salt for unknown names', async ({ request }) => {
	const real = await (
		await post(request, '/api/auth/prelogin', { username: member.username.toUpperCase() })
	).json();
	expect(real.kdfSalt).toBe(toB64(member.bundle.kdfSalt));
	expect(real.kdfParams).toEqual(FAST);

	const ghost = `e2e-ghost-${randomBytes(4).toString('hex')}`;
	const a = await (await post(request, '/api/auth/prelogin', { username: ghost })).json();
	const b = await (await post(request, '/api/auth/prelogin', { username: ghost })).json();
	expect(a).toEqual(b);
	expect(fromB64(a.kdfSalt)).toHaveLength(16);
	expect(Object.keys(a).sort()).toEqual(Object.keys(real).sort());
	expect(a.kdfParams).toMatchObject({ alg: 'argon2id13', ops: 3, memBytes: 64 * 1024 * 1024 });
	const other = await (await post(request, '/api/auth/prelogin', { username: ghost + 'x' })).json();
	expect(other.kdfSalt).not.toBe(a.kdfSalt);
});

test('logout, login with the derived key, and generic failures', async () => {
	const request = main;
	expect((await post(request, '/api/auth/logout', {})).status()).toBe(200);
	expect((await request.get('/api/auth/session')).status()).toBe(401);

	const wrong = await post(request, '/api/auth/login', loginBody(admin, randomBytes(32)));
	expect(wrong.status()).toBe(401);
	const wrongBody = await wrong.json();
	expect(wrongBody).toEqual({ error: 'invalid_credentials' });
	const unknown = await post(request, '/api/auth/login', {
		username: `e2e-ghost-${randomBytes(4).toString('hex')}`,
		authKey: toB64(randomBytes(32))
	});
	expect(unknown.status()).toBe(401);
	expect(await unknown.json()).toEqual(wrongBody);

	// The client re-derives the auth key from the passphrase and the salt from prelogin.
	const pre = await (await post(request, '/api/auth/prelogin', { username: admin.username })).json();
	const { authKey } = deriveFromPassphrase(admin.passphrase, fromB64(pre.kdfSalt), pre.kdfParams);
	const ok = await post(request, '/api/auth/login', loginBody(admin, authKey));
	expect(ok.status()).toBe(200);
	const body = await ok.json();
	expect(body).toMatchObject({ userId: admin.userId, username: admin.username, role: 'admin' });
	expect(unlockFrom(admin, admin.passphrase, body.bundle).masterKey).toEqual(admin.masterKey);
	expect((await request.get('/api/auth/session')).status()).toBe(200);
});

test('passphrase change revokes other sessions and replaces the verifier', async ({ request }) => {
	const a = await fresh();
	const b = await fresh();
	expect((await post(a, '/api/auth/login', loginBody(member))).status()).toBe(200);
	expect((await post(b, '/api/auth/login', loginBody(member))).status()).toBe(200);

	const next = 'synthetic new passphrase ' + randomBytes(4).toString('hex');
	const re = rewrapForPassphrase(member.userId, member.masterKey, next, FAST);
	const change = (currentAuthKey: Uint8Array) => ({
		currentAuthKey: toB64(currentAuthKey),
		kdfSalt: toB64(re.kdfSalt),
		kdfParams: re.kdfParams,
		authKey: toB64(re.authKey),
		wrappedMkByPassphrase: toB64(re.wrappedMkByPassphrase)
	});
	expect((await post(a, '/api/auth/passphrase', change(randomBytes(32)))).status()).toBe(401);
	expect((await post(a, '/api/auth/passphrase', change(member.bundle.authKey))).status()).toBe(200);

	expect((await a.get('/api/auth/session')).status()).toBe(200); // the session that changed it stays
	expect((await b.get('/api/auth/session')).status()).toBe(401); // others are gone
	expect((await post(request, '/api/auth/login', loginBody(member))).status()).toBe(401);
	const login = await post(request, '/api/auth/login', loginBody(member, re.authKey));
	expect(login.status()).toBe(200);
	const keys = unlockFrom(member, next, (await login.json()).bundle);
	expect(keys.masterKey).toEqual(member.masterKey);

	member.passphrase = next;
	member.bundle = {
		...member.bundle,
		authKey: re.authKey,
		kdfSalt: re.kdfSalt,
		wrappedMkByPassphrase: re.wrappedMkByPassphrase
	};
	await a.dispose();
	await b.dispose();
});

test('recovery with the recovery key replaces both secrets and revokes sessions', async () => {
	const old = await fresh();
	expect((await post(old, '/api/auth/login', loginBody(member))).status()).toBe(200);

	const anon = await fresh();
	const { recoveryAuthKey } = deriveFromRecoveryKey(member.recoveryKey);
	expect(formatRecoveryKey(member.recoveryKey)).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);

	const denied = await post(anon, '/api/auth/recover/start', {
		username: member.username,
		recoveryAuthKey: toB64(randomBytes(32))
	});
	expect(denied.status()).toBe(401);
	expect(await denied.json()).toEqual({ error: 'invalid_credentials' });

	const start = await post(anon, '/api/auth/recover/start', {
		username: member.username,
		recoveryAuthKey: toB64(recoveryAuthKey)
	});
	expect(start.status()).toBe(200);
	const s = await start.json();
	expect(s.userId).toBe(member.userId);
	const keys = unlockWithRecoveryKey(s.userId, member.recoveryKey, {
		wrappedMkByRecovery: fromB64(s.wrappedMkByRecovery),
		wrappedPrivateKey: fromB64(s.wrappedPrivateKey),
		publicKey: fromB64(s.publicKey)
	});
	expect(keys.masterKey).toEqual(member.masterKey);

	const next = 'synthetic recovered passphrase ' + randomBytes(4).toString('hex');
	const pw = rewrapForPassphrase(member.userId, keys.masterKey, next, FAST);
	const rk = rewrapForNewRecoveryKey(member.userId, keys.masterKey);
	const finishBody = {
		recoveryToken: s.recoveryToken,
		kdfSalt: toB64(pw.kdfSalt),
		kdfParams: pw.kdfParams,
		authKey: toB64(pw.authKey),
		wrappedMkByPassphrase: toB64(pw.wrappedMkByPassphrase),
		recoveryAuthKey: toB64(rk.recoveryAuthKey),
		wrappedMkByRecovery: toB64(rk.wrappedMkByRecovery)
	};
	expect(
		(
			await post(anon, '/api/auth/recover/finish', {
				...finishBody,
				recoveryToken: randomBytes(32).toString('base64url')
			})
		).status()
	).toBe(401);
	const finish = await post(anon, '/api/auth/recover/finish', finishBody);
	expect(finish.status()).toBe(200);
	expect((await anon.get('/api/auth/session')).status()).toBe(200); // new session
	expect((await old.get('/api/auth/session')).status()).toBe(401); // old one revoked
	expect((await post(anon, '/api/auth/recover/finish', finishBody)).status()).toBe(401); // single use

	const fresh1 = await fresh();
	expect((await post(fresh1, '/api/auth/login', loginBody(member))).status()).toBe(401); // old passphrase
	const login = await post(fresh1, '/api/auth/login', loginBody(member, pw.authKey));
	expect(login.status()).toBe(200);
	expect(unlockFrom(member, next, (await login.json()).bundle).masterKey).toEqual(member.masterKey);
	// The old recovery key no longer works; the new one does.
	const oldRk = await post(fresh1, '/api/auth/recover/start', {
		username: member.username,
		recoveryAuthKey: toB64(recoveryAuthKey)
	});
	expect(oldRk.status()).toBe(401);
	const newRk = await post(fresh1, '/api/auth/recover/start', {
		username: member.username,
		recoveryAuthKey: toB64(rk.recoveryAuthKey)
	});
	expect(newRk.status()).toBe(200);

	member.passphrase = next;
	member.bundle = { ...member.bundle, authKey: pw.authKey };
	await old.dispose();
	await anon.dispose();
	await fresh1.dispose();
});

test('rate limiting answers 429 with Retry-After after the burst', async () => {
	const ctx = await fresh();
	const username = `e2e-rl-${randomBytes(4).toString('hex')}`;
	const attempt = () => post(ctx, '/api/auth/login', { username, authKey: toB64(randomBytes(32)) });
	// Five failures are free; then the exponential lock-out and the bucket (AUTH_RATE_USER_BURST = 20 in
	// playwright.config.ts) start answering 429.
	let attempts = 0;
	let blocked = await attempt();
	while (blocked.status() === 401 && attempts < 30) {
		attempts++;
		blocked = await attempt();
	}
	expect(attempts).toBeGreaterThanOrEqual(5);
	expect(attempts).toBeLessThanOrEqual(20);
	expect(blocked.status()).toBe(429);
	expect(await blocked.json()).toEqual({ error: 'rate_limited' });
	expect(Number(blocked.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
	// Another user name is unaffected (the per-user bucket is separate; the IP bucket is loose in e2e).
	expect(
		(
			await post(ctx, '/api/auth/login', { username: username + '2', authKey: toB64(randomBytes(32)) })
		).status()
	).toBe(401);
	await ctx.dispose();
});

test('account deletion: wrong key refused, last guardian blocked, then user and security events are gone', async () => {
	const ctx = await fresh();
	const victim = newAccount('e2e-del');
	const adminCtx = await fresh();
	const { authKey } = deriveFromPassphrase(admin.passphrase, admin.bundle.kdfSalt, FAST);
	expect((await post(adminCtx, '/api/auth/login', loginBody(admin, authKey))).status()).toBe(200);
	const { token } = await (await post(adminCtx, '/api/invites', {})).json();
	expect((await post(ctx, '/api/auth/signup', signupBody(victim, token))).status()).toBe(200);

	// Create a security event for the victim (failed login), then check it exists.
	expect((await post(await fresh(), '/api/auth/login', loginBody(victim, randomBytes(32)))).status()).toBe(
		401
	);
	const eventsFor = (id: string) =>
		readDb(
			(db) =>
				(db.prepare('SELECT COUNT(*) AS n FROM security_events WHERE user_id = ?').get(id) as { n: number }).n
		);
	expect(eventsFor(victim.userId)).toBeGreaterThanOrEqual(2); // signup + login_failed

	expect((await post(ctx, '/api/account/delete', { authKey: toB64(randomBytes(32)) })).status()).toBe(401);
	expect((await ctx.get('/api/auth/session')).status()).toBe(200);

	// A dependent whose only guardian is the victim blocks deletion (D12).
	const depId = randomUUID();
	const b = Buffer.from('synthetic');
	const write = new Database(resolve(DATA_DIR, 'app.db'));
	write.pragma('busy_timeout = 5000');
	write.pragma('foreign_keys = ON');
	write
		.prepare(
			`INSERT INTO users (id, username, kind, role, status, created_at, kdf_salt, kdf_params, auth_scheme, auth_verifier,
			 recovery_verifier, wrapped_mk_pw, wrapped_mk_rk, public_key, wrapped_private_key, storage_bytes)
			 VALUES (?, NULL, 'dependent', 'member', 'active', 1, ?, '{}', 'derived-v1', ?, ?, ?, ?, ?, ?, 0)`
		)
		.run(depId, b, b, b, b, b, b, b);
	write
		.prepare(
			'INSERT INTO guardianships (dependent_id, guardian_id, sealed_mk, created_at) VALUES (?, ?, ?, 1)'
		)
		.run(depId, victim.userId, b);
	const blocked = await post(ctx, '/api/account/delete', { authKey: toB64(victim.bundle.authKey) });
	expect(blocked.status()).toBe(409);
	expect(await blocked.json()).toEqual({ error: 'last_guardian' });
	write
		.prepare(
			'INSERT INTO guardianships (dependent_id, guardian_id, sealed_mk, created_at) VALUES (?, ?, ?, 1)'
		)
		.run(depId, admin.userId, b);
	write.close();

	const auditBefore = readDb(
		(db) =>
			(
				db.prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE admin_id = ?').get(admin.userId) as {
					n: number;
				}
			).n
	);
	expect(auditBefore).toBeGreaterThanOrEqual(2);

	const del = await post(ctx, '/api/account/delete', { authKey: toB64(victim.bundle.authKey) });
	expect(del.status()).toBe(200);
	expect((await ctx.get('/api/auth/session')).status()).toBe(401);
	expect((await post(await fresh(), '/api/auth/login', loginBody(victim))).status()).toBe(401);
	expect(eventsFor(victim.userId)).toBe(0);
	readDb((db) => {
		expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(victim.userId)).toBeUndefined();
		expect(
			db.prepare('SELECT 1 FROM guardianships WHERE guardian_id = ?').get(victim.userId)
		).toBeUndefined();
	});

	// The admin is now the dependent's only guardian. Remove the dependent, then delete the admin:
	// admin_audit rows stay (D23).
	expect((await post(adminCtx, '/api/account/delete', { authKey: toB64(authKey) })).status()).toBe(409);
	const cleanup = new Database(resolve(DATA_DIR, 'app.db'));
	cleanup.pragma('busy_timeout = 5000');
	cleanup.pragma('foreign_keys = ON');
	cleanup.prepare('DELETE FROM users WHERE id = ?').run(depId);
	cleanup.close();
	const delAdmin = await post(adminCtx, '/api/account/delete', { authKey: toB64(authKey) });
	expect(delAdmin.status()).toBe(200);
	readDb((db) => {
		expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(admin.userId)).toBeUndefined();
		const n = (
			db.prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE admin_id = ?').get(admin.userId) as {
				n: number;
			}
		).n;
		expect(n).toBe(auditBefore);
	});
	expect(eventsFor(admin.userId)).toBe(0);
	await adminCtx.dispose();
	await ctx.dispose();
});
