import type { DoseSlot } from './types';

export type LogKind = 'feeling' | 'sleep' | 'measurement' | 'bowel' | 'gut' | 'food';

/** Which entry sheet is open. The layout renders the sheets; any screen can open one. */
export const editor = $state<{
	/** The note sheet: `{ id }` to edit, `{ id: null }` for a new note. */
	note: { id: string | null } | null;
	/** The other entry sheets: `id` to edit, null for a new entry; `typeId` preselects a measurement type. */
	log: { kind: LogKind; id: string | null; typeId?: string } | null;
	/** The medication set-up sheet: `{ id }` to edit, `{ id: null }` for a new medication. */
	med: { id: string | null } | null;
	/**
	 * The dose sheet: `id` to edit a logged dose, null for a new one; `slot` is absent for as-needed doses.
	 */
	dose: { id: string | null; medicationId: string; slot?: DoseSlot } | null;
	/** Read-only detail of an entry whose sheet does not exist yet. */
	detail: string | null;
}>({ note: null, log: null, med: null, dose: null, detail: null });

export const openNote = (id: string | null = null) => {
	editor.note = { id };
};
export const openLog = (kind: LogKind, options: { id?: string | null; typeId?: string } = {}) => {
	editor.log = { kind, id: options.id ?? null, typeId: options.typeId };
};
export const openMedication = (id: string | null = null) => {
	editor.med = { id };
};
export const openDose = (target: { id?: string | null; medicationId: string; slot?: DoseSlot }) => {
	editor.dose = { id: target.id ?? null, medicationId: target.medicationId, slot: target.slot };
};
export const openDetail = (id: string) => {
	editor.detail = id;
};
export const closeEditors = () => {
	editor.note = null;
	editor.log = null;
	editor.med = null;
	editor.dose = null;
	editor.detail = null;
};
