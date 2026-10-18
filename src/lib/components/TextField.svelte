<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		label,
		hint,
		value = $bindable(''),
		...rest
	}: HTMLInputAttributes & { label: string; hint?: string; value?: string } = $props();
	const id = $props.id();
</script>

<div class="wrap">
	<label for={id}
		>{label}{#if hint}<span class="hint">{hint}</span>{/if}</label
	>
	<input {id} bind:value {...rest} />
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	label {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.hint {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	input {
		min-height: 48px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
	}
	input::placeholder {
		color: var(--text-3);
	}
	input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
</style>
