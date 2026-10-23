/**
 * Pain episodes, the parts that write to the store: create, link, end, rename, and unlink (with Undo). Pure rules
 * live in `episodes.ts`. Each call saves whole records, encrypted like any other.
 */
import { MAX_EPISODE_NAME, type PainEpisodePayload } from './pain';
import { planJoin, withEnded, withEpisode, withName, type EpisodeView, type JoinPlan } from './episodes';
import { remove, save, store } from './store.svelte';
import { formatAt } from './time';

const entryPayload = (id: string) => {
	const p = store.items[id]?.payload;
	return p?.type === 'pain' ? p : undefined;
};
const episodePayload = (id: string) => {
	const p = store.items[id]?.payload;
	return p?.type === 'pain_episode' ? p : undefined;
};

/** Sets, changes or removes the episode link of one saved pain entry. */
export async function linkEntry(entryId: string, episodeId: string | undefined): Promise<void> {
	const p = entryPayload(entryId);
	if (p) await save(withEpisode(p, episodeId), entryId);
}

/** A new episode that starts at `started`; `ended` when it is made already gone. Returns its id. */
export async function createEpisode(started: string, ended?: string, id?: string): Promise<string> {
	const payload: PainEpisodePayload = { v: 1, type: 'pain_episode', started };
	if (ended) payload.ended = ended;
	return save(payload, id);
}

/**
 * For "Same as last time" and "Log today": the plan for the new entry (see `planJoin`). Call `applyJoin` before saving
 * the new entry so the episode exists when the entry points at it.
 */
export function joinPlan(previousId: string): JoinPlan | null {
	const previous = store.items[previousId];
	if (!previous || previous.payload.type !== 'pain') return null;
	return planJoin(
		{ ...previous, payload: previous.payload },
		(id) => episodePayload(id) !== undefined,
		() => crypto.randomUUID()
	);
}

/** Makes the episode a plan asks for (and links the previous entry to it). Safe to repeat. */
export async function applyJoin(plan: JoinPlan): Promise<void> {
	if (!plan.create || episodePayload(plan.episodeId)) return;
	await createEpisode(plan.create.started, undefined, plan.episodeId);
	await linkEntry(plan.create.previousId, plan.episodeId);
}

/** "It's gone": ends the episode now. */
export async function markGone(episodeId: string, now = new Date()): Promise<void> {
	const p = episodePayload(episodeId);
	if (p) await save(withEnded(p, formatAt(now)), episodeId);
}

/** "Not gone yet": clears the end. */
export async function reopen(episodeId: string): Promise<void> {
	const p = episodePayload(episodeId);
	if (p) await save(withEnded(p, undefined), episodeId);
}

/** "It's gone" on the Today card for an entry that has no episode: makes one from the entry and ends it now. */
export async function goneForEntry(entryId: string, now = new Date()): Promise<void> {
	const p = entryPayload(entryId);
	if (!p) return;
	const id = await createEpisode(p.at, formatAt(now));
	await linkEntry(entryId, id);
}

export async function renameEpisode(episodeId: string, name: string): Promise<void> {
	const p = episodePayload(episodeId);
	if (p) await save(withName(p, name.trim().slice(0, MAX_EPISODE_NAME)), episodeId);
}

/** "Unlink all": deletes the episode and clears the link on its entries (they stay). Returns `undo`. */
export async function unlinkAll(view: EpisodeView): Promise<() => Promise<void>> {
	const ids = view.entries.map((e) => e.id);
	const undoRemove = await remove(view.id);
	for (const id of ids) await linkEntry(id, undefined);
	return async () => {
		await undoRemove();
		for (const id of ids) await linkEntry(id, view.id);
	};
}

/**
 * "Remove" on one entry of the sheet: unlinks just that entry. When it was the last one, the episode record goes too.
 * Returns `undo`.
 */
export async function removeFromEpisode(view: EpisodeView, entryId: string): Promise<() => Promise<void>> {
	await linkEntry(entryId, undefined);
	const undoRemove = view.entries.length <= 1 ? await remove(view.id) : undefined;
	return async () => {
		await undoRemove?.();
		await linkEntry(entryId, view.id);
	};
}
