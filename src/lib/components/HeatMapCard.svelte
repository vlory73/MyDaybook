<script lang="ts">
	/**
	 * "Where it hurt" (Trends): the body coloured by how many days each place was logged in the period, the average
	 * intensity as a number where it fits, a legend in days and the list behind it (the accessible equivalent). Descriptive
	 * only: no thresholds and no judgement (D18, not a medical device).
	 */
	import BodyMap from './BodyMap.svelte';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';
	import { i18n, t, tn, type MessageKey } from '$lib/i18n/index.svelte';
	import {
		FACES,
		regionName,
		type Face,
		type HeadFace,
		type Shape,
		type View,
		type ZoomState
	} from '$lib/bodymap/catalogue';
	import { allRecords } from '$lib/records/store.svelte';
	import {
		bestFace,
		buckets,
		fitsNumber,
		heatKey,
		heatmap,
		rankPlaces,
		roundAvg,
		tokenFor,
		zoomOf,
		type Bucket,
		type Heat
	} from '$lib/trends/heatmap';

	let { days }: { days: readonly string[] } = $props();

	const TOP = 8;
	const heat = $derived(heatmap(allRecords(), days));

	let view = $state<View>('front');
	let zoomKind = $state<'head' | 'hand' | 'foot' | null>(null);
	let headFace = $state<HeadFace>('front');
	let side = $state<'left' | 'right'>('right');
	let face = $state<Face>('palm');
	let showAll = $state(false);

	const zoom = $derived<ZoomState | null>(
		zoomKind === null
			? null
			: zoomKind === 'head'
				? { zoom: 'head', face: headFace }
				: { zoom: zoomKind, side, face }
	);

	const name = (h: Pick<Heat, 'region' | 'side'>) => regionName(i18n.locale, h.region, h.side);

	// The places of the figure's list: everything logged, or what belongs to the close-up on show.
	const places = $derived(
		[...heat.places.values()].filter((h) =>
			zoomKind === null ? true : zoomOf(h.region) === zoomKind && (zoomKind === 'head' || h.side === side)
		)
	);
	const ranked = $derived(rankPlaces(places, name));
	const shown = $derived(showAll ? ranked : ranked.slice(0, TOP));

	// The most days on the figure decides the steps: on the body, everything incl. whole heads, hands and feet.
	const maxDays = $derived(
		zoomKind === null ? heat.maxDays : ranked.reduce((m, h) => Math.max(m, h.days), 0)
	);
	const steps = $derived(buckets(maxDays));

	const ROLLED = ['head', 'back_of_head', 'hand', 'foot'];
	function cellOf(s: Shape): Heat | undefined {
		if (zoomKind === null && ROLLED.includes(s.region)) {
			const key =
				s.region === 'hand' || s.region === 'foot' ? heatKey(s.region, s.side) : heatKey('head', 'midline');
			return heat.roll.get(key);
		}
		return heat.places.get(heatKey(s.region, s.side));
	}

	const heatProp = $derived({
		cell: (s: Shape) => {
			const h = cellOf(s);
			const token = h ? tokenFor(h.days, steps) : 0;
			const num = roundAvg(h?.avg ?? null);
			return { token, num, showNum: token > 0 && num !== null && fitsNumber(s) };
		},
		aria: ariaText(),
		zoomable: (s: Shape) => zoomKind === null && ROLLED.includes(s.region),
		look: (s: Shape) =>
			t('trends.heat.look', {
				name: s.region === 'head' || s.region === 'back_of_head' ? t('bodymap.region.head') : name(s)
			})
	});

	function ariaText(): string {
		const what = t(
			(zoomKind === null
				? `trends.heat.what.${view}`
				: zoomKind === 'head'
					? `trends.heat.what.head_${headFace}`
					: `trends.heat.what.${zoomKind}`) as MessageKey
		);
		const top = ranked[0];
		return top
			? t('trends.heat.aria', { what, top: name(top), days: tn('trends.days', top.days) })
			: t('trends.heat.aria.none', { what });
	}

	function open(s: Shape) {
		if (s.region === 'head' || s.region === 'back_of_head') {
			headFace = s.region === 'head' ? 'front' : 'back';
			zoomKind = 'head';
		} else if (s.region === 'hand' || s.region === 'foot') {
			const sd = s.side === 'left' ? 'left' : 'right';
			side = sd;
			face = bestFace(heat, s.region, sd);
			zoomKind = s.region;
		} else return;
		showAll = false;
	}
	function close() {
		zoomKind = null;
		showAll = false;
	}
	// Turning a hand or foot to the other side keeps a face that exists; a new close-up starts on the face with data.
	$effect(() => {
		if (zoomKind === 'hand' || zoomKind === 'foot') {
			if (!FACES[zoomKind].includes(face)) face = FACES[zoomKind][0];
		}
	});

	const label = (b: Bucket) =>
		b.to === null
			? `${b.from}+`
			: b.from === b.to
				? b.from === 1
					? t('trends.heat.day1')
					: String(b.from)
				: `${b.from}–${b.to}`;
	const legendText = (b: Bucket) => (b.to === null && b.from === 1 ? t('trends.heat.day1') : label(b));
	const legendAria = $derived(steps.map(legendText).join(', '));
	const zoomName = $derived(
		zoomKind === 'head' ? t('bodymap.region.head') : zoomKind ? regionName(i18n.locale, zoomKind, side) : ''
	);
