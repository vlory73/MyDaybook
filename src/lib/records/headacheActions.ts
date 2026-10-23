/**
 * The headache card on Today, the parts that write to the store. Both answers change the SAME entry (no new entry);
 * the pure rules are in `headacheStill.ts`.
 */
import { markGone } from './episodeActions';
import { hourOf, withLastSeen, withStopped } from './headacheStill';
import { save, store } from './store.svelte';

const entry = (id: string) => {
	const p = store.items[id]?.payload;
	return p?.type === 'pain' ? p : undefined;
};

/** "Still there": notes the current hour on the entry. */
export async function noteStillThere(id: string, now = new Date()): Promise<void> {
	const p = entry(id);
	if (p) await save(withLastSeen(p, hourOf(now)), id);
}

/**
 * "It's gone": writes the stop hour on the entry. When the entry is in an ongoing episode, the episode ends too
 * (`markGone`, as the general "It's gone" does).
 */
export async function stopHeadache(id: string, stopped: string, ongoingEpisodeId?: string): Promise<void> {
	const p = entry(id);
	if (!p) return;
	await save(withStopped(p, stopped), id);
	if (ongoingEpisodeId) await markGone(ongoingEpisodeId);
}
