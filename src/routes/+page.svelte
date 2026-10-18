<script lang="ts">
	import { CategoryBadge, EmptyState, Notice, Spinner, WeekStrip } from '$lib/components';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import { openDetail, openNote } from '$lib/records/editor.svelte';
	import { describe } from '$lib/records/format';
	import { daysInRange, recordsOnDay, store } from '$lib/records/store.svelte';
	import { dayDate, timeOf, todayKey, weekDays } from '$lib/records/time';

	const now = new Date();
	const hour = now.getHours();
	const greeting = hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening';
	const dateLabel = $derived(
		new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
	);

	let selected = $state(todayKey());
	const isToday = $derived(selected === todayKey());
	const week = $derived(weekDays(selected));
	const marked = $derived(daysInRange(week[0]!, week[6]!));
	const entries = $derived(recordsOnDay(selected));
	const heading = $derived(
		isToday
			? t('today.heading.today')
			: new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
					dayDate(selected)
				)
	);

	function nameOfType(id: string): string | undefined {
		const p = store.items[id]?.payload;
		return p?.type === 'measurement_type' ? p.name : undefined;
	}

	function open(id: string, type: string) {
		if (type === 'note') openNote(id);
		else openDetail(id);
	}
</script>

<header class="page-head">
	<div>
		<p class="eyebrow">{dateLabel}</p>
		<h1 class="large-title">{t(greeting)}</h1>
	</div>
</header>

<WeekStrip bind:selected {marked} />

{#if store.skipped > 0}
	<Notice tone="warn">{tn('today.skipped', store.skipped)}</Notice>
{:else if store.syncFailed}
	<Notice>{t('today.syncFailed')}</Notice>
{/if}

<h2 class="section-title">{heading}</h2>

{#if entries.length > 0}
	<ol class="tl">
		{#each entries as record (record.id)}
			{@const d = describe(record, nameOfType)}
			<li>
				<button type="button" class="entry" onclick={() => open(record.id, record.payload.type)}>
					<time>{timeOf(record.payload.at)}</time>
					<CategoryBadge category={d.category} size={40} />
					<span class="text">
						<span class="t">{d.title}</span>
						{#if d.summary}<span class="s">{d.summary}</span>{/if}
					</span>
				</button>
			</li>
		{/each}
	</ol>
{:else if store.status !== 'ready'}
	<div class="loading" role="status">
		<Spinner size={28} /><span class="sr-only">{t('common.loading')}</span>
	</div>
{:else if isToday}
	<EmptyState icon="sunrise" title={t('today.empty.title')} body={t('today.empty.body')} />
{:else}
	<EmptyState icon="sunrise" body={t('today.emptyDay.body')} />
{/if}

<style>
	.section-title {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
		margin: var(--sp-4) 0 var(--sp-1);
	}
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.entry {
		display: grid;
		grid-template-columns: 46px 40px 1fr;
		gap: var(--sp-3);
		align-items: start;
		width: 100%;
		padding: 10px 0;
		text-align: left;
	}
	time {
		font-size: var(--fs-footnote);
		color: var(--text-2);
		padding-top: 10px;
		font-weight: var(--fw-medium);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.t {
		font-weight: var(--fw-semibold);
	}
	.s {
		font-size: var(--fs-callout);
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.loading {
		display: grid;
		place-items: center;
		padding: var(--sp-7) 0;
	}
</style>
