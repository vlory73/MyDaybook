import { beforeAll, describe, expect, it } from 'vitest';
import {
	DEFAULT_KDF,
	RECOVERY_KEY_BYTES,
	createAccount,
	deriveFromPassphrase,
	deriveFromRecoveryKey,
	decryptRecord,
	encryptRecord,
	formatRecoveryKey,
	initCrypto,
	pad,
	paddedLength,
	parseRecoveryKey,
	recoveryKeyGroups,
	rewrapForNewRecoveryKey,
	rewrapForPassphrase,
	rewrapRecordKey,
	unlockWithPassphrase,
	unlockWithRecoveryKey,
	unwrap,
	wipe,
	wrap,
	type KdfParams
} from './index';
import { recordKek } from './keys';

const FAST: KdfParams = { alg: 'argon2id13', ops: 1, memBytes: 8 * 1024 * 1024 };
const salt = (n: number) => new Uint8Array(16).fill(n);
const bytes = (n: number, v = 7) => new Uint8Array(n).fill(v);
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

beforeAll(async () => {
	await initCrypto();
});

describe('deriveFromPassphrase', () => {
	it('is deterministic and separates pwk from authKey', () => {
		const a = deriveFromPassphrase('correct horse', salt(1), FAST);
		const b = deriveFromPassphrase('correct horse', salt(1), FAST);
		expect(a.pwk).toEqual(b.pwk);
		expect(a.authKey).toEqual(b.authKey);
		expect(eq(a.pwk, a.authKey)).toBe(false);
	});
	it('differs by salt and passphrase', () => {
		const a = deriveFromPassphrase('correct horse', salt(1), FAST);
		expect(deriveFromPassphrase('correct horse', salt(2), FAST).pwk).not.toEqual(a.pwk);
		expect(deriveFromPassphrase('correct horsf', salt(1), FAST).pwk).not.toEqual(a.pwk);
	});
	it('normalises with NFKC', () => {
		const a = deriveFromPassphrase('ＡＢＣ', salt(1), FAST);
		const b = deriveFromPassphrase('ABC', salt(1), FAST);
		expect(a.pwk).toEqual(b.pwk);
		const c = deriveFromPassphrase('æ', salt(1), FAST);
		const d = deriveFromPassphrase('æ'.normalize('NFD'), salt(1), FAST);
		expect(c.authKey).toEqual(d.authKey);
		const e = deriveFromPassphrase('å', salt(1), FAST);
		const f = deriveFromPassphrase('å', salt(1), FAST);
		expect(e.authKey).toEqual(f.authKey);
	});
	it('rejects a bad salt length', () => {
		expect(() => deriveFromPassphrase('x', new Uint8Array(8), FAST)).toThrow();
	});
});

describe('deriveFromRecoveryKey', () => {
	it('is deterministic and separates keys', () => {
		const a = deriveFromRecoveryKey(bytes(RECOVERY_KEY_BYTES));
		const b = deriveFromRecoveryKey(bytes(RECOVERY_KEY_BYTES));
		expect(a.rwk).toEqual(b.rwk);
		expect(a.recoveryAuthKey).toEqual(b.recoveryAuthKey);
		expect(eq(a.rwk, a.recoveryAuthKey)).toBe(false);
		expect(deriveFromRecoveryKey(bytes(RECOVERY_KEY_BYTES, 8)).rwk).not.toEqual(a.rwk);
	});
	it('rejects wrong length', () => {
		expect(() => deriveFromRecoveryKey(bytes(19))).toThrow();
		expect(() => deriveFromRecoveryKey(bytes(21))).toThrow();
	});
});

