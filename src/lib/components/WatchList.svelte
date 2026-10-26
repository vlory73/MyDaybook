<script lang="ts">
	import Card from './Card.svelte';
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import { iconNames, type IconName } from './icon-names';
	import { showToast } from './toast.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { sensitivityName } from '$lib/records/format';
	import { allRecords, remove, save } from '$lib/records/store.svelte';
	import { deletedText } from '$lib/records/syncText';
	import { SUGGESTIONS, suggestionLabel, watchedItems } from '$lib/records/watch';

	/** `bare` leaves out the card, for use inside a sheet. */
	let { bare = false }: { bare?: boolean } = $props();

	/** "What I watch in food": the person's own list of intolerances and allergens (descriptive records only). */
	const items = $derived(watchedItems(allRecords()));
	const available = $derived(
		SUGGESTIONS.filter((s) => !items.some((w) => w.payload.label === suggestionLabel(s.id)))
	);
	let custom = $state('');
	let failed = $state(false);

	const nextOrder = () => items.reduce((max, w) => Math.max(max, w.payload.order + 1), 0);
	const iconFor = (icon: string): IconName =>
		((iconNames as readonly string[]).includes(icon) ? icon : 'utensils') as IconName;

	async function run(action: () => Promise<unknown>) {
		failed = false;
		try {
			await action();
		} catch {
			failed = true;
		}
	}

	const addSuggestion = (id: string) =>
		run(() => {
			const s = SUGGESTIONS.find((x) => x.id === id)!;
			return save({
				v: 1,
				type: 'sensitivity',
				label: suggestionLabel(id),
				icon: s.icon,
				kind: s.kind,
				order: nextOrder()
			});
		});

	async function addCustom() {
		const label = custom.trim().slice(0, 60);
		if (!label) return;
		if (items.some((w) => sensitivityName(w.payload.label).toLowerCase() === label.toLowerCase())) {
			custom = '';
			return;
		}
		await run(() =>
			save({ v: 1, type: 'sensitivity', label, icon: 'utensils', kind: 'other', order: nextOrder() })
		);
		custom = '';
	}

	/** Moves an item by swapping its position with a neighbour. */
	const move = (index: number, by: -1 | 1) =>
		run(async () => {
			const a = items[index];
			const b = items[index + by];
			if (!a || !b) return;
			// Orders are rewritten as positions, so equal or gappy numbers cannot cause surprises.
			const order = items.map((w) => w.id);
			[order[index], order[index + by]] = [order[index + by]!, order[index]!];
			await Promise.all(
				order.flatMap((id, position) => {
					const w = items.find((x) => x.id === id)!;
					return w.payload.order === position ? [] : [save({ ...w.payload, order: position }, id)];
				})
			);
		});

	async function drop(id: string, name: string) {
		await run(async () => {
			const undo = await remove(id);
			showToast(deletedText(t('watch.removed', { name }), id), () => {
				undo().catch(() => showToast(t('entry.error.save')));
			});
		});
	}
</script>

{#snippet body()}
	<p class="muted small lead">{t('watch.lead')}</p>

	{#if items.length === 0}
		<p class="muted">{t('watch.empty')}</p>
	{:else}
		<ul class="list">
			{#each items as w, i (w.id)}
				{@const name = sensitivityName(w.payload.label)}
				<li>
					<Icon name={iconFor(w.payload.icon)} size={20} />
					<span class="name">{name}</span>
					<button
						type="button"
						aria-label={t('watch.up', { name })}
						disabled={i === 0}
						onclick={() => move(i, -1)}
						><span class="flip"><Icon name="chevron-down" size={18} /></span></button
					>
					<button
						type="button"
						aria-label={t('watch.down', { name })}
						disabled={i === items.length - 1}
						onclick={() => move(i, 1)}><Icon name="chevron-down" size={18} /></button
					>
					<button type="button" aria-label={t('watch.remove', { name })} onclick={() => drop(w.id, name)}
						><Icon name="x" size={18} /></button
					>
				</li>
			{/each}
		</ul>
	{/if}

	{#if available.length > 0}
		<p class="label">{t('watch.suggestions')}</p>
		<div class="chips">
			{#each available as s (s.id)}
				<Chip onclick={() => addSuggestion(s.id)}
					><Icon name="plus" size={14} />{t(`sens.${s.id}` as MessageKey)}</Chip
				>
			{/each}
		</div>
	{/if}

	<form
		class="own"
		onsubmit={(e) => {
			e.preventDefault();
			void addCustom();
		}}
	>
		<input
			aria-label={t('watch.custom')}
			placeholder={t('watch.custom')}
			maxlength="60"
			bind:value={custom}
		/>
		<button type="submit" class="go">{t('common.add')}</button>
	</form>
	{#if failed}<p class="muted small" role="alert">{t('entry.error.save')}</p>{/if}
{/snippet}

{#if bare}
	{@render body()}
{:else}
	<Card title={t('watch.heading')}>{@render body()}</Card>
{/if}

<style>
	.lead {
		margin-bottom: var(--sp-3);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 48px;
		color: var(--food-ink);
	}
	.name {
		flex: 1;
		min-width: 0;
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	li button {
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		color: var(--text-2);
	}
	li button:disabled {
		opacity: 0.3;
	}
	.flip {
		display: grid;
		transform: rotate(180deg);
	}
	.label {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.own {
		display: flex;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.own input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
	}
	.own input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.go {
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		background: var(--primary-soft);
		color: var(--primary-press);
		font-weight: var(--fw-semibold);
	}
</style>
