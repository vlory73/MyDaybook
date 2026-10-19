<script lang="ts">
	import { tick } from 'svelte';
	import BodyMap from './BodyMap.svelte';
	import Button from './Button.svelte';
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import RegionFinder from './RegionFinder.svelte';
	import Segmented from './Segmented.svelte';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { regionName, viewOf, type BodyPlace, type View } from '$lib/bodymap/catalogue';
	import { editor } from '$lib/records/editor.svelte';
	import {
		MAX_PAIN_POINTS,
		MAX_PAIN_QUALITIES,
		MAX_POINT_NOTE,
		PAIN_QUALITIES,
		heatStep,
		type PainPayload,
		type PainPoint,
		type PainQuality
	} from '$lib/records/pain';
	import { copyPoints, latestPain, painSummary } from '$lib/records/painEntry';
	import { allRecords } from '$lib/records/store.svelte';
	import { fromLocalInput } from '$lib/records/time';
	import type { Payload } from '$lib/records/types';

	/**
	 * "Where do you feel it?": place up to 20 points on the body (or pick them from Find), give each an intensity
	 * from 0 to 10 and optionally how it feels. The panel for the chosen point is pinned to the bottom of the sheet
	 * and the map scrolls so that the chosen region stays above it. Records only: nothing here rates or advises.
	 */
	type Draft = Omit<PainPoint, 'intensity' | 'note'> & { intensity?: number; note: string };

	let time = $state('');
	let view = $state<View>('front');
	let points = $state<Draft[]>([]);
	let sel = $state<number | null>(null);
	/** "+ Point" was pressed: the next tap adds a point even where one already is. */
	let placing = $state(false);
	let finding = $state(false);
	let entryNote: string | undefined;
	let panel: HTMLElement | undefined = $state();

	const isNew = $derived(editor.log?.kind === 'pain' && editor.log.id === null);
	const last = $derived(latestPain(allRecords()));
	const current = $derived(sel === null ? undefined : points[sel]);
	const complete = $derived(points.length > 0 && points.every((p) => p.intensity !== undefined));
	const valid = $derived(complete && fromLocalInput(time) !== null);
	const full = $derived(points.length >= MAX_PAIN_POINTS);
	const offerSame = $derived(isNew && points.length === 0 && last !== undefined && !finding);

	function draftOf(p: PainPoint): Draft {
		return { ...p, qualities: [...p.qualities], note: p.note ?? '' };
	}

	function onopen(existing: Payload | null) {
		const saved = existing?.type === 'pain' ? existing : null;
		entryNote = saved?.note;
		placing = false;
		finding = false;
		if (saved) points = saved.points.map(draftOf);
		else if (editor.log?.same && last) points = copyPoints(last.payload).map(draftOf);
		else points = [];
		sel = points.length > 0 ? 0 : null;
		view = points[0] ? viewOf(points[0].space) : 'front';
		if (points.length > 0) void reveal(false);
	}

	function sameAsLast() {
		if (!last) return;
		points = copyPoints(last.payload).map(draftOf);
		sel = 0;
		view = viewOf(points[0]!.space);
		void reveal(false);
	}

	/** Keeps the chosen region above the pinned panel, and (for keyboard use) moves focus to its intensity row. */
	async function reveal(focus: boolean) {
		await tick();
		await tick();
		if (focus)
			panel?.querySelector<HTMLElement>('[role=radio][tabindex="0"]')?.focus({ preventScroll: true });
		const region = document.querySelector<SVGElement>('.rg.sel');
		const dialog = region?.closest('dialog');
		if (!region || !dialog || !panel) return;
		const r = region.getBoundingClientRect();
		const top = panel.getBoundingClientRect().top - 12;
		const edge = dialog.getBoundingClientRect().top + 8;
		if (r.bottom > top) dialog.scrollBy({ top: Math.min(r.bottom - top, r.top - edge) });
		else if (r.top < edge) dialog.scrollBy({ top: r.top - edge });
	}

	function place(at: BodyPlace) {
		if (!placing) {
			// A tap on a region that already has a point chooses it (and again moves on to the next one there).
			const here = points.flatMap((p, i) =>
				p.region === at.region && p.side === at.side && p.space === at.space ? [i] : []
			);
			if (here.length > 0) {
				sel = here.find((i) => sel !== null && i > sel) ?? here[0]!;
				return void reveal(true);
			}
		}
		if (full) return;
		points.push({ ...at, intensity: undefined, qualities: [], note: '' });
		sel = points.length - 1;
		placing = false;
		void reveal(true);
	}

	function pickFound(at: BodyPlace) {
		finding = false;
		view = viewOf(at.space);
		place(at);
	}

	function remove() {
		if (sel === null) return;
		points.splice(sel, 1);
		sel = points.length === 0 ? null : Math.min(sel, points.length - 1);
		placing = false;
		void reveal(false);
	}

	function step(by: 1 | -1) {
		if (sel === null || points.length < 2) return;
		sel = (sel + by + points.length) % points.length;
		const v = viewOf(points[sel]!.space);
		if (v !== view) view = v;
		void reveal(false);
	}

	function addAnother() {
		placing = true;
		sel = null;
		finding = false;
	}

	function setIntensity(n: number) {
		if (current) current.intensity = n;
	}

	function onRampKey(event: KeyboardEvent, n: number) {
		const by =
			event.key === 'ArrowRight' || event.key === 'ArrowUp'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowDown'
					? -1
					: 0;
		if (!by) return;
		event.preventDefault();
		const next = Math.min(10, Math.max(0, n + by));
		setIntensity(next);
		void tick().then(() =>
			panel?.querySelector<HTMLElement>(`[role=radio][data-n="${next}"]`)?.focus({ preventScroll: true })
		);
	}

	function toggleQuality(q: PainQuality) {
		if (!current) return;
		current.qualities = current.qualities.includes(q)
			? current.qualities.filter((x) => x !== q)
			: current.qualities.length < MAX_PAIN_QUALITIES
				? [...current.qualities, q]
				: current.qualities;
	}

	function toggleFind() {
		finding = !finding;
		if (finding) {
			void tick().then(() =>
				document.querySelector<HTMLInputElement>('dialog[open] input[type=search]')?.focus()
			);
		}
	}

	function payload(): Payload | null {
		const at = fromLocalInput(time);
		if (!at || !valid) return null;
		const p: PainPayload = {
			v: 1,
			type: 'pain',
			at,
			points: points.map((d) => {
				const point: PainPoint = {
					region: d.region,
					side: d.side,
					space: d.space,
					u: d.u,
					v: d.v,
					intensity: d.intensity!,
					qualities: PAIN_QUALITIES.filter((q) => d.qualities.includes(q))
				};
				if (d.note.trim()) point.note = d.note.trim();
				return point;
			})
		};
		if (entryNote) p.note = entryNote;
		return p;
	}

	const ramp = Array.from({ length: 11 }, (_, i) => i);
	const lastSummary = $derived(last ? painSummary(i18n.locale, last.payload.points) : '');
	const saveLabel = $derived(points.length > 0 ? tn('bodymap.save', points.length) : undefined);
