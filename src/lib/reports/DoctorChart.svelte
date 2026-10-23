<script lang="ts">
	/**
	 * One small chart of the Doctor visit report: a value axis you can read (labelled ticks and a unit), a few dates, a
	 * dashed grid, lines or bars. Fixed print colours, system fonts, report language. Days without an entry stay blank
	 * (never drawn as zero). No colour means good or bad; lines are told apart by the key and the letter at their end.
	 */
	import { dayDate } from '$lib/records/time';
	import { linePath, spread, tickIndices } from '$lib/trends/paths';
	import type { Locale } from '$lib/i18n/core';
	import type { ChartSpec } from './doctor';

	let { spec, locale, w, h = 118 }: { spec: ChartSpec; locale: Locale; w: number; h?: number } = $props();

	const left = 34;
	const top = 20;
	const bottom = 20;
	const right = 10;
	const n = $derived(Math.max(spec.days.length, 1));
	const slot = $derived((w - left - right) / n);
	const x = (i: number) => left + (i + 0.5) * slot;
	const y = (v: number) =>
		top + (1 - (v - spec.yMin) / Math.max(spec.yMax - spec.yMin, 1e-9)) * (h - top - bottom);
	const nf = $derived(
		new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, { maximumFractionDigits: 1 })
	);
	const dateFmt = $derived(
		new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { day: 'numeric', month: 'short' })
	);
	const xTicks = $derived(
		tickIndices(spec.days.length, Math.max(2, Math.min(6, Math.floor((w - left) / 70))))
	);
	const anchor = (i: number) =>
		i === 0 && spec.days.length > 1
			? 'start'
			: i === spec.days.length - 1 && spec.days.length > 1
				? 'end'
				: 'middle';
	const tx = (i: number) =>
		i === 0 && spec.days.length > 1
			? left
			: i === spec.days.length - 1 && spec.days.length > 1
				? w - right
				: x(i);
	const bw = $derived(Math.min(16, Math.max(1.5, slot * 0.7)));
	const dots = $derived(spec.days.length <= 45);

	const lastIndex = (values: (number | null)[]) => values.findLastIndex((v) => v !== null);
	/** Letters at the end of each line, kept apart from each other. */
	const ends = $derived.by(() => {
		if (spec.kind !== 'lines' || !spec.legend) return [];
		const items = spec.series.flatMap((s) => {
			const li = lastIndex(s.values);
			return li < 0 ? [] : [{ s, li, y: y(s.values[li]!) + 4 }];
		});
		const ys = spread(
			items.map((e) => e.y),
			11
		);
		return items.map((e, k) => ({ ...e, y: ys[k]! }));
	});
</script>

<svg viewBox="0 0 {w} {h}" width={w} height={h} role="img" aria-label={`${spec.title}. ${spec.sub}`}>
	{#if spec.yUnit}<text class="unit" x={left - 6} y={9} text-anchor="end">{spec.yUnit}</text>{/if}
	{#each spec.yTicks as v (v)}
		<line class="grid" x1={left} x2={w - right} y1={y(v)} y2={y(v)} />
		<text class="ax" x={left - 6} y={y(v) + 3.5} text-anchor="end">{nf.format(v)}</text>
	{/each}
	{#if spec.kind === 'bars'}
		{#each spec.series as s (s.key)}
			{#each s.values as v, i (i)}
				{#if v !== null}
					<rect
						x={x(i) - bw / 2}
						y={y(v)}
						width={bw}
						height={Math.max(0, y(spec.yMin) - y(v))}
						fill={s.color}
						rx="1.5"
					/>
				{/if}
			{/each}
		{/each}
	{:else}
		{#each spec.series as s, k (s.key)}
			{@const pts = s.values.flatMap((v, i) => (v === null ? [] : [{ x: x(i), y: y(v) }]))}
			<path
				d={linePath(pts)}
				fill="none"
				stroke={s.color}
				stroke-width="1.8"
				stroke-linejoin="round"
				stroke-dasharray={spec.id === 'bp' && k === 1 ? '5 3' : undefined}
			/>
			{#if dots || pts.length === 1}
				{#each pts as p, k (k)}
					<circle cx={p.x} cy={p.y} r="2.4" fill={s.color} />
				{/each}
			{/if}
		{/each}
		{#each ends as e (e.s.key)}
			<text class="endl" x={x(e.li) + 5} y={e.y} fill={e.s.color}>{e.s.label.charAt(0)}</text>
		{/each}
	{/if}
	{#each xTicks as i (i)}
		<text class="ax" x={tx(i)} y={h - 5} text-anchor={anchor(i)}
			>{dateFmt.format(dayDate(spec.days[i]!))}</text
		>
	{/each}
</svg>

<style>
	svg {
		display: block;
		overflow: visible;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			Arial,
			sans-serif;
	}
	.grid {
		stroke: #bbb;
		stroke-width: 0.8;
		stroke-dasharray: 2 3;
	}
	.ax {
		font-size: 10px;
		fill: #444;
	}
	.unit {
		font-size: 10px;
		font-weight: 600;
		fill: #333;
	}
	.endl {
		font-size: 10px;
		font-weight: 700;
	}
</style>
