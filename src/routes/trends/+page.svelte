<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		AfterMeals,
		Card,
		CategoryBadge,
		HeatMapCard,
		EmptyState,
		Icon,
		Segmented,
		TrendChart,
		type Scale
	} from '$lib/components';
	import { i18n, t, tn, type MessageKey } from '$lib/i18n/index.svelte';
	import { formatDuration } from '$lib/records/format';
	import { allRecords, store } from '$lib/records/store.svelte';
	import { trackerOn } from '$lib/records/trackers.svelte';
	import { openEpisode } from '$lib/records/editor.svelte';
	import { episodeRange, episodeViews, overlapping } from '$lib/records/episodes';
	import { dayDate, todayKey, weekStart } from '$lib/records/time';
	import { bladderSummary, hasBladderData } from '$lib/records/bladder';
	import { FLOWS, flowSize, periodCalendar, periodByDay } from '$lib/records/period';
	import { BLOOD_PRESSURE_ID, PULSE_ID, WEIGHT_ID } from '$lib/records/log';
	import { mlToCl } from '$lib/records/drinks';
	import { bandPath, linePath, runs, spread } from '$lib/trends/paths';
	import { customRange, DEFAULT_PERIOD, lastDays, parsePeriod } from '$lib/trends/range';
	import {
		bowelDots,
		doseSeries,
		feelingSeries,
		fluidSeries,
		gutSeries,
		hasAny,
		measurementSeries,
		measurementTypesWithData,
		painSeries,
		present,
		sleepSeries,
		type Series
	} from '$lib/trends/series';

	const STORAGE_KEY = 'trends-period';
	const today = todayKey();
	let period = $state<string>(String(DEFAULT_PERIOD));
	let from = $state(lastDays(30, today)[0]!);
	let to = $state(today);

	onMount(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) period = String(parsePeriod(saved));
		} catch {
			// Storage can be unavailable; the default period is fine.
		}
	});
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
	$effect(() => {
		if (!ready || period === 'custom') return;
		try {
			localStorage.setItem(STORAGE_KEY, period);
		} catch {
			// Not remembered; the choice still applies.
		}
	});

	const custom = $derived(period === 'custom' ? customRange(from, to) : null);
	const days = $derived<string[]>(custom ? (custom.ok ? custom.days : []) : lastDays(Number(period), today));
	const dateFmt = $derived(new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' }));
	const range = $derived(
		days.length > 0
			? t('trends.range', {
					from: dateFmt.format(dayDate(days[0]!)),
					to: dateFmt.format(dayDate(days.at(-1)!))
				})
			: ''
	);

	const recs = $derived(allRecords());
	const feeling = $derived(feelingSeries(recs, days));
	const sleep = $derived(sleepSeries(recs, days));
	const weight = $derived(measurementSeries(recs, days, WEIGHT_ID));
	const bpUpper = $derived(measurementSeries(recs, days, BLOOD_PRESSURE_ID, 0));
	const bpLower = $derived(measurementSeries(recs, days, BLOOD_PRESSURE_ID, 1));
	const pulse = $derived(measurementSeries(recs, days, PULSE_ID));
	const own = $derived(measurementTypesWithData(recs, days));
	const fluids = $derived(fluidSeries(recs, days));
	const doses = $derived(doseSeries(recs, days));
	const bowel = $derived(bowelDots(recs, days));
	const gut = $derived(gutSeries(recs, days));
	const pain = $derived(painSeries(recs, days));
	const episodes = $derived(
		days.length > 0 ? overlapping(episodeViews(recs, i18n.locale, today), days[0]!, days.at(-1)!) : []
	);

	const periodWeeks = $derived(
		days.length > 0 ? periodCalendar(recs, days[0]!, days.at(-1)!, weekStart) : []
	);
	const periodDays = $derived(days.length > 0 ? periodByDay(recs, days[0]!, days.at(-1)!).size : 0);
	const bladder = $derived(
		days.length > 0
			? bladderSummary(recs, days[0]!, days.at(-1)!)
			: bladderSummary([], '0000-00-00', '0000-00-00')
	);
	const bladderIdx = $derived(new Map(days.map((d, i) => [d, i])));
	const dayNames = $derived.by(() => {
		const fmt = new Intl.DateTimeFormat(i18n.locale, { weekday: 'narrow' });
		const first = periodWeeks[0];
		return first ? first.map((c) => fmt.format(dayDate(c.day))) : [];
	});
	const longDay = $derived(
		new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' })
	);

	// A tracker that is switched off (Me → What you track) shows no cards; its old entries stay in the diary.
	const showFeeling = $derived(
		trackerOn('feel') && (hasAny(feeling.mood) || hasAny(feeling.energy) || hasAny(feeling.stress))
	);
	const showSleep = $derived(trackerOn('sleep') && (hasAny(sleep.minutes) || hasAny(sleep.napMinutes)));
	const showWeight = $derived(trackerOn('weight') && hasAny(weight.values));
	const showBp = $derived(trackerOn('measure') && (hasAny(bpUpper.values) || hasAny(bpLower.values)));
	const showPulse = $derived(trackerOn('measure') && hasAny(pulse.values));
	const showOwn = $derived(trackerOn('measure') && own.length > 0);
	const showFluids = $derived(trackerOn('drink') && hasAny(fluids.totalMl));
	const showDoses = $derived(trackerOn('meds') && doses.any);
	const showBowel = $derived(trackerOn('gut') && bowel.length > 0);
	const showGut = $derived(trackerOn('stomach') && (hasAny(gut.nausea) || hasAny(gut.heartburn)));
	const showPain = $derived(trackerOn('pain') && pain.daysWithPain > 0);
	const showPeriod = $derived(trackerOn('period') && periodDays > 0);
	const showBladder = $derived(
		trackerOn('bladder') && days.length > 0 && hasBladderData(recs, days[0]!, days.at(-1)!)
	);
	const showEpisodes = $derived(trackerOn('pain') && episodes.length > 0);
	const anything = $derived(
		showFeeling ||
			showSleep ||
			showWeight ||
			showBp ||
			showPulse ||
			showOwn ||
			showFluids ||
			showDoses ||
			showBowel ||
			showGut ||
			showPain ||
			showPeriod ||
			showBladder
	);
	// The watch-list card shows its own empty state, so a period with only meals still leaves the page usable.

	const nf = $derived(new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 }));
	const num = (n: number) => nf.format(n);
	const aria = (key: MessageKey, extra: Record<string, string> = {}) => t(key, { range, ...extra });
	const bw = (s: Scale) => Math.min(18, Math.max(1.5, s.slot * 0.7));
	const dense = $derived(days.length > 31);

	const hours = (minutes: number) => minutes / 60;
	const niceTop = (value: number, step: number, min: number) => Math.max(min, Math.ceil(value / step) * step);

	/** Night plus nap per day, so the stacked bars fit. */
	const sleepDayMinutes = $derived(sleep.minutes.map((m, i) => (m ?? 0) + (sleep.napMinutes[i] ?? 0)));
	const sleepTop = $derived(niceTop(Math.max(...sleepDayMinutes.map(hours), 0), 2, 8));
	const hasNaps = $derived(sleep.napCount > 0);
	const showBadges = $derived(days.length <= 14);
	const fluidTop = $derived(niceTop(Math.max(...present(fluids.totalMl).map(mlToCl), 0), 50, 50));
	const bladderTop = $derived(niceTop(Math.max(...bladder.days.map((d) => d.visits), 0), 5, 5));
	const doseTop = $derived(Math.max(...doses.days.map((d) => d.taken + d.late + d.skipped), 1));

	function span(values: Series, pad = 0.5) {
		const v = present(values);
		const lo = Math.min(...v);
		const hi = Math.max(...v);
		const p = Math.max((hi - lo) * 0.25, pad);
		return { min: Math.floor(lo - p), max: Math.ceil(hi + p) };
	}

	const rangeOf = (values: Series) => ({ first: present(values)[0]!, last: present(values).at(-1)! });
	const firstIndex = (values: Series) => values.findIndex((v) => v !== null);
	const lastIndex = (values: Series) => values.findLastIndex((v) => v !== null);
	const hasQuality = $derived(sleep.qualityCounts.some((n) => n > 0));
	/** End-of-line letters for the feeling lines (the first letter of each name in the language in use). */
	const ends = $derived([
		{ cls: 'f1', values: feeling.mood, letter: t('trends.feel.mood').charAt(0) },
		{ cls: 'f2', values: feeling.energy, letter: t('trends.feel.energy').charAt(0) },
		{ cls: 'f3', values: feeling.stress, letter: t('trends.feel.stress').charAt(0) }
	]);
