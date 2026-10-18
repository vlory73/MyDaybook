<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';

	/** Progress through a multi-step flow. `current` is 1-based. */
	let { total, current }: { total: number; current: number } = $props();
</script>

<div class="steps" role="img" aria-label={t('auth.steps', { current, total })}>
	{#each [...Array(total).keys()] as i (i)}
		<i class:on={i < current}></i>
	{/each}
</div>

<style>
	.steps {
		display: flex;
		gap: 6px;
		justify-content: center;
		margin: var(--sp-2) 0 var(--sp-5);
	}
	i {
		width: 28px;
		height: 5px;
		border-radius: 3px;
		background: var(--surface-3);
	}
	i.on {
		background: var(--primary);
	}
</style>
