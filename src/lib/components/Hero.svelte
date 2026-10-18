<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icon-names';

	let { icon }: { icon: IconName } = $props();
</script>

<span class="hero"><Icon name={icon} size={40} /></span>

<style>
	.hero {
		width: 80px;
		height: 80px;
		margin: 0 auto var(--sp-4);
		border-radius: 34px;
		display: grid;
		place-items: center;
		background: var(--primary-soft);
		color: var(--primary-press);
		transform: rotate(-6deg);
	}
	.hero :global(.icon) {
		transform: rotate(6deg);
	}
</style>
