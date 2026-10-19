<script lang="ts">
	import Icon from './Icon.svelte';
	import { categories, type Category } from './categories';

	let { category, size = 40 }: { category: Category; size?: number } = $props();
	const c = $derived(categories[category]);
</script>

<span class="badge tint-{c.tint}" style:width="{size}px" style:height="{size}px">
	<Icon name={c.icon} size={Math.round(size * 0.55)} />
</span>

<style>
	.badge {
		border-radius: 32%;
		display: inline-grid;
		place-items: center;
		flex: none;
	}
	.tint-food {
		background: var(--food-tint);
		color: var(--food-ink);
	}
	.tint-feel {
		background: var(--feel-tint);
		color: var(--feel-ink);
	}
	.tint-sleep {
		background: var(--sleep-tint);
		color: var(--sleep-ink);
	}
	.tint-pain {
		background: var(--pain-tint);
		color: var(--pain-ink);
	}
	.tint-meds {
		background: var(--meds-tint);
		color: var(--meds-ink);
	}
	.tint-gut {
		background: var(--gut-tint);
		color: var(--gut-ink);
	}
	.tint-drink {
		background: var(--drink-tint);
		color: var(--drink-ink);
	}
	.tint-measure {
		background: var(--measure-tint);
		color: var(--measure-ink);
	}
	.tint-note {
		background: var(--note-tint);
		color: var(--note-ink);
	}
</style>
