import { openDetail, openDose, openLog, openNote } from './editor.svelte';
import { store } from './store.svelte';

/** Opens the sheet that edits the entry `id` (the right one for its kind). `type` is read from the store when not given. */
export function openEntry(id: string, type: string | undefined = store.items[id]?.payload.type): void {
	if (!type) return;
	if (type === 'note') openNote(id);
	else if (
		type === 'feeling' ||
		type === 'sleep' ||
		type === 'bowel' ||
		type === 'gut' ||
		type === 'food' ||
		type === 'drink' ||
		type === 'pain' ||
		type === 'period' ||
		type === 'bladder' ||
		type === 'measurement'
	)
		openLog(type, { id });
	else if (type === 'dose') {
		const p = store.items[id]?.payload;
		if (p?.type === 'dose') openDose({ id, medicationId: p.medicationId, slot: p.slot });
	} else openDetail(id);
}
