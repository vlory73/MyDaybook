<script lang="ts">
	import Button from './Button.svelte';
	import DueDoses from './DueDoses.svelte';
	import Icon from './Icon.svelte';
	import Sheet from './Sheet.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { asNeededMedications, dueSlots } from '$lib/meds/due';
	import { openAdhocDose, openMedication } from '$lib/records/editor.svelte';
	import { allRecords } from '$lib/records/store.svelte';
	import { todayKey } from '$lib/records/time';

	/** The quick-log "Medicine" tile: today's doses and the as-needed medication, with the same actions as Meds. */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	const day = $derived(todayKey());
	const any = $derived(
		open && (dueSlots(allRecords(), day).length > 0 || asNeededMedications(allRecords()).length > 0)
	);
</script>

{#snippet another()}
	<div class="another">
		<Button
			variant="soft"
			block
			onclick={() => {
				open = false;
				openAdhocDose();
			}}><Icon name="plus" size={20} />{t('adhoc.open')}</Button
		>
	</div>
{/snippet}

<Sheet bind:open title={t('cat.meds')}>
	{#if any}
		<!-- The sheet steps aside after an action, so the Undo toast is not hidden behind it. -->
		<DueDoses {day} title={t('dose.card.today')} asNeeded ondone={() => (open = false)} />
		{@render another()}
	{:else}
		<p class="muted none">{t('dose.none')}</p>
		<Button
			variant="soft"
			block
			onclick={() => {
				open = false;
				openMedication();
			}}><Icon name="plus" size={20} />{t('meds.add')}</Button
		>
		{@render another()}
	{/if}
</Sheet>

<style>
	.another {
		margin-top: var(--sp-3);
	}
	.none {
		margin-bottom: var(--sp-4);
	}
</style>
