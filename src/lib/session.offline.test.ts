import { beforeEach, describe, expect, it, vi } from 'vitest';

const wire = {
	kdfSalt: 'c2FsdHNhbHRzYWx0c2FsdA',
	kdfParams: { opslimit: 3, memlimit: 67108864 },
	wrappedMkByPassphrase: 'bWs',
	wrappedPrivateKey: 'cGs',
	publicKey: 'cHVi'
};

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
const device = vi.hoisted(() => ({
	read: vi.fn(),
	write: vi.fn(async () => undefined),
	remove: vi.fn(async () => undefined)
}));

vi.mock('$lib/api', async () => {
	const actual = await vi.importActual<typeof import('$lib/api')>('$lib/api');
	return { ...actual, apiGet: api.apiGet, apiPost: api.apiPost };
});
vi.mock('$lib/deviceAccount', async () => {
	const actual = await vi.importActual<typeof import('$lib/deviceAccount')>('$lib/deviceAccount');
	return {
		...actual,
		readDeviceAccount: device.read,
		writeDeviceAccount: device.write,
		deleteDeviceAccount: device.remove
	};
});
vi.mock('$lib/push/device', () => ({ removeThisDevice: async () => undefined }));

import { ApiError } from '$lib/api';
import { loadSession, refreshSession, session } from './session.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	session.status = 'loading';
	session.identity = null;
	session.loadFailed = false;
	session.offline = false;
	session.flash = null;
});

describe('loadSession', () => {
	it('stores the identity and bundle on this device after an answer', async () => {
		api.apiGet.mockResolvedValue({ userId: 'u1', username: 'sam', role: 'member', bundle: wire });
		await loadSession();
		expect(session.status).toBe('locked');
		expect(session.offline).toBe(false);
		expect(device.write).toHaveBeenCalledWith({
			userId: 'u1',
			username: 'sam',
			role: 'member',
			bundle: wire
		});
	});

	it('starts locked from the device cache when the network is down', async () => {
		api.apiGet.mockRejectedValue(new ApiError(0, 'network'));
		device.read.mockResolvedValue({ userId: 'u1', username: 'sam', role: 'admin', bundle: wire });
		await loadSession();
		expect(session.status).toBe('locked');
		expect(session.offline).toBe(true);
		expect(session.loadFailed).toBe(false);
		expect(session.identity).toEqual({ userId: 'u1', username: 'sam', role: 'admin' });
	});

	it('keeps the unreachable screen when nothing is cached', async () => {
		api.apiGet.mockRejectedValue(new ApiError(0, 'network'));
		device.read.mockResolvedValue(null);
		await loadSession();
		expect(session.status).toBe('loading');
		expect(session.loadFailed).toBe(true);
	});

	it('does not use the cache on a server error', async () => {
		api.apiGet.mockRejectedValue(new ApiError(500, 'server_error'));
		await loadSession();
		expect(device.read).not.toHaveBeenCalled();
		expect(session.loadFailed).toBe(true);
	});

	it('signs out and deletes the cache on 401', async () => {
		api.apiGet.mockRejectedValue(new ApiError(401, 'unauthenticated'));
		await loadSession();
		expect(session.status).toBe('signed-out');
		expect(device.remove).toHaveBeenCalled();
	});
});

describe('refreshSession', () => {
	it('refreshes identity and cache once the server answers', async () => {
		api.apiGet.mockRejectedValueOnce(new ApiError(0, 'network'));
		device.read.mockResolvedValue({ userId: 'u1', username: 'sam', role: 'member', bundle: wire });
		await loadSession();
		api.apiGet.mockResolvedValue({ userId: 'u1', username: 'sam2', role: 'member', bundle: wire });
		expect(await refreshSession()).toBe(true);
		expect(session.offline).toBe(false);
		expect(session.identity?.username).toBe('sam2');
		expect(device.write).toHaveBeenCalled();
	});

	it('leaves the state alone when the server is still unreachable', async () => {
		session.status = 'locked';
		session.identity = { userId: 'u1', username: 'sam', role: 'member' };
		api.apiGet.mockRejectedValue(new ApiError(0, 'network'));
		expect(await refreshSession()).toBe(false);
		expect(session.status).toBe('locked');
	});

	it('does nothing when signed out', async () => {
		session.status = 'signed-out';
		expect(await refreshSession()).toBe(false);
		expect(api.apiGet).not.toHaveBeenCalled();
	});
});
