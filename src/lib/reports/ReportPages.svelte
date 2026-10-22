<script lang="ts">
	/**
	 * The A4 sheets of the headache diary report, in the report's own language (independent of the app language).
	 * Black and grey on white, system fonts, no external resources. The layout and the sheet size are fixed in CSS
	 * pixels (96 per inch); the print page scales them to fit a phone on screen and prints them as they are.
	 */
	import { brand } from '$lib/brand';
	import { translate, translatePlural, type Locale } from '$lib/i18n/core';
	import type { MessageKey } from '$lib/i18n/en';
	import {
		dayMonthLabel,
		MEDICINE_BLOCKS_IN_FORM,
		numericDayMonth,
		periodLabel,
		weekdayLabel,
		type HeadacheDay,
		type HeadacheReport,
		type MedicineItem
	} from './headache';

	let { report, locale, name = '' }: { report: HeadacheReport; locale: Locale; name?: string } = $props();

	const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
	const dash = $derived(tr('rep.v.none'));
	const SLOTS = 7;
	const TABLE_ROWS = [
		'started',
		'stopped',
		'before',
		'side',
		'quality',
		'severity',
		'worse',
		'nausea',
		'light',
		'sound',
		'trigger',
		'medicine'
	] as const;

	const period = $derived(periodLabel(report.from, report.to, locale));
	const title = $derived(tr(report.layout === 'form' ? 'rep.titleForm' : 'rep.title'));
	const yesNo = (v: boolean | null) => (v === null ? dash : tr(v ? 'rep.v.yes' : 'rep.v.no'));
	const plusDays = (n: number) => translatePlural(locale, 'rep.plusDays', n);
	const sideKey = { both: 'rep.v.both', right: 'rep.v.right', left: 'rep.v.left' } as const;
	const qualityKey = {
		pulsating: 'rep.v.pulsating',
		constant: 'rep.v.constant',
		both: 'rep.v.constantPulsating'
	} as const;
	const zoneKey = { mild: 'rep.v.mild', moderate: 'rep.v.moderate', severe: 'rep.v.severe' } as const;
	const nauseaKey = { none: 'rep.v.noNausea', ...zoneKey } as const;
	const beforeText = (h: HeadacheDay) =>
		h.before.length > 0 ? h.before.map((b) => tr(`rep.v.${b}` as MessageKey)).join(', ') : dash;

	/** The form layout always has seven columns; unused ones are hatched. */
	const slotsOf = (columns: HeadacheReport['pages'][number]) => [
		...columns,
		...Array.from({ length: SLOTS - columns.length }, () => null)
	];
	const blocks = (items: MedicineItem[]) => items.slice(0, MEDICINE_BLOCKS_IN_FORM);
	const pad = (items: MedicineItem[]) => [
		...blocks(items),
		...Array.from({ length: MEDICINE_BLOCKS_IN_FORM - blocks(items).length }, () => null)
	];
	const sheetPages = $derived(report.empty ? [[]] : report.pages);
</script>

