<script lang="ts">
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Sheet from './Sheet.svelte';
	import { showToast } from './toast.svelte';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import { closeEditors, editor } from '$lib/records/editor.svelte';
	import { markGone, removeFromEpisode, renameEpisode, reopen, unlinkAll } from '$lib/records/episodeActions';
	import { dayDots, episodeRange, episodeView, formatDay } from '$lib/records/episodes';
	import { MAX_EPISODE_NAME, heatStep } from '$lib/records/pain';
	import { painSummary } from '$lib/records/painEntry';
	import { allRecords } from '$lib/records/store.svelte';
	import { timeOf, todayKey } from '$lib/records/time';

	/**
	 * One pain episode: its name, the days it covers, the entries linked to it, and the ways to end, reopen or unlink
	 * it. Descriptive only: it shows what the person logged and never rates it.
	 */
	const SHOWN = 4;

	const view = $derived(
		editor.episode ? episodeView(allRecords(), editor.episode, i18n.locale, todayKey()) : undefined
	);
	const dots = $derived(view ? dayDots(view) : []);
	let all = $state(false);
	let renaming = $state(false);
	let draft = $state('');
	let busy = $state(false);

	// A fresh sheet starts collapsed and not renaming.
	$effect(() => {
		if (editor.episode) {
			all = false;
			renaming = false;
		}
	});

	const entries = $derived(view ? [...view.entries].reverse() : []);
	const shown = $derived(all ? entries : entries.slice(0, SHOWN));
	const sub = $derived(
		view
			? view.ongoing
				? t('episode.sub.open', {
						range: episodeRange(i18n.locale, view),
						entries: tn('trends.entries', view.entries.length),
						days: tn('trends.days', view.spanDays)
					})
				: t('episode.sub.ended', {
						range: episodeRange(i18n.locale, view),
						days: tn('trends.days', view.spanDays)
					})
			: ''
	);

	const when = (at: string) => `${formatDay(i18n.locale, at.slice(0, 10))} · ${timeOf(at)}`;

	/** Day label under a dot: the day number, with the month on the first dot and where the month changes. */
	function dotLabel(day: string, i: number): string {
		const first = i === 0 || day.slice(0, 7) !== dots[i - 1]!.day.slice(0, 7);
		return first ? formatDay(i18n.locale, day) : String(Number(day.slice(8)));
	}

	async function run(job: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await job();
		} catch {
			showToast(t('entry.error.save'));
		} finally {
			busy = false;
		}
	}

	const startRename = () => {
		draft = view?.renamed ? view.name : '';
		renaming = true;
	};
	const saveName = () =>
		run(async () => {
			if (!view) return;
			await renameEpisode(view.id, draft);
			renaming = false;
		});

	const gone = () =>
		run(async () => {
			if (!view) return;
			await markGone(view.id);
			showToast(t('episode.toast.gone'));
		});
	const reopened = () =>
		run(async () => {
			if (!view) return;
			await reopen(view.id);
			showToast(t('episode.toast.reopened'));
		});

	function undoToast(message: string, undo: () => Promise<void>) {
		showToast(message, () => {
			undo().then(
				() => showToast(t('episode.toast.restored')),
				() => showToast(t('entry.error.save'))
			);
		});
	}

	const removeOne = (entryId: string) =>
		run(async () => {
			if (!view) return;
			const closing = view.entries.length <= 1;
			const undo = await removeFromEpisode(view, entryId);
			if (closing) closeEditors();
			undoToast(t('episode.toast.removed'), undo);
		});
	const unlinkEverything = () =>
		run(async () => {
			if (!view) return;
			const undo = await unlinkAll(view);
			closeEditors();
			undoToast(t('episode.toast.unlinked'), undo);
		});
</script>

<Sheet
	bind:open={() => editor.episode !== null && view !== undefined, (v) => !v && closeEditors()}
	title={view?.name ?? ''}
