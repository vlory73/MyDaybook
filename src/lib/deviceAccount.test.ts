import { describe, expect, it } from 'vitest';
import { parseDeviceAccount, readDeviceAccount, toDeviceAccount, writeDeviceAccount } from './deviceAccount';
import type { WireBundle } from './api';

const bundle: WireBundle = {
	kdfSalt: 'c2FsdA',
	kdfParams: { opslimit: 3, memlimit: 67108864 } as unknown as WireBundle['kdfParams'],
	wrappedMkByPassphrase: 'bWs',
	wrappedPrivateKey: 'cGs',
	publicKey: 'cHVi'
};
const identity = { userId: 'u1', username: 'sam', role: 'member' as const };

describe('device account', () => {
	it('keeps only identity and the wrapped bundle', () => {
		const account = toDeviceAccount(identity, bundle);
		expect(Object.keys(account).sort()).toEqual(['bundle', 'role', 'userId', 'username']);
		expect(parseDeviceAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
	});

	it('reads a damaged entry as nothing cached', () => {
		expect(parseDeviceAccount(null)).toBeNull();
		expect(parseDeviceAccount({})).toBeNull();
		expect(parseDeviceAccount({ ...toDeviceAccount(identity, bundle), role: 'root' })).toBeNull();
		expect(parseDeviceAccount({ ...toDeviceAccount(identity, bundle), bundle: { kdfSalt: 'x' } })).toBeNull();
	});

	it('degrades to nothing cached without IndexedDB', async () => {
		expect(typeof indexedDB).toBe('undefined');
		await expect(writeDeviceAccount(toDeviceAccount(identity, bundle))).resolves.toBeUndefined();
		await expect(readDeviceAccount()).resolves.toBeNull();
	});
});