describe('recovery key text', () => {
	const key = Uint8Array.from({ length: 20 }, (_, i) => i * 13 + 5);
	it('formats as 8 groups of 4 Crockford characters', () => {
		const text = formatRecoveryKey(key);
		expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
		expect(recoveryKeyGroups(key)).toHaveLength(8);
	});
	it('round-trips and is lenient', () => {
		const text = formatRecoveryKey(key);
		expect(parseRecoveryKey(text)).toEqual(key);
		expect(parseRecoveryKey(text.toLowerCase())).toEqual(key);
		expect(parseRecoveryKey(text.replaceAll('-', ' '))).toEqual(key);
		expect(parseRecoveryKey(text.replaceAll('-', ''))).toEqual(key);
		expect(parseRecoveryKey(`  ${text}  `)).toEqual(key);
	});
	it('reads I/L as 1 and O as 0', () => {
		const zeros = new Uint8Array(20);
		expect(formatRecoveryKey(zeros)).toBe('0000-0000-0000-0000-0000-0000-0000-0000');
		expect(parseRecoveryKey('OOOO-OOOO-OOOO-OOOO-OOOO-OOOO-OOOO-OOOO')).toEqual(zeros);
		const ones = parseRecoveryKey('1111-1111-1111-1111-1111-1111-1111-1111');
		expect(ones).not.toBeNull();
		expect(parseRecoveryKey('IIII-llll-1111-1111-1111-1111-1111-1111')).toEqual(ones);
	});
	it('returns null for wrong length or invalid characters', () => {
		const text = formatRecoveryKey(key);
		expect(parseRecoveryKey(text.slice(0, -1))).toBeNull();
		expect(parseRecoveryKey(text + '0')).toBeNull();
		expect(parseRecoveryKey('U' + text.slice(1))).toBeNull();
		expect(parseRecoveryKey('')).toBeNull();
	});
});

describe('wrap / unwrap', () => {
	const k = bytes(32, 1);
	const payload = bytes(32, 9);
	it('round-trips', () => {
		expect(unwrap(wrap(payload, k, 'ad'), k, 'ad')).toEqual(payload);
	});
	it('throws for wrong key, wrong AD, flipped byte and truncation', () => {
		const blob = wrap(payload, k, 'ad');
		expect(() => unwrap(blob, bytes(32, 2), 'ad')).toThrow();
		expect(() => unwrap(blob, k, 'other')).toThrow();
		const flipped = blob.slice();
		flipped[30] = (flipped[30] ?? 0) ^ 1;
		expect(() => unwrap(flipped, k, 'ad')).toThrow();
		expect(() => unwrap(blob.slice(0, blob.length - 5), k, 'ad')).toThrow();
		expect(() => unwrap(blob.slice(0, 10), k, 'ad')).toThrow();
	});
});

describe('account lifecycle', () => {
	const userId = 'user-1';
	it('unlocks with the passphrase to the same keys', () => {
		const acc = createAccount(userId, 'pass phrase one', FAST);
		const u = unlockWithPassphrase(userId, 'pass phrase one', acc.bundle);
		expect(u.masterKey).toEqual(acc.keys.masterKey);
		expect(u.privateKey).toEqual(acc.keys.privateKey);
		expect(u.kek).toEqual(acc.keys.kek);
		expect(u.publicKey).toEqual(acc.keys.publicKey);
	});
	it('rejects a wrong passphrase', () => {
		const acc = createAccount(userId, 'pass phrase one', FAST);
		expect(() => unlockWithPassphrase(userId, 'pass phrase two', acc.bundle)).toThrow();
	});
	it('unlocks with the recovery key', () => {
		const acc = createAccount(userId, 'pass phrase one', FAST);
		const u = unlockWithRecoveryKey(userId, acc.recoveryKey, acc.bundle);
		expect(u.masterKey).toEqual(acc.keys.masterKey);
		expect(u.privateKey).toEqual(acc.keys.privateKey);
	});
	it('binds blobs to the user id', () => {
		const acc = createAccount(userId, 'pass phrase one', FAST);
		expect(() => unlockWithPassphrase('user-2', 'pass phrase one', acc.bundle)).toThrow();
		expect(() => unlockWithRecoveryKey('user-2', acc.recoveryKey, acc.bundle)).toThrow();
	});
	it('rewrapForPassphrase switches to the new passphrase', () => {
		const acc = createAccount(userId, 'old pass', FAST);
		const r = rewrapForPassphrase(userId, acc.keys.masterKey, 'new pass', FAST);
		const bundle = { ...acc.bundle, ...r };
		expect(unlockWithPassphrase(userId, 'new pass', bundle).masterKey).toEqual(acc.keys.masterKey);
		expect(() => unlockWithPassphrase(userId, 'old pass', bundle)).toThrow();
	});
	it('rewrapForNewRecoveryKey switches to the new key', () => {
		const acc = createAccount(userId, 'pass', FAST);
		const r = rewrapForNewRecoveryKey(userId, acc.keys.masterKey);
		const bundle = { ...acc.bundle, wrappedMkByRecovery: r.wrappedMkByRecovery };
		expect(unlockWithRecoveryKey(userId, r.recoveryKey, bundle).masterKey).toEqual(acc.keys.masterKey);
		expect(() => unlockWithRecoveryKey(userId, acc.recoveryKey, bundle)).toThrow();
		expect(r.recoveryAuthKey).not.toEqual(acc.bundle.recoveryAuthKey);
	});
	it('wipe zeroes the key material', () => {
		const acc = createAccount(userId, 'pass', FAST);
		wipe(acc.keys);
		for (const k of [acc.keys.masterKey, acc.keys.kek, acc.keys.privateKey]) {
			expect(k.every((b) => b === 0)).toBe(true);
		}
		expect(() => wipe(null)).not.toThrow();
	});
	it('works with the production KDF parameters', { timeout: 60_000 }, () => {
		const acc = createAccount(userId, 'production params', DEFAULT_KDF);
		const u = unlockWithPassphrase(userId, 'production params', acc.bundle);
		expect(u.masterKey).toEqual(acc.keys.masterKey);
	});
});