</script>

<LogSheet
	kind="pain"
	title={t('bodymap.title')}
	{valid}
	{payload}
	{onopen}
	{saveLabel}
	{dock}
	{extra}
	bind:time
>
	{#if offerSame && last}
		<button type="button" class="same" onclick={sameAsLast}>
			<Icon name="undo-2" size={20} />
			<span class="same-text">
				<b>{t('bodymap.sameAsLast')}</b>
				<span class="muted">{lastSummary}</span>
			</span>
		</button>
	{/if}
	<div class="toolbar">
		<Segmented
			label={t('bodymap.view')}
			bind:value={view}
			options={[
				{ value: 'front', label: t('bodymap.front') },
				{ value: 'back', label: t('bodymap.back') }
			]}
		/>
		<button type="button" class="find" aria-expanded={finding} onclick={toggleFind}>
			<Icon name={finding ? 'x' : 'search'} size={18} />
			{finding ? t('bodymap.find.back') : t('bodymap.find')}
		</button>
	</div>
	{#if finding}
		<RegionFinder {view} onpick={(at) => pickFound(at)} />
	{:else}
		<BodyMap
			bind:view
			showToggle={false}
			width={210}
			{points}
			selected={current ? { region: current.region, side: current.side } : null}
			ontap={place}
		/>
	{/if}
</LogSheet>

{#snippet extra()}
	<Button
		variant="quiet"
		disabled={full || points.length === 0}
		aria-label={t('bodymap.add')}
		onclick={addAnother}
	>
		<Icon name="plus" size={18} />{t('bodymap.add.label')}
	</Button>
{/snippet}

{#snippet dock()}
	<div class="panel" bind:this={panel}>
		{#if finding}
			<!-- The list above is the whole job while Find is open. -->
		{:else if current && sel !== null}
			<div class="phead">
				<h3>{regionName(i18n.locale, current.region, current.side)}</h3>
				{#if points.length > 1}
					<button type="button" class="nav" aria-label={t('bodymap.point.prev')} onclick={() => step(-1)}>
						<Icon name="chevron-left" size={20} />
					</button>
				{/if}
				<span class="muted count" aria-live="polite"
					>{t('bodymap.point.of', { n: sel + 1, total: points.length })}</span
				>
				{#if points.length > 1}
					<button type="button" class="nav" aria-label={t('bodymap.point.next')} onclick={() => step(1)}>
						<Icon name="chevron-right" size={20} />
					</button>
				{/if}
			</div>
			<p class="label">
				{t('bodymap.intensity.title')}<span class="hint">{t('bodymap.intensity.hint')}</span>
			</p>
			<div class="ramp" role="radiogroup" aria-label={t('bodymap.intensity.group')}>
				{#each ramp as n (n)}
					{@const on = current.intensity === n}
					<button
						type="button"
						role="radio"
						aria-checked={on}
						data-n={n}
						tabindex={on || (current.intensity === undefined && n === 0) ? 0 : -1}
						class:on
						style:background="var(--heat-{heatStep(n)})"
						style:color={heatStep(n) >= 4 ? 'var(--on-heat-hi)' : 'var(--text)'}
						onclick={() => setIntensity(n)}
						onkeydown={(e) => onRampKey(e, n)}>{n}</button
					>
				{/each}
			</div>
			<p class="label">{t('bodymap.quality.title')}<span class="hint">{t('bodymap.quality.hint')}</span></p>
			<div class="chips">
				{#each PAIN_QUALITIES as q (q)}
					{@const on = current.qualities.includes(q)}
					<Chip
						selected={on}
						disabled={!on && current.qualities.length >= MAX_PAIN_QUALITIES}
						onclick={() => toggleQuality(q)}>{t(`bodymap.quality.${q}` as MessageKey)}</Chip
					>
				{/each}
			</div>
			<div class="noterow">
				<input
					type="text"
					aria-label={t('bodymap.note.label')}
					placeholder={t('bodymap.note.placeholder')}
					maxlength={MAX_POINT_NOTE}
					value={current.note}
					oninput={(e) => (current.note = e.currentTarget.value)}
				/>
				<Button variant="quiet" size="sm" onclick={remove}>{t('bodymap.point.remove')}</Button>
			</div>
		{:else}
			<p class="empty">
				{full ? t('bodymap.full') : points.length === 0 ? t('bodymap.hint.first') : t('bodymap.hint.next')}
			</p>
		{/if}
	</div>
{/snippet}

<style>
	.same {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 52px;
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--r-md);
		background: var(--pain-tint);
		color: var(--pain-ink);
		text-align: left;
	}
	.same-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-size: var(--fs-callout);
	}
	.same-text .muted {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-2);
	}
	.toolbar {
		display: flex;
		gap: var(--sp-2);
		align-items: stretch;
	}
	.toolbar :global(.segmented) {
		flex: 1;
	}
	.find {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
		white-space: nowrap;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-height: 3rem;
	}
	.phead {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}
	.phead h3 {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
	}
	.count {
		font-size: var(--fs-footnote);
		white-space: nowrap;
	}
	.nav {
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		color: var(--text-2);
	}
	.label {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-2);
		margin: var(--sp-1) 0 0;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.label .hint {
		font-weight: var(--fw-regular);
		color: var(--text-3);
		text-align: right;
	}
	.ramp {
		display: grid;
		grid-template-columns: repeat(11, 1fr);
		gap: 3px;
	}
	.ramp button {
		min-height: 44px;
		border-radius: var(--r-sm);
		font-weight: var(--fw-bold);
		font-size: var(--fs-callout);
	}
	.ramp button.on {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--text);
	}
	.ramp button:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chips :global(.chip) {
		padding: 0 10px;
		font-size: var(--fs-footnote);
	}
	.noterow {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.noterow input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-callout);
	}
	.noterow input::placeholder {
		color: var(--text-3);
	}
	.noterow input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.empty {
		margin: 0;
		color: var(--text-2);
		font-size: var(--fs-callout);
	}
</style>
