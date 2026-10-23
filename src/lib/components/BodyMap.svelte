<script lang="ts">
	import { t, i18n } from '$lib/i18n/index.svelte';
	import {
		regionName,
		sceneOf,
		sceneShape,
		sideKey,
		isViewIndependent,
		toLocal,
		toView,
		type BodyPlace,
		type RegionId,
		type Shape,
		type Side,
		type View,
		type ZoomState
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
		zoom = null,
		points = [],
		selected = null,
		showToggle = true,
		width = 252,
		ontap,
		heat = null,
		onzoom,
		edgeText
	}: {
		view?: View;
		/** A close-up (head, one hand or one foot) instead of the main view. */
		zoom?: ZoomState | null;
		points?: Dot[];
		selected?: { region: RegionId; side: Side } | null;
		showToggle?: boolean;
		/** Width of the figure in CSS px (at most; it shrinks on narrow screens). */
		width?: number;
		/** Called with the region, side, space and region-local (u, v) of the tap. */
		ontap?: (place: BodyPlace) => void;
		/**
		 * Read-only heat map (Trends, "Where it hurt"): places are coloured by `--heat-N` (token 0 = not logged) with the
		 * average as a number where it fits. Only places `zoomable` says so are buttons (they open a close-up).
		 */
		heat?: {
			cell: (s: Shape) => { token: number; num: number | null; showNum: boolean };
			aria: string;
			zoomable?: (s: Shape) => boolean;
			look?: (s: Shape) => string;
		} | null;
		onzoom?: (s: Shape) => void;
		/** Text for the side shown at an edge (default: the app language); reports pass their own language. */
		edgeText?: (side: 'left' | 'right') => string;
	} = $props();

	let svg: SVGSVGElement | undefined = $state();

	const scene = $derived(sceneOf(view, zoom));
	const shapes = $derived(scene.shapes);
	const edges = $derived(scene.edges);
	const body = $derived(scene.decor.filter((d) => d.kind === 'body'));
	const features = $derived(scene.decor.filter((d) => d.kind === 'feature'));
	/** A point is drawn on its own view; the wider head areas (band, whole head, this side) on either head drawing. */
	const onScene = (p: Dot) =>
		p.space === scene.space || (scene.edges !== null && zoom?.zoom === 'head' && isViewIndependent(p.region));
	const placed = $derived(
		points.flatMap((p) => {
			if (!onScene(p)) return [];
			const shape = sceneShape(scene, p.region, p.side);
			return shape ? [{ shape, p }] : [];
		})
	);
	const dots = $derived(
		placed.map(({ shape, p }) => ({ ...toView(shape, p.u, p.v), intensity: p.intensity }))
	);
	/** Wider areas in use (whole belly, whole back, ...): softly highlighted, the dot sits at their centre. */
	const wides = $derived(
		scene.wide.filter((w) => points.some((p) => onScene(p) && p.region === w.region && p.side === w.side))
	);
	const label = $derived(
		zoom
			? t(
					zoom.zoom === 'head'
						? zoom.face === 'back'
							? 'bodymap.svg.head_back'
							: 'bodymap.svg.head'
						: zoom.zoom === 'hand'
							? 'bodymap.svg.hand'
							: 'bodymap.svg.foot'
				)
			: t(view === 'front' ? 'bodymap.svg.front' : 'bodymap.svg.back')
	);

	const transform = (s: Shape) => (s.rot ? `rotate(${s.rot} ${s.px} ${s.py})` : undefined);
	const nameOf = (s: Shape) => regionName(i18n.locale, s.region, s.side);
	const isSelected = (s: Shape) => selected?.region === s.region && selected.side === s.side;

	function report(s: Shape, u: number, v: number) {
		ontap?.({ region: s.region, side: s.side, space: s.space, u, v });
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
	{#if showToggle && !zoom}
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
		{#if edges}
			<span class="edge left">{edgeText ? edgeText(edges.screenLeft) : t(sideKey(edges.screenLeft))}</span>
			<span class="edge right">{edgeText ? edgeText(edges.screenRight) : t(sideKey(edges.screenRight))}</span>
		{/if}
		<svg
			bind:this={svg}
			class="body"
			viewBox="0 0 {scene.viewBox.w} {scene.viewBox.h}"
			style:aspect-ratio="{scene.viewBox.w} / {scene.viewBox.h}"
			role={heat ? 'img' : 'group'}
			aria-label={heat ? heat.aria : label}
		>
			{#each body as d, i (i)}
				<path class="decor" d={d.d} aria-hidden="true" />
			{/each}
			{#if heat}
				{#each shapes as s (s.space + s.key)}
					{@const c = heat.cell(s)}
					{@const zoomable = heat.zoomable?.(s) ?? false}
					{#if s.d}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<path
							class="rg hm"
							class:zm={zoomable}
							d={s.d}
							style:fill="var(--heat-{c.token})"
							role={zoomable ? 'button' : undefined}
							tabindex={zoomable ? 0 : undefined}
							aria-label={zoomable ? heat.look?.(s) : undefined}
							aria-hidden={zoomable ? undefined : 'true'}
							data-region={s.region}
							data-side={s.side}
							data-heat={c.token}
							onclick={zoomable ? () => onzoom?.(s) : undefined}
							onkeydown={zoomable
								? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onzoom?.(s))
								: undefined}
						/>
					{:else}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<rect
							class="rg hm"
							class:zm={zoomable}
							x={s.x}
							y={s.y}
							width={s.w}
							height={s.h}
							rx={s.rx}
							ry={s.ry}
							transform={transform(s)}
							style:fill="var(--heat-{c.token})"
							role={zoomable ? 'button' : undefined}
							tabindex={zoomable ? 0 : undefined}
							aria-label={zoomable ? heat.look?.(s) : undefined}
							aria-hidden={zoomable ? undefined : 'true'}
							data-region={s.region}
							data-side={s.side}
							data-heat={c.token}
							onclick={zoomable ? () => onzoom?.(s) : undefined}
							onkeydown={zoomable
								? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onzoom?.(s))
								: undefined}
						/>
					{/if}
				{/each}
			{:else}
				{#each shapes as s (s.space + s.key)}
					{#if s.d}
						<path
							class="rg"
							class:sel={isSelected(s)}
							d={s.d}
							role="button"
							tabindex="0"
							aria-label={nameOf(s)}
							data-region={s.region}
							data-side={s.side}
							onclick={(e) => onclick(e, s)}
							onkeydown={(e) => onkeydown(e, s)}
						/>
					{:else}
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
					{/if}
				{/each}
			{/if}
			{#each features as d, i (i)}
				<path class="feature" d={d.d} aria-hidden="true" />
			{/each}
			{#if heat}
				{#each shapes as s (s.space + s.key)}
					{@const c = heat.cell(s)}
					{#if c.showNum && c.num !== null}
						{@const at = toView(s, 0.5, 0.5)}
						<text class="num" x={at.x} y={at.y} fill="var(--on-heat-{c.token})" aria-hidden="true"
							>{c.num}</text
						>
					{/if}
				{/each}
			{:else}
				{#each wides as w (w.key)}
					{#each w.cover ?? [w] as c (c.key)}
						{#if c.d}
							<path
								class="wide"
								class:sel={isSelected(w)}
								d={c.d}
								aria-hidden="true"
								data-region={w.region}
								data-side={w.side}
							/>
						{:else}
							<rect
								class="wide"
								class:sel={isSelected(w)}
								x={c.x}
								y={c.y}
								width={c.w}
								height={c.h}
								rx={c.rx}
								ry={c.ry}
								aria-hidden="true"
								data-region={w.region}
								data-side={w.side}
							/>
						{/if}
					{/each}
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
			{/if}
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
	/* Ears and neck of the head close-up, and its faint, neutral face features: for recognition only. */
	.decor {
		fill: var(--surface-2);
		stroke: var(--line);
		stroke-width: 1.2;
		pointer-events: none;
	}
	.feature {
		fill: none;
		stroke: var(--text-3);
		stroke-opacity: 0.4;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}
	.wide {
		fill: var(--primary-soft);
		fill-opacity: 0.7;
		stroke: var(--primary);
		stroke-width: 1.4;
		stroke-dasharray: 4 3;
		pointer-events: none;
	}
	.wide.sel {
		fill-opacity: 0.95;
		stroke-width: 2;
		stroke-dasharray: none;
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
	.hm {
		cursor: default;
	}
	.hm.zm {
		cursor: pointer;
		stroke: var(--primary);
		stroke-width: 1.6;
		stroke-dasharray: 3 2.5;
	}
	.num {
		font-size: 11px;
		font-weight: var(--fw-bold);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
	.dot text {
		font-size: 8.5px;
		font-weight: var(--fw-bold);
		text-anchor: middle;
		dominant-baseline: central;
	}
</style>
