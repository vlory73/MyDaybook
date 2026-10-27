import { describe as suite, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { describe } from './format';
import type { TimedPayload } from './types';

// Synthetic data only.
const timed = (payload: Record<string, unknown>): StoredRecord<TimedPayload> => ({
	id: 'x1',
	rev: 1,
	updatedAt: 1,
	payload: { v: 1, at: '2026-10-27T09:05:00+01:00', ...payload } as TimedPayload
});

suite('timeline text for period and bladder', () => {
	it('reads the period flow and extras', () => {
		const d = describe(timed({ type: 'period', flow: 'medium', extras: ['cramps'] }));
		expect(d.title).toBe('Period · Medium flow');
		expect(d.summary).toBe('Cramps');
		expect(d.category).toBe('period');
		expect(describe(timed({ type: 'period', flow: 'spotting' })).title).toBe('Period · Spotting');
	});

	it('reads a visit with urgency first, then discomfort and the leak, with droplets', () => {
		const d = describe(
			timed({
				type: 'bladder',
				visit: true,
				urgency: 'some',
				discomfort: true,
				leak: { amount: 2, when: 'afterwards' }
			})
		);
		expect(d.title).toBe('Bladder · urgency: some');
		expect(d.summary).toBe('Discomfort · leak afterwards');
		expect(d.leak).toBe(2);
		expect(describe(timed({ type: 'bladder', visit: true })).title).toBe('Bladder');
		const onTheWay = timed({ type: 'bladder', visit: true, leak: { amount: 1, when: 'on_the_way' } });
		expect(describe(onTheWay).title).toBe('Bladder · leak on the way');
	});

	it('reads a leak on its own as "Leak"', () => {
		const d = describe(timed({ type: 'bladder', visit: false, leak: { amount: 1, when: 'moving' } }));
		expect(d.title).toBe('Leak · when moving');
		expect(d.leak).toBe(1);
		expect(describe(timed({ type: 'bladder', visit: false, leak: { amount: 3 } })).title).toBe('Leak');
	});
});