{#snippet head(pageNo: number)}
	<header>
		<div>
			<h1>{title}</h1>
			<p class="app">{tr('rep.madeWith', { app: brand.displayName })}</p>
		</div>
		<dl>
			<div>
				<dt>{tr('rep.name')}</dt>
				<dd class:blank={name.trim() === ''}>{name.trim() || ' '}</dd>
			</div>
			<div>
				<dt>{tr('rep.cpr')}</dt>
				<dd class="blank">&nbsp;</dd>
			</div>
			<div>
				<dt>{tr('rep.period')}</dt>
				<dd>{period}</dd>
			</div>
		</dl>
		<p class="pg">{tr('rep.page', { page: pageNo, total: report.pageCount })}</p>
	</header>
{/snippet}

{#snippet foot()}
	<footer>
		{#if !report.empty}
			<p>{tr(report.layout === 'form' ? 'rep.fn.severityForm' : 'rep.fn.severity')}</p>
			<p>{tr(report.layout === 'form' ? 'rep.fn.nauseaForm' : 'rep.fn.nausea')}</p>
			{#if report.layout === 'table'}<p>{tr('rep.fn.started')}</p>{/if}
			<p>{tr('rep.fn.medicine')}</p>
		{/if}
		<p class="last">{tr('rep.fn.disclaimer')}</p>
	</footer>
{/snippet}

{#snippet meds(items: MedicineItem[])}
	{#each items as m, i (i)}
		<span class="item"><b>{m.name}</b><br />{m.amount ? `${m.amount} · ` : ''}{m.time}</span>
	{/each}
{/snippet}

{#snippet box(on: boolean)}
	<div class="l"><span class={['bx', { x: on }]}></span></div>
{/snippet}

<div class="sheets">
	{#each sheetPages as columns, p (p)}
		<section class={['report-sheet', report.layout === 'form' ? 'portrait' : 'landscape']} lang={locale}>
			{@render head(p + 1)}

			{#if report.empty}
				<p class="empty-line">{tr('rep.empty')}</p>
			{:else if report.layout === 'table'}
				<table style:--n={columns.length}>
					<colgroup
						><col class="q" />{#each columns as c (c.day)}<col class="d" />{/each}</colgroup
					>
					<thead>
						<tr>
							<th class="corner"></th>
							{#each columns as c (c.day)}
								<th scope="col"
									><b>{weekdayLabel(c.day, locale)}</b><span>{dayMonthLabel(c.day, locale)}</span></th
								>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each TABLE_ROWS as key, r (key)}
							<tr>
								<th scope="row"><span class="n">{r + 1}</span>{tr(`rep.row.${key}` as MessageKey)}</th>
								{#each columns as c (c.day)}
									{@const h = c.headache}
									{#if !h}
										{#if r === 0}<td class="none" rowspan={TABLE_ROWS.length}>{tr('rep.none')}</td>{/if}
									{:else if key === 'started'}
										<td class="first">{h.started ?? dash}</td>
									{:else if key === 'stopped'}
										<td>
											{#if h.stillGoing}<i>{tr('rep.stillGoing')}</i>
											{:else if h.stopped}{h.stopped.time}{#if h.stopped.plusDays > 0}<br /><span class="sm"
														>{plusDays(h.stopped.plusDays)}</span
													>{/if}
											{:else}{dash}{/if}
										</td>
									{:else if key === 'before'}
										<td>{beforeText(h)}</td>
									{:else if key === 'side'}
										<td>{h.side ? tr(sideKey[h.side]) : dash}</td>
									{:else if key === 'quality'}
										<td>{h.quality ? tr(qualityKey[h.quality]) : dash}</td>
									{:else if key === 'severity'}
										<td>{h.severity ? tr(zoneKey[h.severity]) : dash}</td>
									{:else if key === 'worse'}
										<td>{yesNo(h.worse)}</td>
									{:else if key === 'nausea'}
										<td>{tr(nauseaKey[h.nausea])}</td>
									{:else if key === 'light'}
										<td>{yesNo(h.light)}</td>
									{:else if key === 'sound'}
										<td>{yesNo(h.sound)}</td>
									{:else if key === 'trigger'}
										<td class="tr"><div class="clamp">{h.trigger ?? dash}</div></td>
									{:else}
										<td class="md">
											{#if h.medicines.length === 0}{dash}{:else}{@render meds(h.medicines)}{/if}
										</td>
									{/if}
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				{@const slots = slotsOf(columns)}
				<table class="form">
					<colgroup><col class="q" /></colgroup>
					<tbody>
						<tr class="thin">
							<th scope="row"><span class="n">1</span><b>{tr('rep.f.date')}</b></th>
							{#each slots as c, i (i)}
								{#if c}<td class="val"><span class="v">{numericDayMonth(c.day)}</span></td>{:else}<td
										class="empty"
									></td>{/if}
							{/each}
						</tr>
						<tr class="thin">
							<th scope="row"><span class="n">2</span>{tr('rep.f.started')}</th>
							{#each slots as c, i (i)}
								{#if c?.headache}<td class="val"><span class="v">{c.headache.started ?? ''}</span></td
									>{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr class="thin">
							<th scope="row"><span class="n">3</span>{tr('rep.f.stopped')}</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									{@const h = c.headache}
									<td class="val">
										{#if h.stillGoing}<span class="sm"><i>{tr('rep.stillGoing')}</i></span>
										{:else if h.stopped}<span class="v">{h.stopped.time}</span>{#if h.stopped.plusDays > 0}<br
												/><span class="sm">{plusDays(h.stopped.plusDays)}</span>{/if}{/if}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">4</span>{tr('rep.f.before1')}</div>
								<div class="l">{tr('rep.f.before2')}</div>
								<div class="l ind">{tr('rep.v.vision')}</div>
								<div class="l ind">{tr('rep.v.feeling')}</div>
								<div class="l ind">{tr('rep.v.speech')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										<div class="l"></div>
										{@render box(c.headache.before.includes('vision'))}
										{@render box(c.headache.before.includes('feeling'))}
										{@render box(c.headache.before.includes('speech'))}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">5</span>{tr('rep.f.was')}</div>
								<div class="l ind">{tr('rep.f.bothSides')}</div>
								<div class="l ind">{tr('rep.f.rightSide')}</div>
								<div class="l ind">{tr('rep.f.leftSide')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										{@render box(c.headache.side === 'both')}
										{@render box(c.headache.side === 'right')}
										{@render box(c.headache.side === 'left')}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">6</span>{tr('rep.f.was')}</div>
								<div class="l ind">{tr('rep.v.constant')}</div>
								<div class="l ind">{tr('rep.v.pulsating')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										{@render box(c.headache.quality === 'constant' || c.headache.quality === 'both')}
										{@render box(c.headache.quality === 'pulsating' || c.headache.quality === 'both')}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">7</span>{tr('rep.f.severity1')}</div>
								<div class="l">{tr('rep.f.severity2')}</div>
								<div class="l ind">{tr('rep.v.mild')}</div>
								<div class="l ind">{tr('rep.v.moderate')}</div>
								<div class="l ind">{tr('rep.v.severe')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										<div class="l"></div>
										{@render box(c.headache.severity === 'mild')}
										{@render box(c.headache.severity === 'moderate')}
										{@render box(c.headache.severity === 'severe')}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">8</span>{tr('rep.f.worse1')}</div>
								<div class="l">{tr('rep.f.worse2')}</div>
								<div class="l ind">{tr('rep.f.no')}</div>
								<div class="l ind">{tr('rep.f.yes')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										<div class="l"></div>
										{@render box(c.headache.worse === false)}
										{@render box(c.headache.worse === true)}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">9</span>{tr('rep.f.nausea')}</div>
								<div class="l ind">{tr('rep.v.noNausea')}</div>
								<div class="l ind">{tr('rep.v.mild')}</div>
								<div class="l ind">{tr('rep.v.moderate')}</div>
								<div class="l ind">{tr('rep.v.severe')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										{@render box(c.headache.nausea === 'none')}
										{@render box(c.headache.nausea === 'mild')}
										{@render box(c.headache.nausea === 'moderate')}
										{@render box(c.headache.nausea === 'severe')}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">10</span>{tr('rep.f.light')}</div>
								<div class="l ind">{tr('rep.f.no')}</div>
								<div class="l ind">{tr('rep.f.yes')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										{@render box(c.headache.light === false)}
										{@render box(c.headache.light === true)}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">11</span>{tr('rep.f.sound')}</div>
								<div class="l ind">{tr('rep.f.no')}</div>
								<div class="l ind">{tr('rep.f.yes')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td>
										<div class="l"></div>
										{@render box(c.headache.sound === false)}
										{@render box(c.headache.sound === true)}
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">12</span>{tr('rep.f.trigger1')}</div>
								<div class="l">{tr('rep.f.trigger2')}</div>
								<div class="l ind">{tr('rep.f.trigger3')}</div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									<td><div class="tx">{c.headache.trigger ?? ''}</div></td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
						<tr>
							<th scope="row">
								<div class="l"><span class="n">13</span>{tr('rep.f.medicine')}</div>
								{#each [0, 1, 2] as k (k)}
									<div class={['l ind', { sep: k > 0 }]}>{tr('rep.f.name')}</div>
									<div class="l ind">{tr('rep.f.amount')}</div>
									<div class="l ind">{tr('rep.f.time')}</div>
								{/each}
								<div class="l"></div>
							</th>
							{#each slots as c, i (i)}
								{#if c?.headache}
									{@const items = c.headache.medicines}
									<td>
										<div class="l"></div>
										{#each pad(items) as m, k (k)}
											<div class={['l', { sep: k > 0 }]}>{m?.name ?? ' '}</div>
											<div class="l">{m?.amount ?? ' '}</div>
											<div class="l">{m?.time ?? ' '}</div>
										{/each}
										<div class="l">
											{#if items.length > MEDICINE_BLOCKS_IN_FORM}<span class="more"
													>{tr('rep.more', { count: items.length - MEDICINE_BLOCKS_IN_FORM })}</span
												>{/if}
										</div>
									</td>
								{:else}<td class="empty"></td>{/if}
							{/each}
						</tr>
					</tbody>
				</table>
			{/if}

			{@render foot()}
		</section>
	{/each}
</div>

<style>
	.sheets {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media print {
		.sheets {
			gap: 0;
		}
		.report-sheet {
			box-shadow: none;
		}
	}
	.report-sheet {
		box-sizing: border-box;
		background: #fff;
		color: #111;
		font:
			12px/1.3 system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			Arial,
			sans-serif;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		break-after: page;
		box-shadow: 0 0 0 1px #bbb;
	}
	.report-sheet :global(*) {
		box-sizing: border-box;
	}
	.landscape {
		width: 1122px;
		height: 793px;
		padding: 30px 40px 24px;
		page: report-landscape;
	}
	.portrait {
		width: 793px;
		height: 1122px;
		padding: 28px 24px 20px;
		page: report-portrait;
		line-height: 16px;
	}
	header {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px 24px;
		align-items: end;
		padding-bottom: 8px;
		border-bottom: 2px solid #111;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		line-height: 1.1;
		font-weight: 700;
		letter-spacing: 0;
	}
	.portrait h1 {
		font-size: 20px;
		line-height: 24px;
		white-space: nowrap;
	}
	p {
		margin: 0;
	}
	.app {
		font-size: 12px;
		color: #555;
		margin-top: 2px;
	}
	dl {
		display: flex;
		gap: 22px;
		margin: 0;
	}
	.portrait dl {
		gap: 14px;
	}
	.portrait dl div {
		min-width: 90px;
	}
	dl div {
		min-width: 120px;
	}
	dt {
		font-size: 12px;
		color: #555;
	}
	dd {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		min-height: 20px;
	}
	dd.blank {
		border-bottom: 1px solid #111;
		min-width: 190px;
		margin-top: 2px;
	}
	.portrait dd {
		font-size: 13px;
		min-height: 18px;
	}
	.portrait dd.blank {
		min-width: 110px;
	}
	.pg {
		grid-column: 2;
		text-align: right;
		font-size: 12px;
		color: #555;
	}
	.empty-line {
		margin-top: 24px;
		font-size: 16px;
		flex: 1;
	}

	table {
		width: calc(236px + var(--n, 7) * 115px);
		max-width: 100%;
		border-collapse: collapse;
		margin-top: 10px;
		table-layout: fixed;
		flex: 1;
	}
	col.q {
		width: 236px;
	}
	col.d {
		width: 115px;
	}
	th,
	td {
		border: 1px solid #888;
		padding: 3px 6px;
		vertical-align: middle;
		text-align: center;
		font-size: 12px;
	}
	thead th {
		background: #eee;
		font-weight: 400;
		padding: 4px;
		height: 38px;
	}
	thead th b {
		display: block;
		font-size: 13px;
	}
	thead th span {
		font-size: 12px;
		color: #444;
	}
	.corner {
		background: #fff;
		border-top-color: transparent;
		border-left-color: transparent;
	}
	tbody th {
		text-align: left;
		font-weight: 600;
		background: #f6f6f6;
		padding-left: 8px;
	}
	.n {
		display: inline-block;
		width: 18px;
		color: #666;
		font-weight: 400;
	}
	td.first {
		font-weight: 600;
		font-size: 13px;
	}
	td.none {
		background: #f4f4f4;
		color: #777;
		font-style: italic;
		font-size: 13px;
	}
	td.md {
		line-height: 1.25;
		padding: 3px 4px;
	}
	td.tr {
		text-align: left;
		line-height: 1.25;
	}
	.item {
		display: block;
	}
	.item + .item {
		margin-top: 2px;
	}
	.sm {
		font-size: 12px;
		color: #444;
	}
	i {
		font-style: italic;
	}
	.clamp,
	.tx {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}

	/* The form layout (A4 portrait) */
	table.form {
		width: 100%;
		margin-top: 8px;
		flex: none;
	}
	table.form col.q {
		width: 186px;
	}
	table.form th,
	table.form td {
		padding: 3px 4px;
		vertical-align: top;
		line-height: 16px;
	}
	table.form tbody th {
		font-weight: 400;
		white-space: nowrap;
		padding-left: 6px;
	}
	table.form tbody th b {
		font-weight: 600;
	}
	table.form td {
		text-align: center;
	}
	.l {
		height: 16px;
		white-space: nowrap;
		text-align: center;
		overflow: hidden;
	}
	th .l {
		text-align: left;
	}
	.ind {
		padding-left: 18px;
	}
	.v {
		font-weight: 600;
		font-size: 13px;
		line-height: 24px;
	}
	td.val {
		vertical-align: middle;
	}
	tr.thin th,
	tr.thin td {
		padding-top: 2px;
		padding-bottom: 2px;
	}
	tr.thin th {
		vertical-align: middle;
	}
	.bx {
		display: inline-block;
		width: 11px;
		height: 11px;
		border: 1.3px solid #222;
		vertical-align: -1px;
		position: relative;
	}
	.bx.x::before,
	.bx.x::after {
		content: '';
		position: absolute;
		left: 4px;
		top: -2px;
		width: 1.6px;
		height: 14px;
		background: #111;
		transform: rotate(45deg);
	}
	.bx.x::after {
		transform: rotate(-45deg);
	}
	.l.sep {
		border-top: 1px dotted #999;
		margin-top: 3px;
		padding-top: 3px;
		height: 22px;
	}
	td .tx {
		text-align: left;
		font-size: 12px;
		line-height: 16px;
	}
	.more {
		font-style: italic;
	}
	td.empty {
		background: repeating-linear-gradient(135deg, #fff 0 6px, #f6f6f6 6px 7px);
	}

	footer {
		margin-top: 8px;
	}
	footer p {
		font-size: 12px;
		color: #333;
		line-height: 1.35;
	}
	footer p.last {
		margin-top: 2px;
		font-style: italic;
	}
</style>
