/** Pure helpers for "Log another medicine": name suggestions, matching by name, and the medication it creates. */
import type { StoredRecord } from '$lib/records/codec';
import type { MedicationPayload } from '$lib/records/types';

const norm = (s: string) => s.trim().toLowerCase();

const medications = (all: StoredRecord[]) =>
	all.flatMap((r) =>
		r.payload.type === 'medication' ? [{ id: r.id, updatedAt: r.updatedAt, m: r.payload }] : []
	);

/** Names of all medications (active and archived), de-duplicated case-insensitively and sorted, for suggestions. */
export function medicationNames(all: StoredRecord[], locale?: string): string[] {
	const seen = new Map<string, string>();
	for (const { m } of medications(all)) {
		const name = m.name.trim();
		if (name && !seen.has(norm(name))) seen.set(norm(name), name);
	}
	return [...seen.values()].sort((a, b) => a.localeCompare(b, locale));
}

/** The medication whose name equals `name` (case-insensitive, trimmed): active first, then newest, then id. */
export function findByName(
	all: StoredRecord[],
	name: string
): { id: string; medication: MedicationPayload } | null {
	const key = norm(name);
	if (!key) return null;
	const hits = medications(all).filter((x) => norm(x.m.name) === key);
	hits.sort(
		(a, b) =>
			Number(a.m.archived) - Number(b.m.archived) ||
			b.updatedAt - a.updatedAt ||
			(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);
	const best = hits[0];
	return best ? { id: best.id, medication: best.m } : null;
}

/** The "when needed" medication created for a medicine that was not in the list. `day` is "YYYY-MM-DD". */
export function adhocMedication(name: string, day: string, keep: boolean): MedicationPayload {
	return {
		v: 1,
		type: 'medication',
		name: name.trim(),
		form: 'other',
		schedule: { kind: 'as_needed' },
		times: [],
		start: day,
		reminders: false,
		archived: !keep
	};
}
