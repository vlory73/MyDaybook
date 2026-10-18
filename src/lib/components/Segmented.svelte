<script lang="ts" generics="T extends string">
	/** Single choice from a few options (radio group semantics, arrow-key navigation). */
	let {
		options,
		value = $bindable(),
		label
	}: { options: { value: T; label: string }[]; value: T; label: string } = $props();

	let buttons: HTMLButtonElement[] = $state([]);

	function onkeydown(event: KeyboardEvent, index: number) {
		const step =
			event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		event.preventDefault();
		const next = (index + step + options.length) % options.length;
		value = options[next]!.value;
		buttons[next]?.focus();
	}
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
	{#each options as option, i (option.value)}
		<button
			bind:this={buttons[i]}
			type="button"
			role="radio"
			aria-checked={value === option.value}
			tabindex={value === option.value ? 0 : -1}
			class:on={value === option.value}
			onclick={() => (value = option.value)}
			onkeydown={(e) => onkeydown(e, i)}>{option.label}</button
		>
	{/each}
</div>

<style>
	.segmented {
		display: flex;
		background: var(--surface-2);
		border-radius: var(--r-full);
		padding: 3px;
	}
	button {
		flex: 1;
		min-height: 38px;
		border-radius: var(--r-full);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
		color: var(--text-2);
		transition: background var(--dur-2) var(--ease-out);
	}
	.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-1);
		font-weight: var(--fw-semibold);
	}
</style>
