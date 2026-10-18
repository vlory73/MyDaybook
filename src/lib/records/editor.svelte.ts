/** Which entry sheet is open. The layout renders the sheets; any screen can open one. */
export const editor = $state<{
	/** The note sheet: `{ id }` to edit, `{ id: null }` for a new note. */
	note: { id: string | null } | null;
	/** Read-only detail of an entry whose sheet does not exist yet. */
	detail: string | null;
}>({ note: null, detail: null });

export const openNote = (id: string | null = null) => {
	editor.note = { id };
};
export const openDetail = (id: string) => {
	editor.detail = id;
};
export const closeEditors = () => {
	editor.note = null;
	editor.detail = null;
};
