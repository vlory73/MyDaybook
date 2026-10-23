import { planNapConversion, runNapConversion } from './naps';
import { allRecords, save } from './store.svelte';

let running = false;

/** Converts legacy nap lists on this device. Quiet by design: errors are swallowed and retried after the next sync. */
export async function convertLegacyNaps(): Promise<void> {
	if (running) return;
	running = true;
	try {
		const steps = await planNapConversion(allRecords());
		if (steps.length > 0) await runNapConversion(steps, (payload, id) => save(payload, id));
	} catch {
		// Offline or conflicting: nothing to tell the person, the next sync pass tries again.
	} finally {
		running = false;
	}
}