</script>

{#if heat.daysWithPain > 0}
	<Card title={t('trends.heat.title')}>
		<p class="sub">{t('trends.heat.sub')}</p>
		{#if zoomKind}
			<div class="zoom-head">
				<button type="button" class="back" onclick={close}>
					<Icon name="chevron-left" size={18} />{t('bodymap.zoom.back')}
				</button>
				<span class="zoom-name">{zoomName}</span>
			</div>
			<div class="toggles">
				{#if zoomKind === 'head'}
					<Segmented
						label={t('bodymap.head.face')}
						bind:value={headFace}
						options={[
							{ value: 'front', label: t('bodymap.front') },
							{ value: 'back', label: t('bodymap.back') }
						]}
					/>
				{:else}
					<Segmented
						label={t(`bodymap.${zoomKind}.side` as MessageKey)}
						bind:value={side}
						options={[
							{ value: 'right', label: t(`bodymap.${zoomKind}.right` as MessageKey) },
							{ value: 'left', label: t(`bodymap.${zoomKind}.left` as MessageKey) }
						]}
					/>
					<Segmented
						label={t(`bodymap.${zoomKind}.face` as MessageKey)}
						bind:value={face}
						options={FACES[zoomKind].map((f) => ({ value: f, label: t(`bodymap.face.${f}` as MessageKey) }))}
					/>
				{/if}
			</div>
		{:else}
			<div class="toggles">
				<Segmented
					label={t('bodymap.view')}
					bind:value={view}
					options={[
						{ value: 'front', label: t('bodymap.front') },
						{ value: 'back', label: t('bodymap.back') }
					]}
				/>
			</div>
		{/if}

		<div class="figure" data-testid="heat-figure">
			<BodyMap
				bind:view
				{zoom}
				showToggle={false}
				width={zoom ? (zoom.zoom === 'head' ? 250 : 220) : 252}
				heat={heatProp}
				onzoom={open}
			/>
		</div>
		{#if !zoomKind}<p class="hint">{t('trends.heat.hint')}</p>{/if}

		<div class="legend-title">
			<span>{t('trends.heat.legend')}</span>
			<span class="notlogged"><i class="sw h0" aria-hidden="true"></i>{t('trends.heat.none')}</span>
		</div>
		{#if steps.length > 0}
			<div
				class="ramp"
				style:grid-template-columns="repeat({steps.length}, 1fr)"
				style:max-width="{steps.length * 20}%"
				role="img"
				aria-label={t('trends.heat.legend.aria', { list: legendAria })}
			>
				{#each steps as b (b.from)}
					<div><i class="bar" style:background="var(--heat-{b.token})"></i>{legendText(b)}</div>
				{/each}
			</div>
		{:else}
			<p class="empty">{t('trends.heat.empty')}</p>
		{/if}

		{#if ranked.length > 0}
			<div class="list-head"><span>{t('trends.heat.places')}</span><span>{t('trends.heat.cols')}</span></div>
			<ul class="rows" aria-label={t('trends.heat.list')} data-testid="heat-list">
				{#each shown as h (h.region + h.side)}
					{@const avg = roundAvg(h.avg)}
					<li>
						<i class="sw" style:background="var(--heat-{tokenFor(h.days, steps)})" aria-hidden="true"></i>
						<span class="pname">{name(h)}</span>
						<span class="days">{tn('trends.days', h.days)}</span>
						<span class="avg">{avg === null ? '' : t('trends.heat.avg', { n: avg })}</span>
					</li>
				{/each}
			</ul>
			{#if ranked.length > TOP}
				<button type="button" class="more" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>
					{showAll ? t('trends.heat.less') : t('trends.heat.more', { n: ranked.length })}
				</button>
			{/if}
		{/if}
		<p class="foot">{zoomKind ? t('trends.heat.foot.zoom') : t('trends.heat.foot')}</p>
	</Card>
{/if}

<style>
	.sub {
		font-size: var(--fs-callout);
		color: var(--text-2);
		margin: 0 0 var(--sp-3);
	}
	.toggles {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.zoom-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 36px;
		color: var(--primary);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.zoom-name {
		font-weight: var(--fw-semibold);
	}
	.figure {
		margin-top: var(--sp-3);
	}
	.hint {
		text-align: center;
		font-size: var(--fs-footnote);
		color: var(--text-2);
		margin: var(--sp-3) 0 0;
	}
	.legend-title {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		color: var(--text-2);
		margin-top: var(--sp-4);
	}
	.notlogged {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 4px;
		border: 1px solid var(--line);
		flex: none;
	}
	.sw.h0 {
		width: 12px;
		height: 12px;
		background: var(--heat-0);
	}
	.ramp {
		margin-inline: auto;
		display: grid;
		gap: 3px;
		margin-top: var(--sp-2);
	}
	.ramp div {
		text-align: center;
		font-size: var(--fs-caption);
		color: var(--text-2);
	}
	.bar {
		display: block;
		height: 14px;
		border-radius: 4px;
		margin-bottom: 4px;
		border: 1px solid var(--line);
	}
	.empty {
		font-size: var(--fs-callout);
		color: var(--text-2);
		margin: var(--sp-2) 0 0;
	}
	.list-head {
		display: flex;
		justify-content: space-between;
		margin-top: var(--sp-4);
		font-size: var(--fs-footnote);
		color: var(--text-2);
		border-bottom: 1px solid var(--line);
		padding-bottom: 6px;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.rows li {
		display: grid;
		grid-template-columns: 14px 1fr auto 4.2em;
		gap: var(--sp-3);
		align-items: center;
		padding: 10px 0;
		border-top: 1px solid var(--line);
		font-size: var(--fs-callout);
	}
	.rows li:first-child {
		border-top: 0;
	}
	.pname {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.days {
		font-weight: var(--fw-semibold);
		text-align: right;
		white-space: nowrap;
	}
	.avg {
		color: var(--text-2);
		text-align: right;
		white-space: nowrap;
	}
	.more {
		width: 100%;
		min-height: 44px;
		margin-top: var(--sp-2);
		color: var(--primary);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
		border-radius: var(--r-md);
		background: var(--surface-2);
	}
	.foot {
		font-size: var(--fs-footnote);
		color: var(--text-2);
		margin: var(--sp-3) 0 0;
		border-top: 1px solid var(--line);
		padding-top: var(--sp-3);
	}
</style>
