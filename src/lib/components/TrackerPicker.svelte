<script lang="ts">
	import Icon from './Icon.svelte';
	import { categories } from './categories';
	import { t } from '$lib/i18n/index.svelte';
	import { TRACKER_IDS, type TrackerId } from '$lib/records/trackers';

	/** The first-run choice: every tracker ticked, tap to untick. At least one stays ticked. */
	let { selected = $bindable(TRACKER_IDS) }: { selected?: TrackerId[] } = $props();

	function flip(id: TrackerId) {
		if (selected.includes(id)) {
			if (selected.length > 1) selected = selected.filter((x) => x !== id);
		} else {
			selected = TRACKER_IDS.filter((x) => x === id || selected.includes(x));
		}
	}
</script>

<div class="pgrid" role="group" aria-label={t('trackers.first.title')}>
	{#each TRACKER_IDS as id (id)}
		{@const on = selected.includes(id)}
		<button
			type="button"
			role="checkbox"
			aria-checked={on}
			class="ptile tint-{categories[id].tint}"
			class:off={!on}
			data-testid="tracker-tile-{id}"
			onclick={() => flip(id)}
		>
			<Icon name={categories[id].icon} size={26} />
			<span class="pn">{t(categories[id].label)}</span>
			{#if on}<span class="tick"><Icon name="check" size={14} /></span>{/if}
		</button>
	{/each}
</div>

<style>
	.pgrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.ptile {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 64px;
		padding: 0 12px;
		border-radius: var(--r-lg);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
		text-align: left;
		box-shadow: inset 0 0 0 2px currentColor;
	}
	.ptile:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.ptile.off {
		background: var(--surface-2);
		color: var(--text-3);
		box-shadow: inset 0 0 0 2px var(--line);
	}
	.pn {
		flex: 1;
		line-height: 1.2;
		padding-right: 22px;
	}
	.tick {
		position: absolute;
		right: 10px;
		top: 50%;
		margin-top: -11px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: currentColor;
	}
	.tick :global(svg) {
		color: var(--surface);
		stroke-width: 3;
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
	.ptile.off.tint-food,
	.ptile.off.tint-feel,
	.ptile.off.tint-sleep,
	.ptile.off.tint-pain,
	.ptile.off.tint-meds,
	.ptile.off.tint-gut,
	.ptile.off.tint-drink,
	.ptile.off.tint-measure,
	.ptile.off.tint-note {
		background: var(--surface-2);
		color: var(--text-3);
	}
</style>
