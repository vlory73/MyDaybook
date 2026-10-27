<script lang="ts">
	import CategoryBadge from './CategoryBadge.svelte';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import Toggle from './Toggle.svelte';
	import { showToast } from './toast.svelte';
	import { categories } from './categories';
	import type { MessageKey } from '$lib/i18n/en';
	import { t } from '$lib/i18n/index.svelte';
	import { chooseTracker, trackerOn, trackersOn } from '$lib/records/trackers.svelte';
	import { TRACKER_IDS, type TrackerId } from '$lib/records/trackers';

	/** Me → "What you track": one switch per tracker. Switching off only hides it; nothing is deleted (#123). */
	const onlyOne = $derived(trackersOn().length === 1);

	async function change(id: TrackerId, on: boolean) {
		try {
			await chooseTracker(id, on);
		} catch {
			showToast(t('trackers.error'));
		}
	}
</script>

<section id="what-you-track" class="anchor" data-testid="trackers-card">
	<Card title={t('trackers.heading')}>
		<p class="small muted lead">{t('trackers.lead')}</p>
		<ul class="list">
			{#each TRACKER_IDS as id (id)}
				{@const on = trackerOn(id)}
				<li>
					<div class="trow">
						<CategoryBadge category={id} size={36} />
						<span class="grow">
							<span class="nm">{t(categories[id].label)}</span>
							<span class="ds">{t(`trackers.desc.${id}` as MessageKey)}</span>
						</span>
						<Toggle
							checked={on}
							label={t(categories[id].label)}
							disabled={on && onlyOne}
							onchange={(v) => change(id, v)}
						/>
					</div>
					{#if id === 'meds' && !on}
						<p class="offnote small"><Icon name="info" size={16} />{t('trackers.medsNote')}</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if onlyOne}
			<p class="keep small muted"><Icon name="info" size={16} />{t('trackers.keepOne')}</p>
		{/if}
	</Card>
</section>

<style>
	.anchor {
		scroll-margin-top: var(--sp-4);
	}
	.lead {
		margin-bottom: var(--sp-2);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li + li {
		border-top: 1px solid var(--line);
	}
	.trow {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 44px;
		padding: 2px 0;
	}
	.grow {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.nm {
		font-weight: var(--fw-semibold);
		line-height: 1.25;
	}
	.ds {
		font-size: var(--fs-footnote);
		color: var(--text-2);
		line-height: 1.3;
	}
	.offnote,
	.keep {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.offnote {
		margin: 0 0 var(--sp-2) 48px;
		padding: 4px 10px;
		border-radius: var(--r-sm);
		background: var(--surface-2);
		color: var(--text-2);
	}
	.keep {
		margin-top: var(--sp-2);
	}
</style>