</script>

{#snippet line(s: Scale, values: Series, cls: string)}
	<path class={cls} d={linePath(values.flatMap((v, i) => (v === null ? [] : [{ x: s.x(i), y: s.y(v) }])))} />
	{#each values as v, i (i)}
		{#if v !== null && !dense}<circle class={`${cls}-dot`} cx={s.x(i)} cy={s.y(v)} r="2.5" />{/if}
	{/each}
	{#each runs(values) as run (run.start)}
		{#if run.items.length === 1 && dense}
			<circle class={`${cls}-dot`} cx={s.x(run.start)} cy={s.y(run.items[0]!)} r="2.5" />
		{/if}
	{/each}
{/snippet}

{#snippet bpCard()}
	{@const both = [...bpUpper.values, ...bpLower.values]}
	{@const r = span(both)}
	{@const unit = bpUpper.unit || 'mmHg'}
	<Card title={t('measure.bp')}>
		<p class="sub">{t('trends.bp.sub', { unit })}</p>
		<TrendChart
			{days}
			yMin={r.min}
			yMax={r.max}
			yTicks={[r.min, r.max]}
			label={aria('trends.bp.aria')}
			padRight={16}
		>
			{#snippet layers(s)}
				{@render line(s, bpUpper.values, 'wl')}
				{@render line(s, bpLower.values, 'wl2')}
				{#each [{ v: bpUpper.values, k: 'measure.bp.upper' }, { v: bpLower.values, k: 'measure.bp.lower' }] as e (e.k)}
					{@const li = lastIndex(e.v)}
					{#if li >= 0}
						<text class="val" x={Math.min(s.x(li), s.right)} y={s.y(e.v[li]!) - 8} text-anchor="end"
							>{num(e.v[li]!)}</text
						>
					{/if}
				{/each}
			{/snippet}
		</TrendChart>
		<ul class="legend">
			<li>
				<svg width="26" height="8" aria-hidden="true"><path class="wl" d="M1 4h24" /></svg>{t(
					'measure.bp.upper'
				)}
			</li>
			<li>
				<svg width="26" height="8" aria-hidden="true"><path class="wl2" d="M1 4h24" /></svg>{t(
					'measure.bp.lower'
				)}
			</li>
		</ul>
	</Card>
{/snippet}

{#snippet measureCard(title: string, unit: string, values: Series)}
	{@const r = span(values)}
	{@const fi = firstIndex(values)}
	{@const li = lastIndex(values)}
	<Card {title}>
		<p class="sub">{t('trends.measure.sub', { unit })}</p>
		<TrendChart
			{days}
			yMin={r.min}
			yMax={r.max}
			yTicks={[r.min, r.max]}
			label={aria('trends.measure.aria', { name: title })}
			padRight={16}
		>
			{#snippet layers(s)}
				{@render line(s, values, 'wl')}
				{#if fi >= 0}
					<text class="val" x={Math.max(s.x(fi), s.left + 4)} y={s.y(values[fi]!) - 8} text-anchor="start"
						>{num(rangeOf(values).first)} {unit}</text
					>
				{/if}
				{#if li > fi}
					<text class="val" x={Math.min(s.x(li), s.right)} y={s.y(values[li]!) - 8} text-anchor="end"
						>{num(rangeOf(values).last)} {unit}</text
					>
				{/if}
			{/snippet}
		</TrendChart>
	</Card>
{/snippet}

<header class="page-head">
	<h1 class="large-title">{t('trends.title')}</h1>
	<a class="reports-link" href={resolve('/reports')}><Icon name="printer" size={18} />{t('reports.button')}</a
	>
</header>

<Segmented
	label={t('trends.period.label')}
	options={[
		{ value: '7', label: t('trends.period.7') },
		{ value: '30', label: t('trends.period.30') },
		{ value: '90', label: t('trends.period.90') },
		{ value: 'custom', label: t('trends.period.custom') }
	]}
	bind:value={period}
/>

{#if period === 'custom'}
	<div class="custom">
		<label>
			<span>{t('trends.custom.from')}</span>
			<input type="date" bind:value={from} max={to || undefined} />
		</label>
		<label>
			<span>{t('trends.custom.to')}</span>
			<input type="date" bind:value={to} min={from || undefined} />
		</label>
	</div>
	{#if custom && !custom.ok}
		<p class="problem" role="alert">{t(`trends.custom.${custom.problem}` as MessageKey)}</p>
	{/if}
{/if}
{#if range}<p class="range">{range}</p>{/if}

{#if store.status === 'ready' && days.length > 0 && !anything}
	<EmptyState icon="chart-spline" title={t('trends.empty.title')} body={t('trends.empty.body')} />
{/if}

{#if store.status === 'ready' && days.length > 0}
	<div class="cards">
		{#if showFeeling}
			<Card title={t('trends.feel.title')}>
				<p class="sub">{t('trends.feel.sub')}</p>
				<TrendChart
					{days}
					yMin={0.5}
					yMax={5.5}
					yTicks={[1, 3, 5]}
					label={aria('trends.feel.aria')}
					padRight={18}
				>
					{#snippet layers(s)}
						{@render line(s, feeling.mood, 'f1')}
						{@render line(s, feeling.energy, 'f2')}
						{@render line(s, feeling.stress, 'f3')}
						{@const lasts = ends.filter((e) => lastIndex(e.values) >= 0)}
						{@const ys = spread(
							lasts.map((e) => s.y(e.values[lastIndex(e.values)]!) + 4),
							13
						)}
						{#each lasts as e, k (e.cls)}
							<text class={`endl ${e.cls}-t`} x={s.x(lastIndex(e.values)) + 5} y={ys[k]}>{e.letter}</text>
						{/each}
					{/snippet}
				</TrendChart>
				<ul class="legend">
					<li>
						<svg width="26" height="8" aria-hidden="true"><path class="f1" d="M1 4h24" /></svg>{t(
							'trends.feel.mood'
						)}
					</li>
					<li>
						<svg width="26" height="8" aria-hidden="true"><path class="f2" d="M1 4h24" /></svg>{t(
							'trends.feel.energy'
						)}
					</li>
					<li>
						<svg width="26" height="8" aria-hidden="true"><path class="f3" d="M1 4h24" /></svg>{t(
							'trends.feel.stress'
						)}
					</li>
				</ul>
			</Card>
		{/if}

		{#if showSleep}
			<Card title={t('trends.sleep.title')}>
				{#if sleep.averageMinutes !== null}
					<p class="sub">
						{t('trends.sleep.sub', { avg: formatDuration(Math.round(sleep.averageMinutes)) })}
					</p>
				{/if}
				<TrendChart
					{days}
					yMin={0}
					yMax={sleepTop}
					yTicks={[0, sleepTop / 2, sleepTop]}
					yFormat={(n) => t('trends.sleep.hours', { h: n })}
					label={aria(hasNaps ? 'trends.sleep.aria.naps' : 'trends.sleep.aria')}
					padBottom={showBadges ? 42 : 22}
				>
					{#snippet layers(s)}
						{#each sleep.minutes as m, i (i)}
							{@const nap = sleep.napMinutes[i] ?? null}
							{#if m !== null}
								<rect
									class="sbar"
									x={s.x(i) - bw(s) / 2}
									y={s.y(hours(m))}
									width={bw(s)}
									height={Math.max(0, s.bottom - s.y(hours(m)))}
									rx="2"
								/>
							{/if}
							{#if nap !== null}
								{@const top = s.y(hours((m ?? 0) + nap))}
								{@const low = s.y(hours(m ?? 0))}
								<rect
									class="nbar"
									x={s.x(i) - bw(s) / 2}
									y={top}
									width={bw(s)}
									height={Math.max(1, low - top - (m !== null ? 1 : 0))}
									rx="2"
								/>
							{/if}
							{#if showBadges && sleep.quality[i] != null}
								<rect class="badge" x={s.x(i) - 8} y={s.bottom + 5} width="16" height="16" rx="8" />
								<text class="badge-t" x={s.x(i)} y={s.bottom + 17} text-anchor="middle"
									>{sleep.quality[i]}</text
								>
							{/if}
						{/each}
					{/snippet}
				</TrendChart>
				{#if hasNaps}
					<p class="key" aria-hidden="true">
						<span><i class="sw sbar"></i>{t('trends.sleep.legend.main')}</span>
						<span><i class="sw nbar"></i>{t('trends.sleep.legend.nap')}</span>
					</p>
					<p class="napsum">
						<Icon name="nap" size={18} />
						{t('trends.sleep.naps', {
							count: sleep.napCount,
							avg: formatDuration(Math.round(sleep.napAverageMinutes ?? 0))
						})}
					</p>
				{/if}
				{#if hasQuality}
					<p class="hint">
						{showBadges ? t('trends.sleep.quality.row') : t('trends.sleep.quality.summary')} ({t(
							'trends.sleep.quality.scale',
							{ low: t('sleep.quality.low'), high: t('sleep.quality.high') }
						)})
					</p>
					{#if !showBadges}
						<ul class="qrow">
							{#each [5, 4, 3, 2, 1] as q (q)}
								{#if sleep.qualityCounts[q - 1]! > 0}
									<li>
										<span class="qbadge" aria-label={t('trends.sleep.quality.night', { q })}>{q}</span>
										<span>×{sleep.qualityCounts[q - 1]}</span>
									</li>
								{/if}
							{/each}
						</ul>
					{/if}
				{/if}
			</Card>
		{/if}

		{#if showWeight}
			{@render measureCard(t('trends.weight.title'), weight.unit, weight.values)}
		{/if}
		{#if showBp}
			{@render bpCard()}
		{/if}
		{#if showPulse}
			{@render measureCard(t('measure.pulse'), pulse.unit || 'bpm', pulse.values)}
		{/if}
		{#each showOwn ? own : [] as type (type.id)}
			{@render measureCard(type.name, type.unit, measurementSeries(recs, days, type.id).values)}
		{/each}

		{#if showFluids}
			<Card title={t('trends.fluids.title')}>
				<p class="sub">{t('trends.fluids.sub', { avg: num(Math.round(mlToCl(fluids.averageMl ?? 0))) })}</p>
				<TrendChart
					{days}
					yMin={0}
					yMax={fluidTop}
					yTicks={[0, fluidTop / 2, fluidTop]}
					label={aria('trends.fluids.aria')}
				>
					{#snippet layers(s)}
						{#each fluids.totalMl as ml, i (i)}
							{#if ml !== null}
								<rect
									class="fbar"
									x={s.x(i) - bw(s) / 2}
									y={s.y(mlToCl(ml))}
									width={bw(s)}
									height={Math.max(0, s.bottom - s.y(mlToCl(ml)))}
									rx="2"
								/>
							{/if}
						{/each}
					{/snippet}
				</TrendChart>
			</Card>
		{/if}

		{#if showDoses}
			<Card title={t('trends.meds.title')}>
				<p class="sub">
					{t('trends.meds.sub', {
						taken: doses.totals.taken,
						late: doses.totals.late,
						skipped: doses.totals.skipped
					})}
				</p>
				<TrendChart {days} yMin={0} yMax={doseTop} yTicks={[0, doseTop]} label={aria('trends.meds.aria')}>
					{#snippet layers(s)}
						{#each doses.days as d, i (i)}
							{@const x = s.x(i) - bw(s) / 2}
							{#if d.taken > 0}
								<rect class="mt" {x} y={s.y(d.taken)} width={bw(s)} height={s.bottom - s.y(d.taken)} />
							{/if}
							{#if d.late > 0}
								<rect
									class="ml"
									{x}
									y={s.y(d.taken + d.late)}
									width={bw(s)}
									height={s.y(d.taken) - s.y(d.taken + d.late)}
								/>
							{/if}
							{#if d.skipped > 0}
								<rect
									class="ms"
									{x}
									y={s.y(d.taken + d.late + d.skipped)}
									width={bw(s)}
									height={s.y(d.taken + d.late) - s.y(d.taken + d.late + d.skipped)}
								/>
							{/if}
						{/each}
					{/snippet}
				</TrendChart>
				<ul class="legend">
					<li><span class="sw mt"></span>{t('trends.meds.taken')}</li>
					<li><span class="sw ml"></span>{t('trends.meds.late')}</li>
					<li><span class="sw ms"></span>{t('trends.meds.skipped')}</li>
				</ul>
			</Card>
		{/if}

		{#if showBowel}
			<Card title={t('trends.bowel.title')}>
				<p class="sub">{tn('trends.bowel.sub', bowel.length)}</p>
				<TrendChart
					{days}
					yMin={0.5}
					yMax={7.5}
					yTicks={[1, 2, 3, 4, 5, 6, 7]}
					label={aria('trends.bowel.aria')}
					height={170}
				>
					{#snippet layers(s)}
						{#each bowel as b, i (i)}
							<circle
								class="bdot"
								cx={s.left + (b.dayIndex + 0.1 + b.frac * 0.8) * s.slot}
								cy={s.y(b.type)}
								r="3"
							/>
						{/each}
					{/snippet}
				</TrendChart>
			</Card>
		{/if}

		{#if showGut}
			<Card title={t('trends.gut.title')}>
				<p class="sub">{t('trends.gut.sub', { n: gut.nauseaDays, m: gut.heartburnDays })}</p>
				<TrendChart {days} yMin={0.5} yMax={5.5} yTicks={[1, 3, 5]} label={aria('trends.gut.aria')}>
					{#snippet layers(s)}
						{#each gut.nausea as v, i (i)}
							{#if v !== null}<circle class="ndot" cx={s.x(i)} cy={s.y(v)} r="3.5" />{/if}
						{/each}
						{#each gut.heartburn as v, i (i)}
							{#if v !== null}
								<rect
									class="hdot"
									x={s.x(i) - 3.5}
									y={s.y(v) - 3.5}
									width="7"
									height="7"
									transform={`rotate(45 ${s.x(i)} ${s.y(v)})`}
								/>
							{/if}
						{/each}
					{/snippet}
				</TrendChart>
				<ul class="legend">
					<li>
						<svg width="12" height="12" aria-hidden="true"><circle class="ndot" cx="6" cy="6" r="4" /></svg
						>{t('gut.kind.nausea')}
					</li>
					<li>
						<svg width="12" height="12" aria-hidden="true"
							><rect class="hdot" x="3" y="3" width="6" height="6" transform="rotate(45 6 6)" /></svg
						>{t('gut.kind.heartburn')}
					</li>
				</ul>
			</Card>
		{/if}

		{#if showPain}
			<Card title={t('trends.pain.title')}>
				<p class="sub">
					{t('trends.pain.sub', {
						entries: tn('trends.entries', pain.entries),
						days: tn('trends.days', pain.daysWithPain)
					})}
				</p>
				<TrendChart
					{days}
					yMin={0}
					yMax={10}
					yTicks={[0, 5, 10]}
					label={aria('trends.pain.aria')}
					height={170}
				>
					{#snippet layers(s)}
						{#each runs(pain.days) as run (run.start)}
							{@const xs = run.items.map((_, k) => s.x(run.start + k))}
							{#if run.items.length >= 2}
								<path
									class="pband"
									d={bandPath(
										run.items.map((d, k) => ({ x: xs[k]!, y: s.y(d.max) })),
										run.items.map((d, k) => ({ x: xs[k]!, y: s.y(d.min) }))
									)}
								/>
								<path class="pline" d={linePath(run.items.map((d, k) => ({ x: xs[k]!, y: s.y(d.avg) })))} />
							{:else if run.items[0]!.max !== run.items[0]!.min}
								<line
									class="pbar"
									x1={xs[0]}
									x2={xs[0]}
									y1={s.y(run.items[0]!.max)}
									y2={s.y(run.items[0]!.min)}
								/>
							{/if}
							{#if run.items.length === 1 || !dense}
								{#each run.items as d, k (k)}
									<circle class="pdot" cx={xs[k]} cy={s.y(d.avg)} r="2.5" />
								{/each}
							{/if}
						{/each}
					{/snippet}
				</TrendChart>
				<ul class="legend">
					<li>
						<svg width="26" height="10" aria-hidden="true"><path class="pline" d="M1 5h24" /></svg>{t(
							'trends.pain.avg'
						)}
					</li>
					<li><span class="sw pband"></span>{t('trends.pain.band')}</li>
				</ul>
				<p class="hint">{t('trends.pain.gaps')}</p>
			</Card>
		{/if}

		{#if showEpisodes}
			<Card title={t('trends.episodes.title')}>
				<p class="sub">{t('trends.episodes.sub')}</p>
				<ul class="eps">
					{#each episodes as ep (ep.id)}
						<li>
							<button type="button" onclick={() => openEpisode(ep.id)}>
								<span class="en">{ep.name}</span>
								<span class="em"
									>{t('trends.episodes.line', {
										range: episodeRange(i18n.locale, ep),
										days: tn('trends.days', ep.spanDays),
										avg: ep.average === null ? '–' : num(Math.round(ep.average))
									})}</span
								>
							</button>
						</li>
					{/each}
				</ul>
				<p class="hint">{t('trends.episodes.foot')}</p>
			</Card>
		{/if}

		{#if showPeriod}
			<Card>
				<div class="cardhead">
					<CategoryBadge category="period" size={36} />
					<h2 class="ctitle">{t('cat.period')}</h2>
				</div>
				<div class="dow" aria-hidden="true">
					{#each dayNames as n, i (i)}<span>{n}</span>{/each}
				</div>
				<div class="cal" role="group" aria-label={aria('trends.period.chart')} data-testid="period-calendar">
					{#each periodWeeks as week, w (w)}
						{#each week as cell (cell.day)}
							<div class="cd" class:out={!cell.inRange} class:today={cell.day === today}>
								<span class="m" aria-hidden="true">
									{#if cell.flow}
										{@const px = [8, 10, 16, 21][flowSize(cell.flow) - 1]}
										<i class:ring={cell.flow === 'spotting'} style:width="{px}px" style:height="{px}px"></i>
									{/if}
								</span>
								<span aria-hidden="true">{dayDate(cell.day).getDate()}</span>
								{#if cell.flow}<span class="sr-only"
										>{longDay.format(dayDate(cell.day))}: {t(`period.flow.${cell.flow}` as MessageKey)}</span
									>{/if}
							</div>
						{/each}
					{/each}
				</div>
				<ul class="legend pl" aria-hidden="true">
					{#each FLOWS as f (f)}
						{@const px = [8, 10, 14, 18][flowSize(f) - 1]}
						<li>
							<i class="pdotl" class:ring={f === 'spotting'} style:width="{px}px" style:height="{px}px"
							></i>{t(`period.flow.${f}` as MessageKey)}
						</li>
					{/each}
				</ul>
				<p class="fact"><span>{t('trends.period.logged')}</span><b>{periodDays}</b></p>
			</Card>
		{/if}

		{#if showBladder}
			<Card>
				<div class="cardhead">
					<CategoryBadge category="bladder" size={36} />
					<h2 class="ctitle">{t('cat.bladder')}</h2>
					<span class="sub">{t('trends.bladder.sub')}</span>
				</div>
				<TrendChart
					{days}
					yMin={0}
					yMax={bladderTop}
					yTicks={[0, bladderTop / 2, bladderTop]}
					yFormat={(n) => String(Math.round(n))}
					label={aria('trends.bladder.chart')}
				>
					{#snippet layers(s)}
						{#each bladder.days as d (d.day)}
							{@const i = bladderIdx.get(d.day)!}
							<rect
								class="vbar"
								x={s.x(i) - bw(s) / 2}
								y={s.y(d.visits)}
								width={bw(s)}
								height={Math.max(0, s.bottom - s.y(d.visits))}
								rx="2"
							/>
						{/each}
					{/snippet}
				</TrendChart>
				{#if trackerOn('drink') && showFluids}
					<p class="sub drinkrow">
						<CategoryBadge category="drink" size={22} />{t('trends.bladder.drinks')}
					</p>
					<TrendChart
						{days}
						yMin={0}
						yMax={fluidTop}
						yTicks={[0, fluidTop / 2, fluidTop]}
						label={aria('trends.bladder.drinksChart')}
						height={110}
					>
						{#snippet layers(s)}
							{#each fluids.totalMl as ml, i (i)}
								{#if ml !== null}
									<rect
										class="fbar"
										x={s.x(i) - bw(s) / 2}
										y={s.y(mlToCl(ml))}
										width={bw(s)}
										height={Math.max(0, s.bottom - s.y(mlToCl(ml)))}
										rx="2"
									/>
								{/if}
							{/each}
						{/snippet}
					</TrendChart>
				{/if}
				<p class="fact"><span>{t('trends.bladder.discomfort')}</span><b>{bladder.daysWithDiscomfort}</b></p>
				<p class="fact">
					<span>{t('trends.bladder.leak')}</span><b>{bladder.daysWithLeak}</b>
				</p>
				{#if bladder.daysWithLeak > 0}
					{#each ['on_the_way', 'afterwards', 'moving'] as w (w)}
						{#if bladder.leakWhen[w as 'on_the_way' | 'afterwards' | 'moving'] > 0}
							<p class="fact subf">
								<span>{t(`bladder.when.${w}` as MessageKey)}</span><b
									>{bladder.leakWhen[w as 'on_the_way' | 'afterwards' | 'moving']}</b
								>
							</p>
						{/if}
					{/each}
				{/if}
			</Card>
		{/if}

		{#if trackerOn('pain')}<HeatMapCard {days} />{/if}

		{#if trackerOn('food')}<AfterMeals {days} />{/if}
	</div>
{/if}

<style>
	.eps {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
	}
	.eps li {
		border-top: 1px solid var(--line);
	}
	.eps li:first-child {
		border-top: 0;
	}
	.eps button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		padding: var(--sp-3) 0;
		text-align: left;
	}
	.en {
		font-weight: var(--fw-semibold);
		overflow-wrap: anywhere;
	}
	.em {
		font-size: var(--fs-callout);
		color: var(--text-2);
	}
	.reports-link {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 36px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
	}
	.custom {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.custom label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		min-width: 0;
	}
	.custom input {
		min-height: 44px;
		min-width: 0;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-callout);
	}
	.custom input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.problem {
		margin-top: var(--sp-2);
		color: var(--pain-ink);
		font-size: var(--fs-footnote);
	}
	.range {
		margin: var(--sp-3) 0;
		color: var(--text-2);
		font-size: var(--fs-footnote);
	}
	.cards {
		display: grid;
		gap: var(--sp-3);
	}
	.cards > :global(.card + .card) {
		margin-top: 0;
	}
	.sub,
	.hint {
		color: var(--text-2);
		font-size: var(--fs-footnote);
	}
	.hint {
		margin-top: var(--sp-2);
	}
	.legend {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2) var(--sp-4);
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
	}

	/* Chart marks. Meaning never rests on colour alone: dash styles, shapes, outlines and labels carry it too. */
	.f1,
	.f2,
	.f3,
	.wl,
	.wl2,
	.pline {
		fill: none;
		stroke-width: 2.5;
	}
	.f1 {
		stroke: var(--feel-ink);
	}
	.f2 {
		stroke: var(--food-ink);
		stroke-dasharray: 7 4;
	}
	.f3 {
		stroke: var(--measure-ink);
		stroke-dasharray: 1 5;
	}
	.f1-dot {
		fill: var(--feel-ink);
	}
	.f2-dot {
		fill: var(--food-ink);
	}
	.f3-dot {
		fill: var(--measure-ink);
	}
	.endl {
		font-size: 12px;
		font-weight: 700;
		font-family: var(--font-sans);
	}
	.f1-t {
		fill: var(--feel-ink);
	}
	.f2-t {
		fill: var(--food-ink);
	}
	.f3-t {
		fill: var(--measure-ink);
	}
	.sbar {
		fill: var(--sleep-ink);
		opacity: 0.85;
	}
	/* The nap on top of the night: the same hue, lighter. Also told apart by position and the 1 px gap. */
	.nbar {
		fill: var(--sleep-ink);
		opacity: 0.4;
	}
	.key {
		display: flex;
		gap: var(--sp-4);
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.key span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.sw {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--sleep-ink);
	}
	.sw.sbar {
		opacity: 0.85;
	}
	.sw.nbar {
		opacity: 0.4;
	}
	.napsum {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: var(--sp-3) 0 0;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--line);
		font-size: var(--fs-callout);
		color: var(--text);
	}
	.badge {
		fill: var(--sleep-tint);
		stroke: var(--sleep-ink);
		stroke-width: 1;
	}
	.badge-t {
		font-size: 11px;
		font-weight: 700;
		fill: var(--sleep-ink);
		font-family: var(--font-sans);
	}
	.qrow {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2) var(--sp-4);
	}
	.qrow li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
	.qbadge {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--sleep-tint);
		border: 1px solid var(--sleep-ink);
		color: var(--sleep-ink);
		font-size: var(--fs-caption);
		font-weight: 700;
	}
	.wl {
		stroke: var(--measure-ink);
	}
	.wl2 {
		stroke: var(--measure-ink);
		stroke-dasharray: 7 4;
	}
	.wl2-dot {
		fill: var(--surface);
		stroke: var(--measure-ink);
		stroke-width: 2;
	}
	.wl-dot {
		fill: var(--surface);
		stroke: var(--measure-ink);
		stroke-width: 2;
	}
	.cardhead {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.ctitle {
		flex: 1;
		font-size: var(--fs-body);
		font-weight: var(--fw-semibold);
	}
	.dow {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		text-align: center;
		font-size: 11px;
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: var(--sp-3) 0 2px;
	}
	.cal {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		row-gap: 2px;
	}
	.cd {
		height: 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		padding-top: 3px;
		font-size: 11px;
		color: var(--text-2);
		border-radius: 8px;
	}
	.cd.today {
		box-shadow: inset 0 0 0 1.5px var(--text-3);
	}
	.cd.out {
		opacity: 0.35;
	}
	.cd .m {
		height: 24px;
		display: grid;
		place-items: center;
	}
	.cd .m i,
	.pdotl {
		display: block;
		border-radius: 50%;
		background: var(--period-mark);
	}
	.cd .m i.ring,
	.pdotl.ring {
		background: none;
		box-shadow: inset 0 0 0 2px var(--period-mark);
	}
	.legend.pl {
		margin-top: var(--sp-3);
	}
	.fact {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: 8px 0;
		border-top: 1px solid var(--line);
		font-size: var(--fs-callout);
		margin: 0;
	}
	.fact:first-of-type {
		margin-top: var(--sp-2);
	}
	.fact b {
		font-weight: var(--fw-semibold);
	}
	.subf {
		padding: 4px 0 4px var(--sp-3);
		font-size: var(--fs-footnote);
		color: var(--text-2);
		border-top: 0;
	}
	.subf b {
		color: var(--text);
	}
	.vbar {
		fill: var(--bladder-mark);
		opacity: 0.85;
	}
	.drinkrow {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--sp-3);
	}
	.fbar {
		fill: var(--drink-ink);
		opacity: 0.8;
	}
	.mt {
		fill: var(--meds-ink);
	}
	.ml {
		fill: var(--meds-tint);
		stroke: var(--meds-ink);
		stroke-width: 1.5;
	}
	.ms {
		fill: var(--text-3);
	}
	.sw.mt {
		background: var(--meds-ink);
	}
	.sw.ml {
		background: var(--meds-tint);
		border: 1.5px solid var(--meds-ink);
	}
	.sw.ms {
		background: var(--text-3);
	}
	.bdot {
		fill: var(--gut-ink);
		opacity: 0.85;
	}
	.ndot {
		fill: var(--gut-ink);
	}
	.hdot {
		fill: var(--surface);
		stroke: var(--food-ink);
		stroke-width: 2;
	}
	.pband {
		fill: var(--pain-ink);
		fill-opacity: 0.2;
		stroke: none;
	}
	.sw.pband {
		background: color-mix(in srgb, var(--pain-ink) 20%, var(--surface));
		border: 1px solid var(--pain-ink);
	}
	.pline {
		stroke: var(--pain-ink);
	}
	.pdot {
		fill: var(--pain-ink);
	}
	.pbar {
		stroke: var(--pain-ink);
		stroke-width: 5;
		stroke-linecap: round;
		opacity: 0.35;
	}
</style>
