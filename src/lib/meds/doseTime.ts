/**
 * Which time and medicine the dose sheet stores. Pure: the person's picks win; nothing is calculated or judged
 * (not a medical device).
 */
import type { StoredRecord } from '$lib/records/codec';
import type { DoseSlot, DoseStatus, MedicationPayload, Payload } from '$lib/records/types';
import { formatAt } from '$lib/records/time';
import { defaultAt } from './due';

/** The time the sheet opens with: the logged time if there is one, else now (today) or the planned time (past day). */
export function initialDoseAt(
	existingAt: string | undefined,
	slot: DoseSlot | undefined,
	now: Date,
	today: string
): string {
	if (existingAt) return existingAt;
	return slot ? defaultAt(slot, now, today) : formatAt(now);
}

/** Whether the sheet asks for a time: always for an as-needed dose, for a scheduled one unless it is Skipped. */
export const asksForTime = (slot: DoseSlot | undefined, status: DoseStatus): boolean =>
	!slot || status !== 'skipped';

/** The stored time: the picked one for taken, late and as-needed doses; a skipped dose keeps its time or the default. */
export function storedDoseAt(
	status: DoseStatus,
	slot: DoseSlot | undefined,
	picked: string,
	existingAt: string | undefined,
	now: Date,
	today: string
): string {
	if (!asksForTime(slot, status)) return existingAt ?? defaultAt(slot!, now, today);
	return picked;
}

/** Medicines an as-needed dose can be assigned to: active as-needed ones plus the dose's current one, by name. */
export function medicineChoices(
	all: Iterable<StoredRecord<Payload>>,
	currentId: string
): { id: string; name: string }[] {
	const out: { id: string; name: string }[] = [];
	for (const r of all) {
		const p = r.payload;
		if (p.type !== 'medication') continue;
		const m = p as MedicationPayload;
		if (r.id === currentId || (!m.archived && m.schedule.kind === 'as_needed'))
			out.push({ id: r.id, name: m.name });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
