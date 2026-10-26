import { afterEach, describe, expect, it, vi } from 'vitest';
import { connection, onReconnect, setOnline } from './connection.svelte';

afterEach(() => {
	setOnline(true);
});

describe('connection state', () => {
	it('starts online and follows setOnline', () => {
		expect(connection.online).toBe(true);
		setOnline(false);
		expect(connection.online).toBe(false);
	});

	it('runs reconnect hooks only on offline to online', () => {
		const hook = vi.fn();
		const off = onReconnect(hook);
		expect(setOnline(true)).toBe(false); // already online
		expect(setOnline(false)).toBe(false);
		expect(setOnline(false)).toBe(false);
		expect(hook).not.toHaveBeenCalled();
		expect(setOnline(true)).toBe(true);
		expect(hook).toHaveBeenCalledTimes(1);
		expect(setOnline(true)).toBe(false);
		expect(hook).toHaveBeenCalledTimes(1);
		off();
		setOnline(false);
		setOnline(true);
		expect(hook).toHaveBeenCalledTimes(1);
	});

	it('keeps going when a hook throws', () => {
		const second = vi.fn();
		const offA = onReconnect(() => {
			throw new Error('boom');
		});
		const offB = onReconnect(second);
		setOnline(false);
		setOnline(true);
		expect(second).toHaveBeenCalledTimes(1);
		offA();
		offB();
	});
});
