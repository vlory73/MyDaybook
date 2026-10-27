<script lang="ts">
	import { untrack } from 'svelte';
	import Button from './Button.svelte';
	import DrinkForm from './DrinkForm.svelte';
	import DrinkPresetsSheet from './DrinkPresetsSheet.svelte';
	import Notice from './Notice.svelte';
	import Sheet from './Sheet.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { formatAt } from '$lib/records/time';
	import type { DrinkPayload } from '$lib/records/types';

	/**
	 * The full Drink form on top of the meal sheet. It saves nothing: "Add to meal" hands the drink to the meal, which
	 * saves it with the meal's time. `drink` is the drink being changed (null for a new one).
	 */
	let {
		open = $bindable(false),
		drink = null,
		onadd
	}: { open?: boolean; drink?: DrinkPayload | null; onadd: (drink: DrinkPayload) => void } = $props();

	let form = $state<DrinkForm>();
	let editOpen = $state(false);
	let failed = $state(false);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			failed = false;
			form?.open(drink);
		});
	});

	const valid = $derived(form?.isValid() ?? false);

	async function add() {
		failed = false;
		try {
			// The time is a placeholder: the meal gives every drink its own time when it saves.
			const p = form?.payload(formatAt(new Date()));
			if (!p) return;
			await form?.rememberOther();
			onadd(p);
			open = false;
		} catch {
			failed = true;
		}
	}
</script>

<Sheet bind:open title={t('cat.drink')}>
	<div class="form">
		<DrinkForm bind:this={form} mode="meal" onEditPresets={() => (editOpen = true)} />
		{#if failed}<Notice tone="error">{t('entry.error.save')}</Notice>{/if}
		<div class="actions">
			<Button disabled={!valid} onclick={add}>{t('meal.drinks.addToMeal')}</Button>
		</div>
	</div>
</Sheet>

<DrinkPresetsSheet bind:open={editOpen} />

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--sp-2);
	}
	.form :global(.label) {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: var(--sp-2) 0 calc(-1 * var(--sp-1));
	}
	.form :global(.label .hint) {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.form :global(.chip-row) {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.form :global(textarea) {
		width: 100%;
		min-height: 88px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
		resize: vertical;
	}
	.form :global(textarea::placeholder) {
		color: var(--text-3);
	}
	.form :global(textarea:focus-visible) {
		outline: none;
		border-color: var(--focus);
	}
</style>
