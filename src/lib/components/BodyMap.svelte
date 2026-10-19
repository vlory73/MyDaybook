<script lang="ts">
	import { t, i18n } from '$lib/i18n/index.svelte';
	import {
		VIEWBOX,
		edgeSides,
		findShape,
		regionName,
		shapesOf,
		sideKey,
		spaceOf,
		toLocal,
		toView,
		viewOf,
		type BodyPlace,
		type RegionId,
		type Shape,
		type Side,
		type View
	} from '$lib/bodymap/catalogue';
	import { heatStep } from '$lib/records/pain';
	import Segmented from './Segmented.svelte';

	/** A point to draw as a dot with its intensity number (the person's own entries, never computed values). */
	type Dot = {
		region: RegionId;
		side: Side;
		space: BodyPlace['space'];
		u: number;
		v: number;
		/** Not chosen yet: the dot is drawn empty. */
		intensity?: number;
	};

	let {
		view = $bindable('front'),
		points = [],
		selected = null,
		showToggle = true,
		width = 252,
		ontap
	}: {
		view?: View;
		points?: Dot[];
		selected?: { region: RegionId; side: Side } | null;
		showToggle?: boolean;
		/** Width of the figure in CSS px (at most; it shrinks on narrow screens). */
		width?: number;
		/** Called with the region, side, space and region-local (u, v) of the tap. */
		ontap?: (place: BodyPlace) => void;
	} = $props();

	let svg: SVGSVGElement | undefined = $state();

	const shapes = $derived(shapesOf(view));
	const edges = $derived(edgeSides(view));
	const dots = $derived(
		points.flatMap((p) => {
			if (viewOf(p.space) !== view) return [];
			const shape = findShape(view, p.region, p.side);
			if (!shape) return [];
			return [{ ...toView(shape, p.u, p.v), intensity: p.intensity }];
		})
	);

	const transform = (s: Shape) => (s.rot ? `rotate(${s.rot} ${s.px} ${s.py})` : undefined);
	const nameOf = (s: Shape) => regionName(i18n.locale, s.region, s.side);
	const isSelected = (s: Shape) => selected?.region === s.region && selected.side === s.side;

	function report(s: Shape, u: number, v: number) {
		ontap?.({ region: s.region, side: s.side, space: spaceOf(view), u, v });
	}

	function onclick(event: MouseEvent, s: Shape) {
		const ctm = svg?.getScreenCTM();
		// A keyboard or assistive-technology activation has no real position: use the middle of the region.
		if (event.detail === 0 || !ctm) return report(s, 0.5, 0.5);
		const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
		const { u, v } = toLocal(s, p.x, p.y);
		report(s, u, v);
	}

	function onkeydown(event: KeyboardEvent, s: Shape) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		report(s, 0.5, 0.5);
	}

	const heatVar = (i: number | undefined) =>
		i === undefined ? 'var(--surface)' : `var(--heat-${heatStep(i)})`;
	const textVar = (i: number | undefined) =>
		i !== undefined && heatStep(i) >= 4 ? 'var(--on-heat-hi)' : 'var(--text)';
</script>

<div class="bodymap">
	{#if showToggle}
		<Segmented
			label={t('bodymap.view')}
			bind:value={view}
			options={[
				{ value: 'front', label: t('bodymap.front') },
				{ value: 'back', label: t('bodymap.back') }
			]}
		/>
	{/if}
	<div class="stage" style:--figure="{width}px">
		<span class="edge left">{t(sideKey(edges.screenLeft))}</span>
		<span class="edge right">{t(sideKey(edges.screenRight))}</span>
		<svg
			bind:this={svg}
			class="body"
			viewBox="0 0 {VIEWBOX.w} {VIEWBOX.h}"
			role="group"
			aria-label={t(view === 'front' ? 'bodymap.svg.front' : 'bodymap.svg.back')}
		>
			{#each shapes as s (s.view + s.key)}
				<rect
					class="rg"
					class:sel={isSelected(s)}
					x={s.x}
					y={s.y}
					width={s.w}
					height={s.h}
					rx={s.rx}
					ry={s.ry}
					transform={transform(s)}
					role="button"
					tabindex="0"
					aria-label={nameOf(s)}
					data-region={s.region}
					data-side={s.side}
					onclick={(e) => onclick(e, s)}
					onkeydown={(e) => onkeydown(e, s)}
				/>
			{/each}
			{#each dots as d, i (i)}
				<g class="dot" aria-hidden="true">
					<circle cx={d.x} cy={d.y} r="9.5" class="halo" />
					<circle
						cx={d.x}
						cy={d.y}
						r="7.5"
						fill={heatVar(d.intensity)}
						class="pt"
						class:unset={d.intensity === undefined}
					/>
					{#if d.intensity !== undefined}
						<text x={d.x} y={d.y} fill={textVar(d.intensity)}>{d.intensity}</text>
					{/if}
				</g>
			{/each}
		</svg>
	</div>
</div>

<style>
	.bodymap {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.stage {
		position: relative;
		display: flex;
		justify-content: center;
	}
	.edge {
		position: absolute;
		top: 4px;
		font-size: var(--fs-caption);
		font-weight: var(--fw-bold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
		max-width: 5.5em;
		line-height: 1.25;
	}
	.edge.left {
		left: 0;
	}
	.edge.right {
		right: 0;
		text-align: right;
	}
	.body {
		width: min(100%, var(--figure, 252px));
		height: auto;
		aspect-ratio: 200 / 440;
		overflow: visible;
		-webkit-tap-highlight-color: transparent;
	}
	.rg {
		fill: var(--surface-2);
		stroke: var(--line);
		stroke-width: 1.2;
		cursor: pointer;
		touch-action: manipulation;
		transition: fill var(--dur-2) var(--ease-out);
	}
	.rg:hover {
		fill: var(--surface-3);
	}
	.rg.sel {
		fill: var(--primary-soft);
		stroke: var(--primary);
		stroke-width: 2;
	}
	.rg:focus {
		outline: none;
	}
	.rg:focus-visible {
		stroke: var(--focus);
		stroke-width: 2.6;
	}
	.halo {
		fill: var(--surface);
		opacity: 0.9;
	}
	.pt {
		stroke: var(--surface);
		stroke-width: 1.2;
	}
	.pt.unset {
		stroke: var(--primary);
		stroke-width: 1.6;
	}
	.dot {
		pointer-events: none;
	}
	.dot text {
		font-size: 8.5px;
		font-weight: var(--fw-bold);
		text-anchor: middle;
		dominant-baseline: central;
	}
</style>
