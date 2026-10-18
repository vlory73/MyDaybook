<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';

	type Option = { value: string | number; label: string };
	let {
		label,
		hint,
		options,
		value = $bindable(),
		...rest
	}: Omit<HTMLSelectAttributes, 'value'> & {
		label: string;
		hint?: string;
		options: Option[];
		value?: string | number;
	} = $props();
	const id = $props.id();
</script>

<div class="wrap">
	<label for={id}
		>{label}{#if hint}<span class="hint">{hint}</span>{/if}</label
	>
	<select {id} bind:value {...rest}>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
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
	select {
		min-height: 48px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
	}
	select:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
</style>
