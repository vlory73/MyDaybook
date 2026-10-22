<script lang="ts" module>
	/** What a chart hands to its layers: positions in the SVG's own coordinates (viewBox width 320). */
	export type Scale = {
		/** Centre of day slot `i`. */
		x: (i: number) => number;
		y: (v: number) => number;
		/** Width of one day slot. */
		slot: number;
		left: number;
		right: number;
		top: number;
		/** Bottom edge of the plot area (value `yMin`). */
		bottom: number;
	};
</script>

<script lang="ts">
	/**
	 * A small hand-built SVG chart frame: dashed grid, y labels, a few date ticks on the x axis. The caller draws the
	 * data in the `layers` snippet with the scale it receives. Colours and fonts come from tokens (light and dark).
	 * It is an image for assistive tech: `label` summarises it, and every card also states its numbers in text.
	 */
	import type { Snippet } from 'svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { dayDate } from '$lib/records/time';
	import { tickIndices } from '$lib/trends/paths';

	let {
		days,
		yMin,
		yMax,
		yTicks,
		yFormat = (n: number) => String(n),
		label,
		height = 150,
		padBottom = 22,
		padRight = 8,
		layers
	}: {
		days: readonly string[];
		yMin: number;
		yMax: number;
		yTicks: readonly number[];
		yFormat?: (n: number) => string;
		label: string;
		height?: number;
		/** Space under the plot for the date labels (more when a layer draws something there). */
		padBottom?: number;
		padRight?: number;
		layers: Snippet<[Scale]>;
	} = $props();

	const W = 320;
	const left = 34;
	const top = 8;

	const scale = $derived<Scale>({
		x: (i) => left + (i + 0.5) * ((W - left - padRight) / Math.max(days.length, 1)),
		y: (v) => top + (1 - (v - yMin) / Math.max(yMax - yMin, 1e-9)) * (height - top - padBottom),
		slot: (W - left - padRight) / Math.max(days.length, 1),
		left,
		right: W - padRight,
		top,
		bottom: height - padBottom
	});

	const fmt = $derived(new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }));
	const ticks = $derived(tickIndices(days.length, days.length <= 7 ? 7 : 4));
	const anchor = (i: number) =>
		i === 0 && days.length > 1 ? 'start' : i === days.length - 1 && days.length > 1 ? 'end' : 'middle';
	const tickX = (i: number) =>
		i === 0 && days.length > 1 ? left : i === days.length - 1 && days.length > 1 ? W - padRight : scale.x(i);
</script>

<svg class="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
	{#each yTicks as v (v)}
		<line class="grid" x1={left} x2={W - padRight} y1={scale.y(v)} y2={scale.y(v)} />
		<text class="ax" x={left - 6} y={scale.y(v) + 4} text-anchor="end">{yFormat(v)}</text>
	{/each}
	{@render layers(scale)}
	{#each ticks as i (i)}
		<text class="ax" x={tickX(i)} y={height - 4} text-anchor={anchor(i)}>{fmt.format(dayDate(days[i]!))}</text
		>
	{/each}
</svg>

<style>
	.chart {
		display: block;
		width: 100%;
		height: auto;
		margin-top: var(--sp-3);
		overflow: visible;
	}
	.chart :global(.grid) {
		stroke: var(--line);
		stroke-width: 1;
		stroke-dasharray: 2 4;
	}
	.chart :global(.ax) {
		font-size: 11px;
		fill: var(--text-2);
		font-family: var(--font-sans);
	}
	.chart :global(.val) {
		font-size: 12px;
		font-weight: 600;
		fill: var(--text);
		font-family: var(--font-sans);
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 3px;
	}
	:global(:where(.chart path)) {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
