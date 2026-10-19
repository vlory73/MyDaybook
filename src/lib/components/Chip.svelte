<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A toggleable chip. Pass `selected` for toggle behaviour, or omit it for a plain action chip. */
	let {
		selected,
		disabled = false,
		onclick,
		children
	}: {
		selected?: boolean;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	} = $props();
</script>

<button type="button" class="chip" class:on={selected} aria-pressed={selected} {disabled} {onclick}>
	{@render children()}
</button>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
		white-space: nowrap;
		border: 1.5px solid transparent;
		transition: background var(--dur-2) var(--ease-out);
	}
	.chip:disabled {
		opacity: 0.45;
	}
	.on {
		background: var(--primary-soft);
		color: var(--primary-press);
		border-color: var(--primary);
	}
</style>
