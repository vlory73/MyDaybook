<script lang="ts">
	import {
		CategoryBadge,
		PhotoThumb,
		EmptyState,
		Icon,
		Notice,
		Spinner,
		WeekStrip,
		type IconName
	} from '$lib/components';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import { openPhoto } from '$lib/photos/viewer.svelte';
	import { openDetail, openLog, openNote } from '$lib/records/editor.svelte';
	import { describe, lookups } from '$lib/records/format';
	import { quickSave } from '$lib/records/quick';
	import { daysInRange, recordsOnDay, store } from '$lib/records/store.svelte';
	import { dayDate, formatAt, timeOf, todayKey, weekDays } from '$lib/records/time';

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

	function open(id: string, type: string) {
		if (type === 'note') openNote(id);
		else if (type === 'feeling' || type === 'sleep' || type === 'bowel' || type === 'gut' || type === 'food')
			openLog(type, { id });
		else if (type === 'measurement') openLog('measurement', { id });
		else openDetail(id);
	}

	// One-tap mood: saves a feeling with just the mood and offers Undo.
	const moodLabels = ['mood.1', 'mood.2', 'mood.3', 'mood.4', 'mood.5'] as const;
	const latestMood = $derived(
		[...entries].reverse().find((r) => r.payload.type === 'feeling' && r.payload.mood !== undefined)?.payload
	);
	function logMood(mood: number) {
		void quickSave(
			{ v: 1, type: 'feeling', at: formatAt(new Date()), mood, symptoms: [] },
			'today.mood.saved'
		);
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

{#if isToday}
	<section class="card" aria-labelledby="feel">
		<h2 class="card-title" id="feel">{t('today.mood.title')}</h2>
		<p class="card-sub">{t('today.mood.sub')}</p>
		<div class="moods">
			{#each moodLabels as label, i (label)}
				{@const n = i + 1}
				<button
					type="button"
					class="mood"
					class:on={latestMood?.type === 'feeling' && latestMood.mood === n}
					aria-label={t(label)}
					aria-pressed={latestMood?.type === 'feeling' && latestMood.mood === n}
					onclick={() => logMood(n)}><Icon name={`face-${n}` as IconName} size={30} /></button
				>
			{/each}
		</div>
		<button type="button" class="more" onclick={() => openLog('feeling')}>{t('today.mood.more')}</button>
	</section>
{/if}

<h2 class="section-title">{heading}</h2>

{#if entries.length > 0}
	<ol class="tl">
		{#each entries as record (record.id)}
			{@const d = describe(record, lookups)}
			<li>
				<button type="button" class="entry" onclick={() => open(record.id, record.payload.type)}>
					<time>{timeOf(record.payload.at)}</time>
					<CategoryBadge category={d.category} size={40} />
					<span class="text">
						<span class="t">{d.title}</span>
						{#if d.summary}<span class="s">{d.summary}</span>{/if}
						{#if d.tags?.length}
							<span class="tags"
								>{#each d.tags as tag, i (i)}<span class="tag">{tag}</span>{/each}</span
							>
						{/if}
					</span>
				</button>
				{#if record.payload.attachments?.length}
					<div class="photos">
						{#each record.payload.attachments as photo (photo.id)}
							<button type="button" class="pic" aria-label={t('photo.open')} onclick={() => openPhoto(photo)}>
								<PhotoThumb {photo} label={t('photo.alt')} size={56} />
							</button>
						{/each}
					</div>
				{/if}
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
	.photos {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		padding: 0 var(--sp-3) var(--sp-3) calc(var(--sp-3) + 3.2rem);
	}
	.pic {
		padding: 0;
		border-radius: var(--r-sm);
		line-height: 0;
	}
	.pic:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.card {
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-4);
		box-shadow: var(--shadow-1);
		margin-top: var(--sp-3);
	}
	.card-title {
		font-size: var(--fs-body);
		font-weight: var(--fw-semibold);
	}
	.card-sub {
		font-size: var(--fs-callout);
		color: var(--text-2);
		margin: 2px 0 var(--sp-3);
	}
	.moods {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 6px;
	}
	.mood {
		height: 52px;
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--text-2);
		display: grid;
		place-items: center;
	}
	.mood.on {
		background: var(--feel-tint);
		color: var(--feel-ink);
		box-shadow: inset 0 0 0 2px var(--feel-ink);
	}
	.more {
		margin-top: var(--sp-2);
		min-height: 36px;
		color: var(--primary);
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
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
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}
	.tag {
		font-size: var(--fs-caption);
		font-weight: var(--fw-medium);
		padding: 2px 8px;
		border-radius: var(--r-full);
		background: var(--food-tint);
		color: var(--food-ink);
	}
	.loading {
		display: grid;
		place-items: center;
		padding: var(--sp-7) 0;
	}
</style>