>
	{#snippet header()}
		{#if view && !renaming}
			<button type="button" class="link" onclick={startRename}>
				<Icon name="notebook-pen" size={16} />{t('episode.rename')}
			</button>
		{/if}
	{/snippet}
	{#if view}
		{#if renaming}
			<form
				class="rename"
				onsubmit={(e) => {
					e.preventDefault();
					void saveName();
				}}
			>
				<label class="label" for="episode-name">{t('episode.rename.label')}</label>
				<input
					id="episode-name"
					type="text"
					class="field"
					maxlength={MAX_EPISODE_NAME}
					placeholder={view.name}
					bind:value={draft}
				/>
				<p class="muted small">{t('episode.rename.hint')}</p>
				<div class="row">
					<Button variant="quiet" onclick={() => (renaming = false)}>{t('common.cancel')}</Button>
					<Button type="submit" disabled={busy}>{t('common.save')}</Button>
				</div>
			</form>
		{/if}

		<p class="sub">{sub}</p>

		<p class="label">{t('episode.dots.title')}</p>
		<div class="strip" data-testid="episode-days">
			{#each dots as d, i (d.day)}
				<div class="dd">
					{#if d.max === null}
						<span
							class="dot empty"
							role="img"
							aria-label={t('episode.dot.empty', { day: formatDay(i18n.locale, d.day) })}
						></span>
					{:else}
						<span
							class="dot"
							role="img"
							aria-label={t('episode.dot.value', { day: formatDay(i18n.locale, d.day), n: d.max })}
							style:background="var(--heat-{heatStep(d.max)})"
							style:color={heatStep(d.max) >= 4 ? 'var(--on-heat-hi)' : 'var(--text)'}>{d.max}</span
						>
					{/if}
					<small aria-hidden="true">{dotLabel(d.day, i)}</small>
				</div>
			{/each}
		</div>

		<p class="label">
			{t('episode.entries.title')}
			{#if entries.length > SHOWN}
				<span class="hint">{t('episode.entries.showing', { n: shown.length, total: entries.length })}</span>
			{/if}
		</p>
		<ul class="elist">
			{#each shown as e (e.id)}
				<li>
					<div class="what-wrap">
						<div class="when">{when(e.payload.at)}</div>
						<div class="what">{painSummary(i18n.locale, e.payload.points)}</div>
					</div>
					<button
						type="button"
						class="link"
						disabled={busy}
						aria-label={t('episode.remove.aria', { when: when(e.payload.at) })}
						onclick={() => removeOne(e.id)}>{t('episode.remove')}</button
					>
				</li>
			{/each}
		</ul>
		{#if entries.length > SHOWN}
			<button type="button" class="link more" onclick={() => (all = !all)}>
				{all ? t('episode.entries.fewer') : t('episode.entries.all', { n: entries.length })}
			</button>
		{/if}

		<div class="main">
			{#if view.ongoing}
				<Button block disabled={busy} onclick={gone}
					><Icon name="check" size={18} />{t('episode.gone')}</Button
				>
			{:else}
				<Button block variant="quiet" disabled={busy} onclick={reopened}
					><Icon name="rotate-ccw" size={18} />{t('episode.reopen')}</Button
				>
			{/if}
		</div>
		<div class="quietrow">
			<p class="muted small">{t('episode.keep')}</p>
			<Button variant="quiet" size="sm" disabled={busy} onclick={unlinkEverything}
				>{t('episode.unlink')}</Button
			>
		</div>
	{/if}
</Sheet>

<style>
	.link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 36px;
		padding: 0 4px;
		color: var(--primary);
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
	.link:disabled {
		opacity: 0.5;
	}
	.more {
		margin-top: var(--sp-1);
	}
	.sub {
		font-size: var(--fs-callout);
		color: var(--text-2);
		margin: calc(-1 * var(--sp-2)) 0 var(--sp-3);
	}
	.label {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.hint {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.rename {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}
	.rename .label {
		margin: 0;
	}
	.field {
		min-height: var(--tap);
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
	}
	.field:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-3);
	}
	.strip {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: var(--sp-1);
		margin: 0 calc(-1 * var(--gutter));
		padding-inline: var(--gutter);
	}
	.dd {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		min-width: 40px;
		flex: none;
	}
	.dd small {
		font-size: 11px;
		color: var(--text-2);
		white-space: nowrap;
	}
	.dot {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: var(--fw-bold);
		font-size: var(--fs-callout);
	}
	.dot.empty {
		border: 1.5px solid var(--text-3);
	}
	.elist {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.elist li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-2);
		padding: 4px 0;
		border-top: 1px solid var(--line);
	}
	.elist li:first-child {
		border-top: 0;
	}
	.what-wrap {
		min-width: 0;
	}
	.when {
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.what {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
		overflow-wrap: anywhere;
	}
	.main {
		margin-top: var(--sp-4);
	}
	.quietrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.quietrow p {
		flex: 1;
	}
</style>
