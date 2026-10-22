<script lang="ts">
	/**
	 * A small body for a timeline entry: one dot per point, front and back side by side (half size) in one box when both
	 * have points, a single view at the full size otherwise. Decorative: the entry's text already says where.
	 */
	import { mainScene, viewBoxOf, type View } from '$lib/bodymap/catalogue';
	import type { PainPoint } from '$lib/records/pain';
	import { thumbDots } from '$lib/trends/heatmap';

	let { points }: { points: readonly PainPoint[] } = $props();

	const dots = $derived(thumbDots(points));
	const views = $derived((['front', 'back'] as View[]).filter((v) => dots[v].length > 0));
	const both = $derived(views.length === 2);
	const W = viewBoxOf('front').w;
	const H = viewBoxOf('front').h;
	const GAP = 24;
	const ox = (v: View) => (both && v === 'back' ? W + GAP : 0);
	const vbW = $derived(both ? 2 * W + GAP : W);
	const r = $derived(both ? 30 : 20);
</script>

{#if views.length > 0}
	<span class="thumb" aria-hidden="true">
		<svg viewBox="0 0 {vbW} {H}" class:two={both}>
			{#each views as v (v)}
				<g transform="translate({ox(v)} 0)">
					{#each mainScene(v).shapes as s (s.key)}
						{#if s.d}
							<path class="body" d={s.d} />
						{:else}
							<rect
								class="body"
								x={s.x}
								y={s.y}
								width={s.w}
								height={s.h}
								rx={s.rx}
								ry={s.ry}
								transform={s.rot ? `rotate(${s.rot} ${s.px} ${s.py})` : undefined}
							/>
						{/if}
					{/each}
					{#each dots[v] as d, i (i)}
						<circle cx={d.x} cy={d.y} r={r + 6} class="halo" />
						<circle cx={d.x} cy={d.y} {r} class="dot" />
					{/each}
				</g>
			{/each}
		</svg>
	</span>
{/if}

<style>
	.thumb {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		margin-top: 2px;
		padding: 3px 0;
		background: var(--surface-2);
		border-radius: 8px;
	}
	svg {
		display: block;
		width: 38px;
		height: auto;
	}
	.body {
		fill: var(--text-3);
		fill-opacity: 0.45;
	}
	.halo {
		fill: var(--surface);
		opacity: 0.9;
	}
	.dot {
		fill: var(--pain-ink);
	}
</style>
