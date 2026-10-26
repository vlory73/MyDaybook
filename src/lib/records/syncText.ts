import { t } from '$lib/i18n/index.svelte';
import { store } from './store.svelte';

/**
 * The toast after a save: the usual text when the server has the change, otherwise the calm "saved on this device"
 * line (or the refusal line when the server did not accept it). Call it after `await save(...)`.
 */
export function savedText(normal: string, ...ids: string[]): string {
	if (ids.some((id) => store.pending[id] === 'refused')) return t('outbox.toast.refused');
	return ids.some((id) => store.pending[id]) ? t('outbox.toast.saved') : normal;
}

/** The same for a delete (the Undo button stays on the toast). */
export function deletedText(normal: string, ...ids: string[]): string {
	if (ids.some((id) => store.pending[id] === 'refused')) return t('outbox.toast.refused');
	return ids.some((id) => store.pending[id]) ? t('outbox.toast.deleted') : normal;
}
