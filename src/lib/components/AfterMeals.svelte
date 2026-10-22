<script lang="ts">
	/**
	 * "After meals with...": pick a watch-list item and a window, see the person's meals that contain it with what was
	 * logged soon after, side by side. No counts, no percentages, no conclusions (D18, not a medical device).
	 */
	import Card from './Card.svelte';
	import Chip from './Chip.svelte';
	import Segmented from './Segmented.svelte';
	import { i18n, t, tn, type MessageKey } from '$lib/i18n/index.svelte';
	import { allRecords } from '$lib/records/store.svelte';
	import { formatDuration, sensitivityName } from '$lib/records/format';
	import { dayDate, timeOf } from '$lib/records/time';
	import { watchedItems } from '$lib/records/watch';
	import {
		DEFAULT_WINDOW,
		mealsWithItem,
		WINDOWS,
		type After,
		type WindowHours
	} from '$lib/trends/afterMeals';

	let { days }: { days: readonly string[] } = $props();

	const items = $derived(watchedItems(allRecords()));
	let chosen = $state<string | null>(null);
	let windowText = $state(String(DEFAULT_WINDOW));
	const current = $derived(items.find((i) => i.id === chosen) ?? items[0]);
	const meals = $derived(
		current ? mealsWithItem(allRecords(), current.id, days, Number(windowText) as WindowHours) : []
	);
	const day = $derived(
		new Intl.DateTimeFormat(i18n.locale, { weekday: 'short', day: 'numeric', month: 'short' })
	);

	const firstLine = (text: string) =>
		text
			.split('\n')
			.find((l) => l.trim() !== '')
			?.trim() ?? '';

	function describeAfter(a: After): string {
		switch (a.kind) {
			case 'gut':
				return a.symptoms
					.map((s) => t('fmt.gut.symptom', { name: t(`gut.kind.${s.kind}` as MessageKey), n: s.intensity }))
					.join(', ');
			case 'bowel':
				return t('trends.meals.bowel', { n: a.bristol });
			case 'pain':
				return tn('trends.meals.pain', a.regions, { max: a.max });
			case 'feeling':
				return t('trends.meals.symptoms', { list: a.symptoms.join(', ') });
		}
	}
	const later = (minutes: number) => t('trends.meals.later', { d: formatDuration(minutes) });
</script>

{#if items.length > 0 && current}
	<Card title={t('trends.meals.title')}>
		<p class="sub">{t('trends.meals.sub')}</p>
		<p class="label">{t('trends.meals.item')}</p>
		<div class="chips">
			{#each items as item (item.id)}
				<Chip selected={item.id === current.id} onclick={() => (chosen = item.id)}
					>{sensitivityName(item.payload.label)}</Chip
				>
			{/each}
		</div>
		<p class="label">{t('trends.meals.window')}</p>
		<Segmented
			label={t('trends.meals.window')}
			options={WINDOWS.map((h) => ({ value: String(h), label: t('trends.meals.hours', { h }) }))}
			bind:value={windowText}
		/>
		{#if meals.length === 0}
			<p class="none">{t('trends.meals.none', { name: sensitivityName(current.payload.label) })}</p>
		{:else}
			<ul class="meals">
				{#each meals as meal (meal.id)}
					<li>
						<p class="when">
							{t('trends.meals.when', {
								day: day.format(dayDate(meal.at.slice(0, 10))),
								time: timeOf(meal.at)
							})}
						</p>
						<p class="text">
							{firstLine(meal.text) || t('meal.snack')}
							{#if meal.state === 'unsure'}<span class="tag">{t('trends.meals.unsure')}</span>{/if}
						</p>
						{#if meal.after.length === 0}
							<p class="nothing">{t('trends.meals.nothing')}</p>
						{:else}
							<ul class="after">
								{#each meal.after as a (a.id)}
									<li><span class="off">{later(a.minutes)}</span><span>{describeAfter(a)}</span></li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<p class="footer">{t('trends.meals.footer')}</p>
	</Card>
{/if}

<style>
	.sub {
		color: var(--text-2);
		font-size: var(--fs-footnote);
	}
	.label {
		margin: var(--sp-3) 0 var(--sp-2);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.meals {
		list-style: none;
		margin: var(--sp-4) 0 0;
		padding: 0;
	}
	.meals > li {
		padding: var(--sp-3) 0;
		border-top: 1px solid var(--line);
	}
	.when {
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.text {
		font-weight: var(--fw-semibold);
		overflow-wrap: anywhere;
	}
	.tag {
		margin-left: var(--sp-2);
		padding: 1px 8px;
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-caption);
		font-weight: var(--fw-medium);
		color: var(--text-2);
	}
	.nothing {
		margin-top: var(--sp-1);
		color: var(--text-2);
		font-size: var(--fs-callout);
	}
	.after {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
		display: grid;
		gap: var(--sp-1);
	}
	.after li {
		display: grid;
		grid-template-columns: 6.5rem 1fr;
		gap: var(--sp-2);
		font-size: var(--fs-callout);
	}
	.off {
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.none {
		margin-top: var(--sp-4);
		color: var(--text-2);
	}
	.footer {
		margin-top: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: 1px solid var(--line);
		color: var(--text-2);
		font-size: var(--fs-footnote);
	}
</style>
