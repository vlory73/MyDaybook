<script lang="ts">
	/**
	 * The A4 sheets (portrait, 794 x 1123 CSS px) of the Doctor visit report, in the report's own language. Black and
	 * grey on white, fixed print colours, system fonts, no external resources. The content is a list of units (a heading,
	 * a table row, a chart, ...). Every unit is drawn once out of sight and measured; `paginate` then fills the sheets
	 * so no row and no chart is cut in half. The print page scales the sheets to fit a phone and prints them as they are.
	 */
	import { tick } from 'svelte';
	import { brand } from '$lib/brand';
	import BodyMap from '$lib/components/BodyMap.svelte';
	import type { Shape } from '$lib/bodymap/catalogue';
	import { translate, translatePlural, type Locale } from '$lib/i18n/core';
	import type { MessageKey } from '$lib/i18n/en';
	import { heatKey, tokenFor, type Bucket } from '$lib/trends/heatmap';
	import DoctorChart from './DoctorChart.svelte';
	import {
		paginate,
		periodText,
		runsOf,
		unitsOf,
		type DoctorReport,
		type Part,
		type Placed,
		type TableId
	} from './doctor';
	import { periodLabel } from './headache';

	let {
		report,
		locale,
		name = '',
		today,
		last = true
	}: {
		report: DoctorReport;
		locale: Locale;
		name?: string;
		/** Day key of the printing date. */
		today: string;
		/** True when no other pages follow, so the last sheet need not end with a page break. */
		last?: boolean;
	} = $props();

	const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
	const plural = (
		base: 'dr.days' | 'dr.times' | 'dr.entries' | 'dr.bowel' | 'dr.gut',
		n: number,
		vars = {}
	) => translatePlural(locale, base, n, vars);

	const units = $derived(unitsOf(report, locale));
	const period = $derived(periodText(report, locale));
	const printed = $derived(periodLabel(today, today, locale));

	// Fixed heights of the sheet parts (CSS px); what is left is the room for units.
	const SHEET_H = 1123;
	const PAD_TOP = 34;
	const PAD_BOTTOM = 22;
	const HEAD_FIRST = 134;
	const HEAD_NEXT = 60;
	const FOOT = 34;
	const SAFETY = 6;
	const room = (page: number) =>
		SHEET_H - PAD_TOP - PAD_BOTTOM - (page === 0 ? HEAD_FIRST : HEAD_NEXT) - FOOT - SAFETY;

	let measureEl: HTMLElement | undefined = $state();
	let pages = $state<Placed[][] | null>(null);
	const sized = $derived(units.map((u) => ({ h: 0, keepNext: u.keepNext, table: u.table })));

	$effect(() => {
		const all = units;
		if (!measureEl) return;
		const el = measureEl;
		let cancelled = false;
		void tick().then(async () => {
			// System fonts need no loading, but a fallback font swap would change heights.
			try {
				await document.fonts?.ready;
			} catch {
				// Fine without.
			}
			if (cancelled) return;
			const heights = [...el.querySelectorAll<HTMLElement>('[data-u]')].map((e) => e.offsetHeight);
			const heads: Record<string, number> = {};
			for (const e of el.querySelectorAll<HTMLElement>('[data-head]'))
				heads[e.dataset.head!] = e.offsetHeight;
			pages = paginate(
				all.map((u, i) => ({ h: heights[i] ?? 0, keepNext: u.keepNext, table: u.table })),
				room,
				heads
			);
		});
		return () => {
			cancelled = true;
		};
	});
	$effect(() => {
		// A new report starts a new layout.
		void units;
		pages = null;
	});

	const tableIds = $derived([...new Set(units.flatMap((u) => (u.table ? [u.table] : [])))] as TableId[]);

	// ---- Heat map ----
	const ROLLED = ['head', 'back_of_head', 'hand', 'foot'];
	function cellOf(s: Shape) {
		const heat = report.pain!.heat;
		let h;
		if (ROLLED.includes(s.region)) {
			const key =
				s.region === 'hand' || s.region === 'foot' ? heatKey(s.region, s.side) : heatKey('head', 'midline');
			h = heat.roll.get(key);
		} else h = heat.places.get(heatKey(s.region, s.side));
		return { token: h ? tokenFor(h.days, report.pain!.steps) : 0, num: null, showNum: false };
	}
	const heatFor = (view: 'front' | 'back') => ({
		cell: (s: Shape) => cellOf(s),
		aria: `${tr('dr.pain')}: ${tr(view === 'front' ? 'dr.front' : 'dr.back')}`
	});
	const stepLabel = (b: Bucket) =>
		b.to === null
			? b.from === 1
				? tr('dr.day1')
				: `${b.from}+`
			: b.from === b.to
				? b.from === 1
					? tr('dr.day1')
					: String(b.from)
				: `${b.from}–${b.to}`;
