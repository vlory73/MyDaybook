/** One-tap dose logging for Today, Meds and the quick-log sheet. Save at once, then offer one Undo for the whole tap. */
import { showToast } from '$lib/components/toast.svelte';
import { t } from '$lib/i18n/index.svelte';
import { remove, save } from '$lib/records/store.svelte';
import { savedText } from '$lib/records/syncText';
import { todayKey } from '$lib/records/time';
import { defaultAt, slotDose, type DueDose } from './due';

/**
 * Logs every dose in `doses` as taken ("All taken", or the Taken button of a single row) and shows one Undo toast that
 * removes them all. Doses that already have a record are left alone. The amount is copied from the medication's time
 * row; nothing is calculated.
 */
export async function takeDoses(doses: DueDose[]): Promise<void> {
	const todo = doses.filter((d) => d.dose === null);
	if (todo.length === 0) return;
	const now = new Date();
	const today = todayKey(now);
	const results = await Promise.allSettled(
		todo.map((d) => save(slotDose(d, 'taken', defaultAt(d.slot, now, today))))
	);
	const ids = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
	if (ids.length < todo.length) {
		showToast(t('entry.error.save'));
		return;
	}
	showToast(savedText(t('dose.toast.taken'), ...ids), () => {
		Promise.all(ids.map((id) => remove(id))).catch(() => showToast(t('entry.error.delete')));
	});
}
