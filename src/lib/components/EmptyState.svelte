<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icon-names';

	let { icon, title, body }: { icon: IconName; title?: string; body: string } = $props();
</script>

<div class="empty">
	<span class="art"><Icon name={icon} size={36} /></span>
	{#if title}<h2>{title}</h2>{/if}
	<p>{body}</p>
</div>

<style>
	.empty {
		text-align: center;
		padding: var(--sp-8) var(--sp-5);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
	}
	.art {
		width: 76px;
		height: 76px;
		border-radius: 28px;
		display: grid;
		place-items: center;
		background: var(--primary-soft);
		color: var(--primary-press);
		transform: rotate(-6deg);
		margin-bottom: var(--sp-2);
	}
	h2 {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
	}
	p {
		color: var(--text-2);
		max-width: 30ch;
	}
</style>