</script>

{#snippet cols(table: TableId)}
	<colgroup>
		{#if table === 'meds'}
			<col style:width="150px" /><col style:width="85px" /><col style:width="82px" /><col
				style:width="171px"
			/><col style:width="62px" /><col style:width="82px" /><col style:width="66px" />
		{:else if table === 'need'}
			<col style:width="230px" /><col style:width="150px" /><col style:width="130px" /><col
				style:width="188px"
			/>
		{:else if table === 'episodes'}
			<col style:width="250px" /><col style:width="90px" /><col style:width="190px" /><col
				style:width="80px"
			/><col style:width="88px" />
		{:else}
			<col style:width="120px" /><col style:width="578px" />
		{/if}
	</colgroup>
{/snippet}

{#snippet thead(table: TableId)}
	<tr>
		{#if table === 'meds'}
			<th>{tr('dr.col.medicine')}</th><th>{tr('dr.col.strength')}</th><th>{tr('dr.col.form')}</th><th
				>{tr('dr.col.schedule')}</th
			><th class="r">{tr('dr.col.taken')}</th><th class="r">{tr('dr.col.skipped')}</th><th class="r"
				>{tr('dr.col.late')}</th
			>
		{:else if table === 'need'}
			<th>{tr('dr.col.medicine')}</th><th>{tr('dr.col.strength')}</th><th class="r">{tr('dr.col.times')}</th
			><th>{tr('dr.col.last')}</th>
		{:else if table === 'episodes'}
			<th>{tr('dr.col.episode')}</th><th>{tr('dr.col.from')}</th><th>{tr('dr.col.to')}</th><th class="r"
				>{tr('dr.col.days')}</th
			><th class="r">{tr('dr.col.avg')}</th>
		{:else}
			<th>{tr('dr.col.date')}</th><th>{tr('dr.col.note')}</th>
		{/if}
	</tr>
{/snippet}

{#snippet row(part: Extract<Part, { t: 'row' }>)}
	<tr>
		{#if part.table === 'meds'}
			{@const m = report.medicines!.regular[part.i]!}
			<td><b>{m.name}</b></td><td>{m.strength}</td><td>{m.form}</td><td>{m.schedule}</td><td class="r"
				>{m.taken}</td
			><td class="r">{m.skipped}</td><td class="r">{m.late}</td>
		{:else if part.table === 'need'}
			{@const m = report.medicines!.asNeeded[part.i]!}
			<td><b>{m.name}</b></td><td>{m.strength}</td><td class="r">{plural('dr.times', m.times)}</td><td
				>{m.last}</td
			>
		{:else if part.table === 'episodes'}
			{@const e = report.episodes![part.i]!}
			<td><b>{e.name}</b></td><td>{e.from}</td><td>{e.to}</td><td class="r">{e.days}</td><td class="r"
				>{e.avg ?? ''}</td
			>
		{:else}
			{@const n = report.notes![part.i]!}
			<td class="when">{n.when}</td><td class="text"><div class="clamp">{n.text}</div></td>
		{/if}
	</tr>
{/snippet}

{#snippet unit(part: Part)}
	{#if part.t === 'h2'}
		<h2>{part.text}</h2>
	{:else if part.t === 'sub'}
		<p class="sub">{part.text}</p>
	{:else if part.t === 'fine'}
		<p class="fine">{part.text}</p>
	{:else if part.t === 'questions'}
		<div class="q"><div class="clamp q-text">{part.text}</div></div>
	{:else if part.t === 'callout'}
		<div class="callout">
			<b>{plural('dr.days', report.headacheDays!.count)}</b>
			{tr('dr.headache.rest')}
			{#if report.headacheDays!.seeDiary}<br />{tr('dr.headache.see')}{/if}
		</div>
	{:else if part.t === 'counts'}
		<div class="counts">
			{#if report.bowel}
				<div class="cnt">
					<b>{report.bowel.count}</b>
					<span>{plural('dr.bowel', report.bowel.count, { days: plural('dr.days', report.bowel.days) })}</span
					>
				</div>
			{/if}
			{#if report.gut}
				<div class="cnt">
					<b>{report.gut.count}</b>
					<span>{plural('dr.gut', report.gut.count, { days: plural('dr.days', report.gut.days) })}</span>
				</div>
			{/if}
		</div>
	{:else if part.t === 'charts'}
		{@const two = part.charts.length === 2}
		<div class={['charts', { two }]}>
			{#each part.charts as c (c.id)}
				<div class="ch">
					<h3>{c.title}</h3>
					<p>{c.sub}</p>
					<DoctorChart spec={c} {locale} w={two ? 338 : 698} h={c.id === 'feeling' ? 132 : 108} />
					{#if c.legend}
						<div class="key">
							{#each c.series as s, k (s.key)}<span
									><i
										style:background={c.id === 'bp' && k === 1
											? `repeating-linear-gradient(90deg, ${s.color} 0 5px, transparent 5px 8px)`
											: s.color}
									></i>{s.label}</span
								>{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else if part.t === 'pain'}
		{@const pain = report.pain!}
		<div class="pain tokens">
			<div class="figs">
				{#each ['front', 'back'] as const as view (view)}
					<figure>
						<figcaption>{tr(view === 'front' ? 'dr.front' : 'dr.back')}</figcaption>
						<BodyMap
							{view}
							showToggle={false}
							width={138}
							heat={heatFor(view)}
							edgeText={(side) => translate(locale, `dr.side.${side}`)}
						/>
					</figure>
				{/each}
			</div>
			<div class="side">
				<p class="lgt">{tr('dr.legend')}</p>
				<div class="lg">
					<span><i style:background="var(--heat-0)"></i>{tr('dr.notLogged')}</span>
					{#each pain.steps as b (b.from)}
						<span><i style:background="var(--heat-{b.token})"></i>{stepLabel(b)}</span>
					{/each}
				</div>
				<table class="places">
					<colgroup
						><col style:width="22px" /><col /><col style:width="70px" /><col style:width="46px" /></colgroup
					>
					<thead>
						<tr
							><th></th><th>{tr('dr.col.place')}</th><th class="r">{tr('dr.col.days')}</th><th class="r"
								>{tr('dr.col.avg')}</th
							></tr
						>
					</thead>
					<tbody>
						{#each pain.rows as p, i (i)}
							<tr>
								<td class="sw"><i style:background="var(--heat-{p.token})"></i></td>
								<td>{p.name}</td>
								<td class="r">{plural('dr.days', p.days)}</td>
								<td class="r">{p.avg ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="fine">
					{tr('dr.fn.pain', {
						entries: plural('dr.entries', pain.entries),
						days: plural('dr.days', pain.days)
					})}
				</p>
			</div>
		</div>
	{/if}
{/snippet}

<div class="docs">
	{#if !pages}
		<!-- Out of sight: every unit drawn once at the width of a sheet's content, to read its height. -->
		<div class="measure" bind:this={measureEl} aria-hidden="true">
			{#each units as u, i (u.id)}
				<div class="u" data-u={i}>
					{#if u.part.t === 'row'}
						<table class="t">
							{@render cols(u.part.table)}
							<tbody>{@render row(u.part)}</tbody>
						</table>
					{:else}
						{@render unit(u.part)}
					{/if}
				</div>
			{/each}
			{#each tableIds as id (id)}
				<table class="t" data-head={id}>
					{@render cols(id)}
					<thead>{@render thead(id)}</thead>
				</table>
			{/each}
		</div>
	{/if}

	{#if pages}
		{#each pages as placed, p (p)}
			<section
				class={['dsheet', { final: last && p === pages.length - 1 }]}
				lang={locale}
				data-testid="doctor-page"
			>
				{#if p === 0}
					<header class="first">
						<div class="top">
							<div>
								<h1>{tr('dr.title')}</h1>
								<p class="app">{tr('rep.madeWith', { app: brand.displayName })}</p>
							</div>
							<dl>
								<div>
									<dt>{tr('dr.printed')}</dt>
									<dd>{printed}</dd>
								</div>
							</dl>
						</div>
						<div class="who">
							<div class="nm">
								<span class="lbl">{tr('rep.name')}</span>
								<span class={['name', { blank: name.trim() === '' }]} data-testid="doctor-name"
									>{name.trim() || ' '}</span
								>
							</div>
							<div class="per">
								<span class="lbl">{tr('rep.period')}</span>
								<span class="val">{period}</span>
							</div>
							<div class="cpr"><span>{tr('dr.cpr')}</span><i></i></div>
						</div>
					</header>
				{:else}
					<header class="next">
						<h1>{tr('dr.title')}</h1>
						<p class="app"><b>{name.trim()}</b>{name.trim() ? ' · ' : ''}{period}</p>
					</header>
				{/if}
				<div class="body">
					{#each runsOf(placed, sized) as run, r (r)}
						{#if run.table}
							{@const tid = run.table as TableId}
							<div class="u">
								<table class="t">
									{@render cols(tid)}
									<thead>{@render thead(tid)}</thead>
									<tbody>
										{#each run.items as it (it.i)}
											{@const part = units[it.i]!.part}
											{#if part.t === 'row'}{@render row(part)}{/if}
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<div class="u">{@render unit(units[run.items[0]!.i]!.part)}</div>
						{/if}
					{/each}
				</div>
				<footer>
					<span><em>{tr('dr.footer', { app: brand.displayName })}</em></span>
					<span>{tr('rep.page', { page: p + 1, total: pages.length })}</span>
				</footer>
			</section>
		{/each}
	{/if}
</div>

<style>
	.docs {
		display: flex;
		flex-direction: column;
		gap: 16px;
		position: relative;
	}
	.measure {
		position: absolute;
		left: -10000px;
		top: 0;
		width: 698px;
		visibility: hidden;
		pointer-events: none;
		font:
			12px/1.35 system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			Arial,
			sans-serif;
		font-variant-numeric: tabular-nums;
		color: #111;
	}
	.measure :global(*),
	.dsheet :global(*) {
		box-sizing: border-box;
	}
	.u {
		display: flow-root;
	}

	.dsheet {
		width: 794px;
		height: 1123px;
		padding: 34px 48px 22px;
		background: #fff;
		color: #111;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 0 0 1px #bbb;
		break-after: page;
		page: report-portrait;
		font:
			12px/1.35 system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			Arial,
			sans-serif;
		font-variant-numeric: tabular-nums;
	}
	.dsheet.final {
		break-after: auto;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	h1,
	h2,
	h3,
	p,
	dl,
	dd,
	figure {
		margin: 0;
	}

	/* ---- Header ---- */
	header.first {
		flex: none;
		height: 134px;
		border-bottom: 2px solid #111;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding-bottom: 8px;
	}
	header.first .top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 24px;
	}
	h1 {
		font-size: 26px;
		line-height: 1.1;
		font-weight: 700;
	}
	.app {
		font-size: 12px;
		color: #555;
		margin-top: 2px;
	}
	dt {
		font-size: 11px;
		color: #555;
	}
	dd {
		font-size: 13px;
		font-weight: 600;
	}
	header.first dl {
		text-align: right;
	}
	.who {
		display: flex;
		align-items: flex-end;
		gap: 24px;
	}
	.lbl {
		display: block;
		font-size: 11px;
		color: #555;
	}
	.nm {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
		font-size: 23px;
		line-height: 27px;
		font-weight: 700;
		min-height: 27px;
	}
	.name.blank {
		border-bottom: 1px solid #111;
	}
	.per .val {
		display: block;
		font-size: 13px;
		font-weight: 600;
		line-height: 20px;
		white-space: nowrap;
	}
	.cpr {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
		width: 170px;
		line-height: 20px;
	}
	.cpr i {
		flex: 1;
		border-bottom: 1px solid #111;
		height: 16px;
	}
	header.next {
		flex: none;
		height: 60px;
		border-bottom: 2px solid #111;
	}
	header.next h1 {
		font-size: 18px;
	}
	header.next .app {
		font-size: 13px;
		color: #444;
	}
	header.next .app b {
		font-size: 15px;
		color: #111;
	}

	/* ---- Content ---- */
	h2 {
		font-size: 15px;
		line-height: 20px;
		margin-top: 16px;
		margin-bottom: 6px;
		padding-bottom: 3px;
		border-bottom: 1px solid #999;
	}
	.sub {
		font-size: 11px;
		font-weight: 600;
		color: #333;
		margin: 10px 0 3px;
	}
	.fine {
		font-size: 10.5px;
		color: #555;
		margin-top: 5px;
		line-height: 1.35;
	}
	.q {
		border: 1px solid #888;
		border-radius: 3px;
		padding: 8px 10px;
		background: #fafafa;
		min-height: 50px;
	}
	.q-text {
		font-size: 12.5px;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		-webkit-line-clamp: 24;
		line-clamp: 24;
	}
	.clamp {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 12;
		line-clamp: 12;
		overflow: hidden;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.callout {
		border-left: 3px solid #888;
		padding: 6px 10px;
		background: #f6f6f6;
		font-size: 12px;
	}

	.t {
		width: 698px;
		table-layout: fixed;
		border-collapse: collapse;
		font-size: 11.5px;
	}
	.t th,
	.t td,
	.places th,
	.places td {
		border-bottom: 1px solid #ccc;
		padding: 4px 6px;
		text-align: left;
		vertical-align: middle;
		overflow-wrap: anywhere;
	}
	.t th,
	.places th {
		background: #eee;
		font-weight: 600;
		font-size: 11px;
		border-bottom: 1px solid #888;
	}
	.t .r,
	.places .r {
		text-align: right;
	}
	.t td.when {
		color: #444;
		vertical-align: top;
		white-space: nowrap;
	}
	.t td.text {
		vertical-align: top;
	}

	/* ---- Pain ---- */
	.tokens {
		--surface: #ffffff;
		--surface-2: #efebe4;
		--surface-3: #e5e0d8;
		--line: #b9b1a6;
		--text: #111111;
		--text-3: #555555;
		--primary: #444444;
		--primary-soft: #eeeeee;
		--focus: #444444;
		--heat-0: #f1ece4;
		--heat-1: #f4cfa9;
		--heat-2: #f1b88f;
		--heat-3: #e38e68;
		--heat-4: #c9625a;
		--heat-5: #a7465d;
		--heat-6: #6c2d57;
	}
	.pain {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.figs {
		display: flex;
		gap: 22px;
		flex: none;
	}
	/* Smaller side labels with room between the figures, so "Left" of one never runs into the next. */
	.figs :global(.edge) {
		font-size: 9px;
	}
	.figs figure {
		width: 150px;
		text-align: center;
	}
	figcaption {
		font-size: 11px;
		font-weight: 600;
		color: #444;
		margin-bottom: 2px;
	}
	.side {
		flex: 1;
		min-width: 0;
	}
	.lgt {
		font-size: 11px;
		color: #555;
		margin-bottom: 2px;
	}
	.lg {
		display: flex;
		flex-wrap: wrap;
		gap: 3px 12px;
		font-size: 11px;
		color: #333;
		margin-bottom: 6px;
	}
	.lg span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.lg i,
	.places .sw i {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 3px;
		border: 1px solid #aaa;
		vertical-align: middle;
	}
	.places {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		font-size: 11.5px;
	}
	.places td.sw {
		padding-right: 0;
	}

	/* ---- Charts and counts ---- */
	.charts {
		padding-top: 6px;
	}
	.charts.two {
		display: grid;
		grid-template-columns: 338px 338px;
		gap: 6px 22px;
	}
	.ch h3 {
		font-size: 12px;
		line-height: 15px;
	}
	.ch p {
		font-size: 10.5px;
		color: #555;
		margin-bottom: 2px;
	}
	.key {
		display: flex;
		gap: 12px;
		font-size: 10.5px;
		color: #444;
		margin-top: 1px;
	}
	.key i {
		display: inline-block;
		width: 14px;
		height: 3px;
		border-radius: 2px;
		vertical-align: middle;
		margin-right: 4px;
	}
	.counts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.cnt {
		border: 1px solid #bbb;
		border-radius: 3px;
		padding: 7px 10px;
	}
	.cnt b {
		font-size: 20px;
		display: block;
		line-height: 1.2;
	}
	.cnt span {
		font-size: 11px;
		color: #444;
		display: block;
	}

	/* ---- Footer ---- */
	footer {
		flex: none;
		height: 34px;
		padding-top: 8px;
		border-top: 1px solid #999;
		display: flex;
		justify-content: space-between;
		font-size: 10.5px;
		color: #444;
	}

	@media print {
		.docs {
			gap: 0;
		}
		.dsheet {
			box-shadow: none;
		}
		.measure {
			display: none;
		}
	}
</style>
