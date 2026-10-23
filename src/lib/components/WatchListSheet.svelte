<script lang="ts">
	import Sheet from './Sheet.svelte';
	import WatchList from './WatchList.svelte';
	import { t } from '$lib/i18n/index.svelte';

	/** The watch list editor in a sheet, to open on top of the meal sheet without losing the draft. */
	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Sheet bind:open title={t('watch.heading')}>
	{#if open}<WatchList bare />{/if}
</Sheet>
