export type LogKind = 'feeling' | 'sleep' | 'measurement' | 'bowel';

/** Which entry sheet is open. The layout renders the sheets; any screen can open one. */
export const editor = $state<{
	/** The note sheet: `{ id }` to edit, `{ id: null }` for a new note. */
	note: { id: string | null } | null;
	/** The other entry sheets: `id` to edit, null for a new entry; `typeId` preselects a measurement type. */
	log: { kind: LogKind; id: string | null; typeId?: string } | null;
	/** Read-only detail of an entry whose sheet does not exist yet. */
	detail: string | null;
}>({ note: null, log: null, detail: null });

export const openNote = (id: string | null = null) => {
	editor.note = { id };
};
export const openLog = (kind: LogKind, options: { id?: string | null; typeId?: string } = {}) => {
	editor.log = { kind, id: options.id ?? null, typeId: options.typeId };
};
export const openDetail = (id: string) => {
	editor.detail = id;
};
export const closeEditors = () => {
	editor.note = null;
	editor.log = null;
	editor.detail = null;
};
