<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icon-names';

	/** A 1..5 choice (mood, energy, stress, sleep quality). Faces are optional; numbers are always announced. */
	let {
		value = $bindable(),
		label,
		low,
		high,
		faces = false,
		tint = 'feel'
	}: {
		value?: number;
		label: string;
		low?: string;
		high?: string;
		faces?: boolean;
		tint?: 'feel' | 'sleep' | 'gut';
	} = $props();
	const steps = [1, 2, 3, 4, 5] as const;
</script>

<div class="wrap tint-{tint}">
	<div class="scale" role="radiogroup" aria-label={label}>
		{#each steps as n (n)}
			<button
				type="button"
				role="radio"
				aria-checked={value === n}
				aria-label="{n}/5"
				class:on={value === n}
				onclick={() => (value = n)}
			>
				{#if faces}<Icon name={`face-${n}` as IconName} size={28} />{:else}{n}{/if}
			</button>
		{/each}
	</div>
	{#if low || high}
		<div class="ends" aria-hidden="true"><span>{low}</span><span>{high}</span></div>
	{/if}
</div>

<style>
	.scale {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 6px;
	}
	button {
		height: 52px;
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--text-2);
		display: grid;
		place-items: center;
		font-weight: var(--fw-semibold);
	}
	.tint-feel .on {
		background: var(--feel-tint);
		color: var(--feel-ink);
		box-shadow: inset 0 0 0 2px var(--feel-ink);
	}
	.tint-sleep .on {
		background: var(--sleep-tint);
		color: var(--sleep-ink);
		box-shadow: inset 0 0 0 2px var(--sleep-ink);
	}
	.tint-gut .on {
		background: var(--gut-tint);
		color: var(--gut-ink);
		box-shadow: inset 0 0 0 2px var(--gut-ink);
	}
	.ends {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-caption);
		color: var(--text-3);
		margin-top: 4px;
	}
</style>
