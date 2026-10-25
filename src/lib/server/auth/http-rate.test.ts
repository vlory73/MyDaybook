import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./events', () => ({ recordEvent: vi.fn() }));

const fakeEvent = (ip: string) =>
	({ getClientAddress: () => ip, request: new Request('https://x.test/', {}) }) as unknown as RequestEvent;

describe('rateGuard', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('AUTH_RATE_IP_BURST', '2');
		vi.stubEnv('AUTH_RATE_USER_BURST', '5');
	});
	afterEach(() => vi.unstubAllEnvs());

	it('does not touch the user bucket once the IP bucket blocks', async () => {
		const { rateGuard } = await import('./http');
		const { limiters } = await import('./rate-limit');
		rateGuard(fakeEvent('10.0.0.1'), 'login', 'alice');
		rateGuard(fakeEvent('10.0.0.1'), 'login', 'alice');
		expect(limiters.user.size()).toBe(1);
		for (let i = 0; i < 20; i++) {
			expect(() => rateGuard(fakeEvent('10.0.0.1'), 'login', `name${i}`)).toThrow();
		}
		expect(limiters.user.size()).toBe(1); // no bucket per blocked name
		// alice's own bucket was charged twice, not twenty-two times
		rateGuard(fakeEvent('10.0.0.2'), 'login', 'alice');
	});

	it('still limits a user name from several addresses', async () => {
		const { rateGuard } = await import('./http');
		for (let i = 0; i < 5; i++) rateGuard(fakeEvent(`10.0.1.${i}`), 'login', 'bob');
		expect(() => rateGuard(fakeEvent('10.0.1.99'), 'login', 'bob')).toThrow();
	});
});
