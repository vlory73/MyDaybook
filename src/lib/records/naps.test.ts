import { describe, expect, it } from 'vitest';
import type { StoredRecord } from './codec';
import { napId, planNapConversion, runNapConversion } from './naps';
import { parsePayload, type Payload, type SleepPayload } from './types';

// Synthetic data only.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NIGHT_ID = '0b9c1c52-7f43-4b9e-9d0a-5d5d7a1f2e11';
const legacy: SleepPayload = {
	v: 1,
	type: 'sleep',
	asleepAt: '2026-10-17T23:50:00+02:00',
	at: '2026-10-18T07:10:00+02:00',
	quality: 4,
	note: 'ok',
	naps: [
		{ from: '2026-10-18T13:20:00+02:00', to: '2026-10-18T14:05:00+02:00' },
		{ from: '2026-10-18T17:00:00+02:00', to: '2026-10-18T17:30:00+02:00' }
	]
};
const rec = (id: string, payload: Payload): StoredRecord => ({ id, rev: 1, updatedAt: 1, payload });

describe('nap record ids', () => {
	it('are deterministic, differ by index and night, and pass the server id check', async () => {
		const a = await napId(NIGHT_ID, 0);
		expect(a).toMatch(UUID_V4);
		expect(await napId(NIGHT_ID, 0)).toBe(a);
		expect(await napId(NIGHT_ID, 1)).not.toBe(a);
		expect(await napId('1b9c1c52-7f43-4b9e-9d0a-5d5d7a1f2e11', 0)).not.toBe(a);
	});
});

describe('planning the nap conversion', () => {
	it('turns each legacy nap into its own record and the night into one without naps', async () => {
		const plan = await planNapConversion([rec(NIGHT_ID, legacy)]);
		expect(plan).toHaveLength(1);
		const step = plan[0]!;
		expect(step.nightId).toBe(NIGHT_ID);
		expect(step.naps.map((n) => n.payload)).toEqual([
			{
				v: 1,
				type: 'sleep',
				kind: 'nap',
				asleepAt: '2026-10-18T13:20:00+02:00',
				at: '2026-10-18T14:05:00+02:00'
			},
			{
				v: 1,
				type: 'sleep',
				kind: 'nap',
				asleepAt: '2026-10-18T17:00:00+02:00',
				at: '2026-10-18T17:30:00+02:00'
			}
		]);
		expect(step.naps[0]!.id).toBe(await napId(NIGHT_ID, 0));
		expect(step.naps[1]!.id).toBe(await napId(NIGHT_ID, 1));
		expect('naps' in step.night).toBe(false);
		expect(step.night).toMatchObject({ quality: 4, note: 'ok', asleepAt: legacy.asleepAt });
		for (const p of [...step.naps.map((n) => n.payload), step.night]) expect(parsePayload(p)).not.toBeNull();
	});

	it('plans nothing for nights without naps, naps and other records', async () => {
		const plain: SleepPayload = { ...legacy };
		delete plain.naps;
		const nap: SleepPayload = { v: 1, type: 'sleep', kind: 'nap', asleepAt: legacy.asleepAt, at: legacy.at };
		expect(
			await planNapConversion([
				rec('a', plain),
				rec('b', { ...legacy, naps: [] }),
				rec('c', nap),
				rec('d', { v: 1, type: 'note', at: legacy.at, text: 'x', tags: [] })
			])
		).toEqual([]);
	});

	it('is idempotent: after running the plan, planning again finds nothing', async () => {
		const store = new Map<string, Payload>([[NIGHT_ID, legacy]]);
		const records = () => [...store].map(([id, p]) => rec(id, p));
		await runNapConversion(await planNapConversion(records()), async (p, id) => void store.set(id, p));
		expect(store.size).toBe(3);
		expect(await planNapConversion(records())).toEqual([]);
	});

	it('saves the naps before the night and gives two devices the same records', async () => {
		const run = async () => {
			const written = new Map<string, Payload>();
			const order: string[] = [];
			await runNapConversion(await planNapConversion([rec(NIGHT_ID, legacy)]), async (p, id) => {
				order.push(id);
				written.set(id, p);
			});
			return { written, order };
		};
		const one = await run();
		const two = await run();
		expect(one.order.at(-1)).toBe(NIGHT_ID);
		expect(one.order).toHaveLength(3);
		expect(one.written).toEqual(two.written);
	});

	it('only adds the naps that are missing after an interrupted run', async () => {
		const first = await napId(NIGHT_ID, 0);
		const nap: SleepPayload = {
			v: 1,
			type: 'sleep',
			kind: 'nap',
			asleepAt: legacy.naps![0]!.from,
			at: legacy.naps![0]!.to
		};
		const plan = await planNapConversion([rec(NIGHT_ID, legacy), rec(first, nap)]);
		expect(plan[0]!.naps).toHaveLength(1);
		expect(plan[0]!.naps[0]!.id).toBe(await napId(NIGHT_ID, 1));
	});
});
