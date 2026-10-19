<script lang="ts">
	import { t, i18n } from '$lib/i18n/index.svelte';
	import { findRegions, type BodyPlace, type View } from '$lib/bodymap/catalogue';
	import TextField from './TextField.svelte';

	/**
	 * Searchable list of every body part: the accessible alternative to tapping the outline. Choosing one reports the
	 * region, side and space with (u, v) at the region's centre. `view` is the one to prefer for regions that both
	 * views draw.
	 */
	let { view = 'front', onpick }: { view?: View; onpick?: (place: BodyPlace, name: string) => void } =
		$props();

	let query = $state('');
	const results = $derived(findRegions(query, i18n.locale, view));
</script>

<div class="finder">
	<TextField
		label={t('bodymap.find.label')}
		type="search"
		placeholder={t('bodymap.find.placeholder')}
		autocomplete="off"
		bind:value={query}
	/>
	{#if results.length === 0}
		<p class="empty" role="status">{t('bodymap.find.empty')}</p>
	{:else}
		<ul aria-label={t('bodymap.find.list')}>
			{#each results as c (`${c.place.region}:${c.place.side}`)}
				<li>
					<button type="button" onclick={() => onpick?.(c.place, c.name)}>{c.name}</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.finder {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 340px;
		overflow-y: auto;
		border-radius: var(--r-md);
		background: var(--surface-2);
	}
	li + li {
		border-top: 1px solid var(--line);
	}
	button {
		display: block;
		width: 100%;
		min-height: 48px;
		padding: 0 var(--sp-4);
		text-align: left;
		font-size: var(--fs-body);
		color: var(--text);
	}
	button:active {
		background: var(--surface-3);
	}
	.empty {
		margin: 0;
		color: var(--text-2);
	}
</style>