describe('records', () => {
	const kek = bytes(32, 3);
	const value = { v: 1, type: 'food', text: 'Oatmeal' };
	const enc = () => encryptRecord(kek, 'u1', 'r1', value);

	it('round-trips', () => {
		expect(decryptRecord(kek, 'u1', 'r1', enc())).toEqual(value);
	});
	it('produces different output each time', () => {
		const a = enc();
		const b = enc();
		expect(a.ciphertext).not.toEqual(b.ciphertext);
		expect(a.wrappedKey).not.toEqual(b.wrappedKey);
	});
	it('throws for wrong kek, ids, tampering and unknown version', () => {
		const r = enc();
		expect(() => decryptRecord(bytes(32, 4), 'u1', 'r1', r)).toThrow();
		expect(() => decryptRecord(kek, 'u1', 'r2', r)).toThrow();
		expect(() => decryptRecord(kek, 'u2', 'r1', r)).toThrow();
		const ct = r.ciphertext.slice();
		ct[40] = (ct[40] ?? 0) ^ 1;
		expect(() => decryptRecord(kek, 'u1', 'r1', { ...r, ciphertext: ct })).toThrow();
		const wk = r.wrappedKey.slice();
		wk[30] = (wk[30] ?? 0) ^ 1;
		expect(() => decryptRecord(kek, 'u1', 'r1', { ...r, wrappedKey: wk })).toThrow();
		const ver = r.ciphertext.slice();
		ver[0] = 2;
		expect(() => decryptRecord(kek, 'u1', 'r1', { ...r, ciphertext: ver })).toThrow(/version/);
	});
	it('has the documented length and hides the type below 255 bytes', () => {
		const json = JSON.stringify(value);
		const r = enc();
		expect(r.ciphertext.length).toBe(1 + 24 + paddedLength(new TextEncoder().encode(json).length) + 16);
		const small = encryptRecord(kek, 'u1', 'r1', { a: 1 });
		const larger = encryptRecord(kek, 'u1', 'r1', { text: 'x'.repeat(200) });
		expect(small.ciphertext.length).toBe(larger.ciphertext.length);
		expect(small.ciphertext.length).toBe(1 + 24 + 256 + 16);
		expect(pad(new Uint8Array(10)).length).toBe(256);
	});
	it('buckets padded lengths', () => {
		expect(paddedLength(0)).toBe(256);
		expect(paddedLength(255)).toBe(256);
		expect(paddedLength(256)).toBe(512);
		expect(paddedLength(4095)).toBe(4096);
		expect(paddedLength(4096)).toBe(8192);
		expect(paddedLength(9000)).toBe(12288);
	});
	it('rewrapRecordKey moves a record to a new kek', () => {
		const r = enc();
		const newKek = recordKek(bytes(32, 5));
		const wrappedKey = rewrapRecordKey(kek, newKek, 'u1', 'r1', r.wrappedKey);
		expect(decryptRecord(newKek, 'u1', 'r1', { ...r, wrappedKey })).toEqual(value);
		expect(() => decryptRecord(kek, 'u1', 'r1', { ...r, wrappedKey })).toThrow();
	});
});
