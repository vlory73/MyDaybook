<script lang="ts">
	import CategoryBadge from './CategoryBadge.svelte';
	import Sheet from './Sheet.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { closeEditors, editor } from '$lib/records/editor.svelte';
	import { describe, lookups } from '$lib/records/format';
	import { store } from '$lib/records/store.svelte';
	import { timeOf } from '$lib/records/time';
	import { hasAt } from '$lib/records/types';

	/** Read-only view for entry types whose editing sheet arrives later. */
	const shown = $derived.by(() => {
		const rec = editor.detail ? store.items[editor.detail] : undefined;
		if (!rec || !hasAt(rec.payload)) return null;
		const typed = { ...rec, payload: rec.payload };
		return { at: rec.payload.at, ...describe(typed, lookups) };
	});
</script>

<Sheet
	bind:open={() => editor.detail !== null && shown !== null, (v) => !v && closeEditors()}
	title={shown?.title ?? ''}
>
	{#if shown}
		<div class="row">
			<CategoryBadge category={shown.category} nap={shown.nap} size={40} />
			<div>
				<p class="time">{timeOf(shown.at)}</p>
				{#if shown.summary}<p class="summary">{shown.summary}</p>{/if}
			</div>
		</div>
		<p class="muted small note">{t('detail.readOnly')}</p>
	{/if}
</Sheet>

<style>
	.row {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
	}
	.time {
		font-size: var(--fs-footnote);
		color: var(--text-2);
		font-weight: var(--fw-medium);
	}
	.summary {
		overflow-wrap: anywhere;
	}
	.note {
		margin-top: var(--sp-4);
	}
</style>
