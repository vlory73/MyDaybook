<script lang="ts">
	import Icon from './Icon.svelte';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { addDays, dayDate, todayKey, weekDays } from '$lib/records/time';

	/** Monday to Sunday of the week holding `selected`. A dot marks days that have entries. */
	let { selected = $bindable(), marked }: { selected: string; marked: Set<string> } = $props();

	const days = $derived(weekDays(selected));
	const today = $derived(todayKey());
	const weekday = $derived(new Intl.DateTimeFormat(i18n.locale, { weekday: 'narrow' }));
	const full = $derived(
		new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' })
	);
	const range = $derived(new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }));

	const shift = (weeks: number) => (selected = addDays(selected, weeks * 7));

	let startX: number | null = null;
	function onTouchStart(e: TouchEvent) {
		startX = e.touches[0]?.clientX ?? null;
	}
	function onTouchEnd(e: TouchEvent) {
		const endX = e.changedTouches[0]?.clientX;
		if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 60) shift(endX < startX ? 1 : -1);
		startX = null;
	}
</script>

<div
	class="wrap"
	role="group"
	aria-label={t('today.week.label')}
	ontouchstart={onTouchStart}
	ontouchend={onTouchEnd}
>
	<div class="bar">
		<button type="button" class="arrow" aria-label={t('today.week.prev')} onclick={() => shift(-1)}>
			<Icon name="chevron-left" size={20} />
		</button>
		<span class="range">{range.format(dayDate(days[0]!))} – {range.format(dayDate(days[6]!))}</span>
		<button type="button" class="arrow" aria-label={t('today.week.next')} onclick={() => shift(1)}>
			<Icon name="chevron-right" size={20} />
		</button>
	</div>
	<div class="week">
		{#each days as day (day)}
			{@const has = marked.has(day)}
			<button
				type="button"
				class={['day', { on: day === selected, today: day === today }]}
				aria-label={full.format(dayDate(day))}
				aria-pressed={day === selected}
				aria-current={day === today ? 'date' : undefined}
				data-day={day}
				data-has-entries={has ? 'true' : 'false'}
				onclick={() => (selected = day)}
			>
				<span class="wd" aria-hidden="true">{weekday.format(dayDate(day))}</span>
				<b aria-hidden="true">{Number(day.slice(8))}</b>
				<i class={['dot', { shown: has }]} aria-hidden="true"></i>
			</button>
		{/each}
	</div>
</div>

<style>
	.wrap {
		margin-bottom: var(--sp-4);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-1);
	}
	.range {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-medium);
		color: var(--text-2);
	}
	.arrow {
		width: var(--tap);
		height: 36px;
		display: grid;
		place-items: center;
		color: var(--text-2);
		border-radius: var(--r-full);
	}
	.week {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 0;
		border-radius: var(--r-md);
		font-size: var(--fs-caption);
		color: var(--text-2);
		border: 1.5px solid transparent;
	}
	.day b {
		font-size: var(--fs-callout);
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: transparent;
	}
	.dot.shown {
		background: var(--primary);
		opacity: 0.55;
	}
	.today {
		background: var(--primary-soft);
	}
	.on {
		background: var(--text);
		color: var(--bg);
	}
	.on b {
		color: var(--bg);
	}
	.on .dot.shown {
		background: var(--bg);
		opacity: 1;
	}
</style>
