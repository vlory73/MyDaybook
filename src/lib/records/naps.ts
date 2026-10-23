/**
 * One-time conversion of the old "naps inside a night" list into separate nap records (ARCHITECTURE §5).
 * The plan is pure and deterministic: a nap's record id comes from (night id, index), so two devices that convert
 * at the same time write the same records. Naps are saved first and the night last, so an interrupted run just
 * repeats. Nothing here logs content.
 */
import type { StoredRecord } from './codec';
import type { Payload, SleepPayload } from './types';

export type NapStep = {
	nightId: string;
	/** Nap records that do not exist yet. */
	naps: { id: string; payload: SleepPayload }[];
	/** The night again, without its `naps`. */
	night: SleepPayload;
};

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A version 4 shaped id taken from SHA-256 of `<night id>:nap:<index>` (the server accepts only that shape). */
export async function napId(nightId: string, index: number): Promise<string> {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${nightId}:nap:${index}`))
	);
	const b = digest.slice(0, 16);
	b[6] = (b[6]! & 0x0f) | 0x40;
	b[8] = (b[8]! & 0x3f) | 0x80;
	const h = hex(b);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** What to save so that every legacy `naps` list becomes separate records. Empty when nothing is left to convert. */
export async function planNapConversion(records: Iterable<StoredRecord>): Promise<NapStep[]> {
	const all = [...records];
	const existing = new Set(all.map((r) => r.id));
	const steps: NapStep[] = [];
	for (const r of all) {
		const p: Payload = r.payload;
		if (p.type !== 'sleep' || !p.naps || p.naps.length === 0) continue;
		const naps: NapStep['naps'] = [];
		for (const [i, n] of p.naps.entries()) {
			const id = await napId(r.id, i);
			if (existing.has(id)) continue;
			naps.push({ id, payload: { v: 1, type: 'sleep', kind: 'nap', asleepAt: n.from, at: n.to } });
		}
		const night: SleepPayload = { ...p };
		delete night.naps;
		steps.push({ nightId: r.id, naps, night });
	}
	return steps;
}

/** Runs a plan with the given writer: naps first, then the night. Stops at the first failure (retried next time). */
export async function runNapConversion(
	steps: NapStep[],
	write: (payload: Payload, id: string) => Promise<unknown>
): Promise<void> {
	for (const step of steps) {
		for (const n of step.naps) await write(n.payload, n.id);
		await write(step.night, step.nightId);
	}
}
