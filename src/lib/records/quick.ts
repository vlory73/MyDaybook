/** One-tap saves (mood card, "Again?" repeats): save at once, then offer Undo instead of asking first. */
import { showToast } from '$lib/components/toast.svelte';
import { t } from '$lib/i18n/index.svelte';
import type { MessageKey } from '$lib/i18n/en';
import { remove, save } from './store.svelte';
import type { Payload } from './types';

export async function quickSave(payload: Payload, message: MessageKey): Promise<void> {
	try {
		const id = await save(payload);
		showToast(t(message), () => {
			remove(id).catch(() => showToast(t('entry.error.delete')));
		});
	} catch {
		showToast(t('entry.error.save'));
	}
}
