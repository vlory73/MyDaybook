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
	import {
		FACES,
		activeWide,
		regionName,
		spaceOf,
		viewOf,
		wideOptions,
		widen,
		zoomFor,
		type Anchor,
		type BodyPlace,
		type Face,
		type HeadFace,
		type View,
		type WideOption,
		type Zoom,
		type ZoomState
	} from '$lib/bodymap/catalogue';
	import { editor, openNauseaFromPain } from '$lib/records/editor.svelte';
	import {
		HEADACHE_BEFORE,
		MAX_TRIGGER,
		hasHeadacheAnswers,
		isHeadPoint,
		nauseaLevel,
		type HeadacheBefore,
		type HeadacheDetails
	} from '$lib/records/headache';
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
	import { allRecords, store } from '$lib/records/store.svelte';
	import { applyJoin, joinPlan } from '$lib/records/episodeActions';
	import {
		chooserList,
		dayNumber,
		episodeRange,
		episodeViews,
		formatDay,
		latestOngoing,
		mostLoggedPlace,
		type JoinPlan
	} from '$lib/records/episodes';
	import { addDays, dayKey, formatAt, fromLocalInput, instant, todayKey } from '$lib/records/time';
	import type { GutPayload, Payload } from '$lib/records/types';

	/**
	 * "Where do you feel it?": place up to 20 points on the body (or pick them from Find), give each an intensity
	 * from 0 to 10 and optionally how it feels. The panel for the chosen point is pinned to the bottom of the sheet
	 * and the map scrolls so that the chosen region stays above it. Records only: nothing here rates or advises.
	 */
	type Draft = Omit<PainPoint, 'intensity' | 'note'> & {
		intensity?: number;
		note: string;
		/** The belly quarter or back part this point was widened from, so "This quarter" can put it back (not saved). */
		origin?: Anchor;
	};

	let time = $state('');
	let view = $state<View>('front');
	/** The close-up that is open, if any: the head, or one hand or foot with its face. */
	let zoomKind = $state<Zoom | null>(null);
	let zoomSide = $state<'left' | 'right'>('right');
	let zoomFace = $state<Face>('palm');
	let headFace = $state<HeadFace>('front');
	const zoom = $derived<ZoomState | null>(
		zoomKind === null
			? null
			: zoomKind === 'head'
				? { zoom: 'head', face: headFace }
				: { zoom: zoomKind, side: zoomSide, face: zoomFace }
	);
	let points = $state<Draft[]>([]);
	let sel = $state<number | null>(null);
	/** "+ Point" was pressed: the next tap adds a point even where one already is. */
	let placing = $state(false);
	let finding = $state(false);
	let entryNote: string | undefined;
	let panel: HTMLElement | undefined = $state();

	// Headache details (entry level). Day and hour are kept apart so the hour picker stays simple; an empty day means
	// "the day of the entry". Hours are "00".."23" or "" (not set).
	let headacheTick = $state(false);
	let hOpen = $state(false);
	let hStartDay = $state('');
	let hStartHour = $state('');
	let hStopDay = $state('');
	let hStopHour = $state('');
	let hStill = $state(false);
	let hBefore = $state<HeadacheBefore[]>([]);
	let hActivity = $state<boolean | undefined>();
	let hLight = $state<boolean | undefined>();
	let hSound = $state<boolean | undefined>();
	let hTrigger = $state('');

	// Episode (pain episodes): the id the entry carries, an episode still to be made from the previous entry when
	// the entry joins it ("Same as last time"), and the open chooser.
	let epId = $state<string | undefined>();
	let epCreate = $state<JoinPlan['create']>();
	let choosing = $state(false);
	const episodes = $derived(episodeViews(allRecords(), i18n.locale, todayKey()));
	const epView = $derived(epId ? episodes.find((v) => v.id === epId) : undefined);
	/** The episode as the row shows it: an existing one, or the one that will be made from the previous entry. */
	const epShown = $derived.by(() => {
		if (epView) return { name: epView.name, startDay: epView.startDay };
		if (!epId || !epCreate) return undefined;
		const prev = store.items[epCreate.previousId]?.payload;
		if (prev?.type !== 'pain') return undefined;
		return {
			name: mostLoggedPlace(i18n.locale, [{ payload: prev }]) ?? t('episode.untitled'),
			startDay: dayKey(epCreate.started)
		};
	});
	const ongoingOffer = $derived(latestOngoing(episodes));
	const chooser = $derived(chooserList(episodes));
	function joinLast() {
		const plan = last ? joinPlan(last.id) : null;
		epId = plan?.episodeId;
		epCreate = plan?.create;
		choosing = false;
	}
	function chooseEpisode(id: string | undefined) {
		epId = id;
		epCreate = undefined;
		choosing = false;
	}

	const isNew = $derived(editor.log?.kind === 'pain' && editor.log.id === null);
	const last = $derived(latestPain(allRecords()));
	const current = $derived(sel === null ? undefined : points[sel]);
	const complete = $derived(points.length > 0 && points.every((p) => p.intensity !== undefined));
	const full = $derived(points.length >= MAX_PAIN_POINTS);
	const wides = $derived(
		current ? wideOptions(current, current.origin, zoomKind === 'head' ? headFace : undefined) : []
	);
	const wideNow = $derived(current ? activeWide(current, wides) : undefined);
	const hasHead = $derived(points.some((p) => isHeadPoint(p)));
	const showHeadache = $derived(hasHead || headacheTick);
	const entryDay = $derived(time.slice(0, 10));
	const offset = $derived((fromLocalInput(time) ?? formatAt(new Date())).slice(19));
	const hourAt = (day: string, hour: string) => `${day}T${hour}:00:00${offset}`;
	const startDay = $derived(hStartDay || entryDay);
	/** Until the person picks a day, a stop is on the start day, or the day after when its hour is earlier. */
	const stopDay = $derived(
		hStopDay ||
			(hStartHour !== '' && hStopHour !== '' && hStopHour < hStartHour ? addDays(startDay, 1) : startDay)
	);
	const startedAt = $derived(hStartHour === '' ? undefined : hourAt(startDay, hStartHour));
	const stoppedAt = $derived(hStill || hStopHour === '' ? undefined : hourAt(stopDay, hStopHour));
	const orderOk = $derived(
		startedAt === undefined ||
			stoppedAt === undefined ||
			Number.isNaN(instant(startedAt)) ||
			instant(stoppedAt) >= instant(startedAt)
	);
	const valid = $derived(complete && fromLocalInput(time) !== null && (!showHeadache || orderOk));
	const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
	/** The hour as the phone writes it (12 or 24 hour), for the picker. */
	const hourLabel = (h: string) =>
		new Date(2000, 0, 1, Number(h)).toLocaleTimeString(i18n.locale, { hour: 'numeric' });
	/** Nausea logged on the entry's day, in the diary's words (conversion in `headache.ts`). */
	const nausea = $derived(
		nauseaLevel(
			allRecords()
				.filter((r) => r.payload.type === 'gut' && dayKey(r.payload.at) === entryDay)
				.map((r) => r.payload as GutPayload)
		)
	);
	const offerSame = $derived(isNew && points.length === 0 && last !== undefined && !finding);

	function draftOf(p: PainPoint): Draft {
		return { ...p, qualities: [...p.qualities], note: p.note ?? '' };
	}

	type Stash = {
		time: string;
		points: Draft[];
		sel: number | null;
		entryNote?: string;
		ep: { id?: string; create?: JoinPlan['create'] };
		tick: boolean;
		open: boolean;
		h: ReturnType<typeof headacheDraft>;
	};

	const headacheDraft = () => ({
		startDay: hStartDay,
		startHour: hStartHour,
		stopDay: hStopDay,
		stopHour: hStopHour,
		still: hStill,
		before: [...hBefore],
		activity: hActivity,
		light: hLight,
		sound: hSound,
		trigger: hTrigger
	});

	function fillHeadache(h: HeadacheDetails | undefined) {
		hStartDay = h?.started?.slice(0, 10) ?? '';
		hStartHour = h?.started?.slice(11, 13) ?? '';
		hStopDay = h?.stopped?.slice(0, 10) ?? '';
		hStopHour = h?.stopped?.slice(11, 13) ?? '';
		hStill = h?.stillGoing === true;
		hBefore = [...(h?.before ?? [])];
		hActivity = h?.worseWithActivity;
		hLight = h?.light;
		hSound = h?.sound;
		hTrigger = h?.trigger ?? '';
	}

	function onopen(existing: Payload | null) {
		const saved = existing?.type === 'pain' ? existing : null;
		const back = editor.log?.resume ? editor.backToPain : null;
		editor.backToPain = null;
		placing = false;
		finding = false;
		if (back) {
			// Back from "Log nausea": the draft is exactly as it was left.
			const d = back.draft as Stash;
			time = d.time;
			points = d.points;
			sel = d.sel;
			entryNote = d.entryNote;
			epId = d.ep.id;
			epCreate = d.ep.create;
			choosing = false;
			headacheTick = d.tick;
			hOpen = d.open;
			hStartDay = d.h.startDay;
			hStartHour = d.h.startHour;
			hStopDay = d.h.stopDay;
			hStopHour = d.h.stopHour;
			hStill = d.h.still;
			hBefore = d.h.before;
			hActivity = d.h.activity;
			hLight = d.h.light;
			hSound = d.h.sound;
			hTrigger = d.h.trigger;
			zoomKind = null;
			const at = sel === null ? undefined : points[sel];
			if (at) show(at);
			if (points.length > 0) void reveal(false);
			return;
		}
		entryNote = saved?.note;
		headacheTick = saved?.headache !== undefined;
		hOpen = saved ? hasHeadacheAnswers(saved.headache ?? {}) : true;
		fillHeadache(saved?.headache);
		if (saved) points = saved.points.map(draftOf);
		else if (editor.log?.same && last) points = copyPoints(last.payload).map(draftOf);
		else points = [];
		epId = saved?.episode;
		epCreate = undefined;
		choosing = false;
		// "Same as last time" and "Log today" join the previous entry's episode.
		if (!saved && editor.log?.same && last) joinLast();
		sel = points.length > 0 ? 0 : null;
		view = points[0] ? viewOf(points[0].space) : 'front';
		zoomKind = null;
		if (points[0]) show(points[0]);
		if (points.length > 0) void reveal(false);
	}

	function sameAsLast() {
		if (!last) return;
		points = copyPoints(last.payload).map(draftOf);
		joinLast();
		sel = 0;
		show(points[0]!);
		void reveal(false);
	}

	/** Shows the view, or close-up, that a point is in. */
	function show(at: { region: string; side: BodyPlace['side']; space: BodyPlace['space'] }) {
		const next = zoomFor(at, zoom);
		if (next) {
			zoomKind = next.zoom;
			if (next.zoom === 'head') headFace = next.face;
			else {
				zoomSide = next.side;
				zoomFace = next.face;
			}
		} else {
			zoomKind = null;
			view = viewOf(at.space);
		}
	}

	function openZoom(kind: Zoom) {
		zoomKind = kind;
		if (kind === 'head') headFace = 'front';
		else {
			zoomFace = FACES[kind][0];
			zoomSide = 'right';
		}
		finding = false;
	}

	function closeZoom() {
		zoomKind = null;
	}

	function setWider(option: WideOption) {
		if (!current) return;
		const next = widen(
			{ region: current.region, side: current.side, u: current.u, v: current.v, space: current.space },
			option,
			current.origin
		);
		current.region = next.place.region;
		current.side = next.place.side;
		current.u = next.place.u;
		current.v = next.place.v;
		current.origin = next.origin;
		if (next.place.space) current.space = next.place.space;
		// "This spot" goes back to the drawing the tap was made on.
		if (option.id === 'this') show(current);
		void reveal(false);
	}

	/** Keeps the chosen region above the pinned panel, and (for keyboard use) moves focus to its intensity row. */
	async function reveal(focus: boolean) {
		await tick();
		await tick();
		if (focus)
			panel?.querySelector<HTMLElement>('[role=radio][tabindex="0"]')?.focus({ preventScroll: true });
		const region = document.querySelector<SVGElement>('.rg.sel, .wide.sel');
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
		show(at);
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
		show(points[sel]!);
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
		if (epId && (epView || epCreate)) p.episode = epId;
		if (showHeadache) {
			const h: HeadacheDetails = {};
			if (startedAt) h.started = startedAt;
			if (stoppedAt) h.stopped = stoppedAt;
			if (hStill) h.stillGoing = true;
			if (hBefore.length > 0) h.before = HEADACHE_BEFORE.filter((b) => hBefore.includes(b));
			if (hActivity !== undefined) h.worseWithActivity = hActivity;
			if (hLight !== undefined) h.light = hLight;
			if (hSound !== undefined) h.sound = hSound;
			if (hTrigger.trim()) h.trigger = hTrigger.trim();
			// With a point on the head, an empty form adds nothing; a ticked "This is a headache" is kept as `{}`.
			if (hasHeadacheAnswers(h) || headacheTick) p.headache = h;
		}
		return p;
	}

	function toggleBefore(b: HeadacheBefore) {
		hBefore = hBefore.includes(b) ? hBefore.filter((x) => x !== b) : [...hBefore, b];
	}
	const answer = (current: boolean | undefined, value: boolean) => (current === value ? undefined : value);

	/** "Log nausea": the draft is parked, the nausea sheet opens at the entry's time, and closing it comes back here. */
	function logNausea() {
		const draft: Stash = {
			time,
			points: $state.snapshot(points) as Draft[],
			sel,
			entryNote,
			ep: { id: epId, create: epCreate },
			tick: headacheTick,
			open: hOpen,
			h: $state.snapshot(headacheDraft())
		};
		openNauseaFromPain({ id: editor.log?.id ?? null, draft }, fromLocalInput(time) ?? formatAt(new Date()));
	}

	/** Before the entry is saved: make the episode it joins (and link the previous entry), so the link has a target. */
	async function onbeforesave() {
		if (epId && epCreate) await applyJoin({ episodeId: epId, create: epCreate });
	}

	const zoomButtons = ['head', 'hand', 'foot'] as const;
	/** How many points of this entry are in a close-up's space (shown as a badge on its button). */
	const zoomCount = (z: Zoom) =>
		points.filter((p) => p.space === spaceOf(z) || (z === 'head' && p.space === spaceOf('head_back'))).length;
	const zoomLabel = (z: Zoom) => {
		const label = t(`bodymap.zoom.${z}.aria` as MessageKey);
		const n = zoomCount(z);
		return n > 0 ? tn('bodymap.zoom.points', n, { label }) : label;
	};
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
	{onbeforesave}
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
		{#if zoom}
			<button type="button" class="back" onclick={closeZoom}>
				<Icon name="chevron-left" size={18} />{t('bodymap.zoom.back')}
			</button>
		{:else}
			<Segmented
				label={t('bodymap.view')}
				bind:value={view}
				options={[
					{ value: 'front', label: t('bodymap.front') },
					{ value: 'back', label: t('bodymap.back') }
				]}
			/>
		{/if}
		<button type="button" class="find" aria-expanded={finding} onclick={toggleFind}>
			<Icon name={finding ? 'x' : 'search'} size={18} />
			{finding ? t('bodymap.find.back') : t('bodymap.find')}
		</button>
	</div>
	{#if !finding && !zoom}
		<div class="zooms" role="group" aria-label={t('bodymap.zoom.label')}>
			{#each zoomButtons as z (z)}
				<button type="button" class="zoom" data-zoom={z} aria-label={zoomLabel(z)} onclick={() => openZoom(z)}
					>{t(`bodymap.zoom.${z}` as MessageKey)}{#if zoomCount(z) > 0}<span class="badge" aria-hidden="true"
							>{zoomCount(z)}</span
						>{/if}</button
				>
			{/each}
		</div>
	{/if}
	{#if !finding && zoomKind === 'head'}
		<div class="toggles">
			<Segmented
				label={t('bodymap.head.face')}
				bind:value={headFace}
				options={[
					{ value: 'front', label: t('bodymap.front') },
					{ value: 'back', label: t('bodymap.back') }
				]}
			/>
		</div>
	{/if}
	{#if !finding && (zoomKind === 'hand' || zoomKind === 'foot')}
		<div class="toggles">
			<Segmented
				label={t(`bodymap.${zoomKind}.side` as MessageKey)}
				bind:value={zoomSide}
				options={[
					{ value: 'right', label: t(`bodymap.${zoomKind}.right` as MessageKey) },
					{ value: 'left', label: t(`bodymap.${zoomKind}.left` as MessageKey) }
				]}
			/>
			<Segmented
				label={t(`bodymap.${zoomKind}.face` as MessageKey)}
				bind:value={zoomFace}
				options={FACES[zoomKind].map((f) => ({ value: f, label: t(`bodymap.face.${f}` as MessageKey) }))}
			/>
		</div>
	{/if}
	{#if finding}
		<RegionFinder {view} onpick={(at) => pickFound(at)} />
	{:else}
		<BodyMap
			bind:view
			{zoom}
			showToggle={false}
			width={zoom ? (zoom.zoom === 'head' ? 250 : 190) : 210}
			{points}
			selected={current ? { region: current.region, side: current.side } : null}
			ontap={place}
		/>
		{@render headache()}
		{@render episodeRow()}
	{/if}
</LogSheet>

{#snippet headache()}
	<div class="hd">
		<label class="tick">
			<input
				type="checkbox"
				checked={hasHead || headacheTick}
				disabled={hasHead}
				onchange={(e) => (headacheTick = e.currentTarget.checked)}
			/>
			{t('headache.tick')}
		</label>
		{#if showHeadache}
			<button type="button" class="hd-head" aria-expanded={hOpen} onclick={() => (hOpen = !hOpen)}>
				<span>{t('headache.title')}</span>
				<Icon name={hOpen ? 'chevron-down' : 'chevron-right'} size={18} />
			</button>
			{#if hOpen}
				<div class="hd-body">
					{#each [{ key: 'started', hourKey: 'start' }, { key: 'stopped', hourKey: 'stop' }] as row (row.key)}
						{@const isStart = row.key === 'started'}
						{@const off = !isStart && hStill}
						<div class="when" role="group" aria-label={t(`headache.${row.key}` as MessageKey)}>
							<span class="label">{t(`headache.${row.key}` as MessageKey)}</span>
							<div class="pick">
								<input
									type="date"
									class="field"
									aria-label={t('headache.day') + ' ' + t(`headache.${row.key}` as MessageKey)}
									disabled={off}
									value={isStart ? startDay : stopDay}
									onchange={(e) =>
										isStart ? (hStartDay = e.currentTarget.value) : (hStopDay = e.currentTarget.value)}
								/>
								<select
									class="field"
									aria-label={t('headache.hour') + ' ' + t(`headache.${row.key}` as MessageKey)}
									disabled={off}
									value={isStart ? hStartHour : hStopHour}
									onchange={(e) =>
										isStart ? (hStartHour = e.currentTarget.value) : (hStopHour = e.currentTarget.value)}
								>
									<option value="">{t('headache.hour.none')}</option>
									{#each hours as h (h)}
										<option value={h}>{hourLabel(h)}</option>
									{/each}
								</select>
							</div>
							{#if !isStart}
								<Chip selected={hStill} onclick={() => (hStill = !hStill)}>{t('headache.stillGoing')}</Chip>
							{/if}
						</div>
					{/each}
					{#if !orderOk}
						<p class="warn" role="alert">{t('headache.order')}</p>
					{/if}
					<p class="label">{t('headache.before')}</p>
					<div class="chips">
						{#each HEADACHE_BEFORE as b (b)}
							<Chip selected={hBefore.includes(b)} onclick={() => toggleBefore(b)}
								>{t(`headache.before.${b}` as MessageKey)}</Chip
							>
						{/each}
					</div>
					{#each [{ k: 'activity', v: hActivity }, { k: 'light', v: hLight }, { k: 'sound', v: hSound }] as q (q.k)}
						<div class="yn" role="group" aria-label={t(`headache.${q.k}` as MessageKey)}>
							<span>{t(`headache.${q.k}` as MessageKey)}</span>
							<div class="chips">
								{#each [true, false] as yes (yes)}
									<Chip
										selected={q.v === yes}
										onclick={() => {
											const next = answer(q.v, yes);
											if (q.k === 'activity') hActivity = next;
											else if (q.k === 'light') hLight = next;
											else hSound = next;
										}}>{yes ? t('headache.yes') : t('headache.no')}</Chip
									>
								{/each}
							</div>
						</div>
					{/each}
					<label class="label" for="hd-trigger">{t('headache.trigger')}</label>
					<input
						id="hd-trigger"
						type="text"
						class="field text"
						maxlength={MAX_TRIGGER}
						placeholder={t('headache.trigger.placeholder')}
						bind:value={hTrigger}
					/>
					<div class="nausea">
						<span aria-live="polite"
							>{t('headache.nausea.shown', { level: t(`headache.nausea.${nausea}` as MessageKey) })}</span
						>
						<Button variant="quiet" size="sm" onclick={logNausea}>{t('headache.nausea.log')}</Button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet episodeRow()}
	{#if epShown || episodes.length > 0}
		<div class="ep">
			<p class="label">{t('episode.row.label')}</p>
			{#if epShown}
				<div class="eprow">
					<div class="epname">
						<b>{epShown.name}</b>
						<span class="muted small"
							>{t('episode.row.since', {
								date: formatDay(i18n.locale, epShown.startDay),
								n: dayNumber(epShown.startDay, time)
							})}</span
						>
					</div>
					<button type="button" class="eplink" aria-expanded={choosing} onclick={() => (choosing = !choosing)}
						>{t('episode.row.change')}</button
					>
				</div>
			{:else}
				<div class="chips">
					{#if ongoingOffer}
						<Chip onclick={() => chooseEpisode(ongoingOffer.id)}>
							<Icon name="plus" size={14} />{t('episode.row.add', { name: ongoingOffer.name })}
						</Chip>
					{/if}
				</div>
				<button
					type="button"
					class="eplink start"
					aria-expanded={choosing}
					onclick={() => (choosing = !choosing)}>{t('episode.row.choose')}</button
				>
			{/if}
			{#if choosing}
				<ul class="chooser" aria-label={t('episode.row.group')}>
					{#each chooser as v (v.id)}
						<li>
							<button type="button" class:on={v.id === epId} onclick={() => chooseEpisode(v.id)}>
								<b>{v.name}</b>
								<span class="muted small">{episodeRange(i18n.locale, v)}</span>
							</button>
						</li>
					{/each}
					<li>
						<button type="button" class:on={!epId} onclick={() => chooseEpisode(undefined)}
							><b>{t('episode.row.none')}</b></button
						>
					</li>
				</ul>
			{/if}
		</div>
	{/if}
{/snippet}

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
			{#if wides.length > 1}
				<div class="chips wide" role="group" aria-label={t('bodymap.wide.group')}>
					{#each wides as o (o.id)}
						<Chip selected={wideNow === o.id} onclick={() => setWider(o)}>{t(o.key)}</Chip>
					{/each}
				</div>
			{/if}
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
			<div class="zones" aria-hidden="true">
				<span class="z1">{t('bodymap.zone.mild')}</span>
				<span class="z2">{t('bodymap.zone.moderate')}</span>
				<span class="z3">{t('bodymap.zone.severe')}</span>
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
	.ep {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.ep .label {
		margin: 0;
	}
	.eprow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		background: var(--surface-2);
		border-radius: var(--r-md);
		padding: 8px 8px 8px var(--sp-4);
		min-height: 56px;
	}
	.epname {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.eplink {
		min-height: 36px;
		padding: 0 var(--sp-2);
		color: var(--primary);
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
	.eplink.start {
		align-self: flex-start;
	}
	.chooser {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.chooser button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		min-height: 48px;
		padding: var(--sp-2) var(--sp-4);
		justify-content: center;
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1.5px solid transparent;
		text-align: left;
	}
	.chooser button.on {
		background: var(--primary-soft);
		border-color: var(--primary);
	}
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
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.zooms {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.zoom {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		white-space: nowrap;
		min-height: 40px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		margin-left: 6px;
		padding: 0 6px;
		border-radius: var(--r-full);
		background: var(--primary);
		color: var(--on-primary, #fff);
		font-size: var(--fs-caption);
		font-weight: var(--fw-bold);
	}
	.zoom:active {
		background: var(--surface-3);
	}
	.toggles {
		display: flex;
		gap: var(--sp-2);
	}
	.toggles :global(.segmented) {
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
	/* Zone labels sit under the 0 to 10 ramp: 1-3, 4-6 and 7-10. A reading aid only. */
	.zones {
		display: grid;
		grid-template-columns: repeat(11, 1fr);
		gap: 3px;
		margin-top: -2px;
		font-size: var(--fs-caption);
		color: var(--text-3);
		text-align: center;
	}
	.zones span {
		padding-top: 2px;
		border-top: 2px solid var(--surface-3);
		white-space: nowrap;
	}
	.z1 {
		grid-column: 2 / 5;
	}
	.z2 {
		grid-column: 5 / 8;
	}
	.z3 {
		grid-column: 8 / 12;
	}
	.hd {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}
	.tick {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 44px;
		font-size: var(--fs-callout);
	}
	.tick input {
		width: 22px;
		height: 22px;
		accent-color: var(--primary);
	}
	.hd-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		background: var(--surface-2);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.hd-body {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3);
		border-radius: var(--r-md);
		border: 1.5px solid var(--surface-3);
	}
	.when {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}
	.when .label {
		width: 5.5rem;
		margin: 0;
	}
	.pick {
		display: flex;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
	}
	.field {
		min-height: 44px;
		min-width: 0;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-callout);
	}
	.pick .field {
		flex: 1;
	}
	.field.text {
		width: 100%;
	}
	.field:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.warn {
		margin: 0;
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.yn {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: var(--fs-callout);
	}
	.nausea {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		font-size: var(--fs-callout);
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
