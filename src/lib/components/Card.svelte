<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<section class="card">
	{#if title}<h2 class="title">{title}</h2>{/if}
	{@render children()}
</section>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-4);
		box-shadow: var(--shadow-1);
	}
	.card + :global(.card) {
		margin-top: var(--sp-3);
	}
	.title {
		font-size: var(--fs-body);
		font-weight: var(--fw-semibold);
		margin-bottom: var(--sp-2);
	}
</style>
