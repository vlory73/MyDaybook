/**
 * Due doses for one local day (ARCHITECTURE §5.3). Pure: it lists the slots the active medications schedule on the day
 * (via `slotsOn`) and attaches the dose record the person logged for each one, if any. Nothing is stored until the
 * person acts, and a changed schedule never rewrites history: dose records whose slot no longer exists stay as they are
 * (the timeline shows them) and are simply not part of any slot here. Amounts are passed through verbatim; nothing is
 * counted, totalled or judged (not a medical device).
 */
import { formatAt, fromLocalInput } from '$lib/records/time';
import type { StoredRecord } from '$lib/records/codec';
import type { DosePayload, DoseSlot, DoseStatus, MedicationPayload, Payload } from '$lib/records/types';
import { slotsOn } from './schedule';

type Rec = StoredRecord<Payload>;

export type DueDose = {
	medicationId: string;
	medication: MedicationPayload;
	slot: DoseSlot;
	/** Copied from the medication's time row, exactly as the person typed it ("" when they left it empty). */
	amount: string;
	/** The logged record for this slot, or null while nothing has been logged. */
	dose: StoredRecord<DosePayload> | null;
};

/** All doses scheduled for one clock time. */
export type DueSlot = { time: string; doses: DueDose[] };

const byName = (a: DueDose, b: DueDose) =>
	a.medication.name.localeCompare(b.medication.name) || a.medicationId.localeCompare(b.medicationId);

/** Medications that can be taken whenever needed: active and `as_needed`, by name. */
export function asNeededMedications(all: Iterable<Rec>): { id: string; medication: MedicationPayload }[] {
	const out: { id: string; medication: MedicationPayload }[] = [];
	for (const r of all) {
		const p = r.payload;
		if (p.type === 'medication' && !p.archived && p.schedule.kind === 'as_needed') {
			out.push({ id: r.id, medication: p });
		}
	}
	return out.sort((a, b) => a.medication.name.localeCompare(b.medication.name) || a.id.localeCompare(b.id));
}

/**
 * The slots due on `day`, earliest first, each with its doses by medication name. When a medication lists the same
 * clock time twice, the first row stands for that slot (a dose record is keyed by medication, day and time).
 * If two devices logged the same slot, the most recently updated record is used.
 */
export function dueSlots(all: Iterable<Rec>, day: string): DueSlot[] {
	const logged = new Map<string, StoredRecord<DosePayload>>();
	const meds: { id: string; medication: MedicationPayload }[] = [];
	for (const r of all) {
		const p = r.payload;
		if (p.type === 'medication') meds.push({ id: r.id, medication: p });
		else if (p.type === 'dose' && p.slot && p.slot.date === day) {
			const key = `${p.medicationId}|${p.slot.time}`;
			const seen = logged.get(key);
			if (!seen || r.updatedAt > seen.updatedAt || (r.updatedAt === seen.updatedAt && r.id > seen.id)) {
				logged.set(key, r as StoredRecord<DosePayload>);
			}
		}
	}
	const slots = new Map<string, DueDose[]>();
	for (const { id, medication } of meds) {
		const seenTimes = new Set<string>();
		for (const row of slotsOn(medication, day)) {
			if (seenTimes.has(row.time)) continue;
			seenTimes.add(row.time);
			const list = slots.get(row.time) ?? [];
			list.push({
				medicationId: id,
				medication,
				slot: { date: day, time: row.time },
				amount: row.amount,
				dose: logged.get(`${id}|${row.time}`) ?? null
			});
			slots.set(row.time, list);
		}
	}
	return [...slots.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([time, doses]) => ({ time, doses: doses.sort(byName) }));
}

/** The doses of a slot that nothing has been logged for yet. */
export const pending = (slot: DueSlot): DueDose[] => slot.doses.filter((d) => d.dose === null);

/**
 * When a dose logged with one tap counts as taken: the current moment for today, otherwise (a past day being filled
 * in) the slot's own time on that day.
 */
export function defaultAt(slot: DoseSlot, now: Date, today: string): string {
	if (slot.date === today) return formatAt(now);
	return fromLocalInput(`${slot.date}T${slot.time}`) ?? formatAt(now);
}

/** The payload for a slot dose. `at` and `status` come from the person; the amount is copied, never computed. */
export function slotDose(
	due: Pick<DueDose, 'medicationId' | 'slot' | 'amount'>,
	status: DoseStatus,
	at: string
): DosePayload {
	const p: DosePayload = { v: 1, type: 'dose', at, medicationId: due.medicationId, slot: due.slot, status };
	if (due.amount) p.amount = due.amount;
	return p;
}
