<script lang="ts">
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import ScalePicker from './ScalePicker.svelte';
	import Segmented from './Segmented.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { formatDuration } from '$lib/records/format';
	import { DEFAULT_NAP_MINUTES, nightFor, sleepKindByHour, sleepProblem, usualNight } from '$lib/records/log';
	import { allRecords } from '$lib/records/store.svelte';
	import { formatAt, fromLocalInput, minutesBetween, toLocalInput, todayKey } from '$lib/records/time';
	import { isNap, type Payload, type SleepPayload } from '$lib/records/types';

	type Kind = 'main' | 'nap';

	let asleep = $state('');
	let wake = $state('');
	let quality = $state<number | undefined>();
	let awakenings = $state<'0' | '1' | '2' | '3'>('0');
	let kind = $state<Kind>('main');
	/** Old nap list of a night that has not been converted yet: kept as it is, never edited here. */
	let legacyNaps: SleepPayload['naps'];
	let note = $state('');
	let showNote = $state(false);
	let usual = $state(false);

	const kindOptions = $derived([
		{ value: 'main' as const, label: t('sleep.kind.main') },
		{ value: 'nap' as const, label: t('sleep.kind.nap') }
	]);
	const awakeningOptions = [
		{ value: '0' as const, label: '0' },
		{ value: '1' as const, label: '1' },
		{ value: '2' as const, label: '2' },
		{ value: '3' as const, label: '3+' }
	];

	/** Times a new entry starts with: the usual night, or a nap that ends now. */
	function defaults(k: Kind) {
		const now = new Date();
		if (k === 'nap') {
			asleep = toLocalInput(formatAt(new Date(now.getTime() - DEFAULT_NAP_MINUTES * 60_000)));
			wake = toLocalInput(formatAt(now));
			return;
		}
		// Pre-filled from the usual times: the median of the last 7 nights, else 23:00 to 07:00.
		const sleeps: SleepPayload[] = [];
		for (const r of allRecords()) if (r.payload.type === 'sleep') sleeps.push(r.payload);
		const u = usualNight(sleeps);
		const night = nightFor(todayKey(), u.asleep, u.wake);
		asleep = night ? toLocalInput(night.asleepAt) : '';
		wake = night ? toLocalInput(night.at) : toLocalInput(formatAt(now));
	}

	function setKind(k: Kind) {
		if (k === kind) return;
		kind = k;
		if (isNew) {
			defaults(k);
			usual = true;
		}
	}

	let isNew = $state(true);

	function onopen(existing: Payload | null) {
		const s = existing?.type === 'sleep' ? existing : null;
		isNew = !s;
		usual = !s;
		legacyNaps = s?.naps;
		if (s) {
			kind = isNap(s) ? 'nap' : 'main';
			asleep = toLocalInput(s.asleepAt);
			wake = toLocalInput(s.at);
		} else {
			kind = sleepKindByHour(new Date().getHours());
			defaults(kind);
		}
		quality = s?.quality;
		awakenings = (String(Math.min(s?.awakenings ?? 0, 3)) as typeof awakenings) ?? '0';
		note = s?.note ?? '';
		showNote = !!s?.note;
	}

	const asleepAt = $derived(fromLocalInput(asleep));
	const wakeAt = $derived(fromLocalInput(wake));
	const problem = $derived(sleepProblem(asleepAt, wakeAt, []));
	const duration = $derived(
		asleepAt && wakeAt && !problem ? formatDuration(minutesBetween(asleepAt, wakeAt)) : '–'
	);

	function payload(): Payload | null {
		if (!asleepAt || !wakeAt || problem) return null;
		const p: SleepPayload = { v: 1, type: 'sleep', asleepAt, at: wakeAt };
		if (quality !== undefined) p.quality = quality;
		if (kind === 'nap') p.kind = 'nap';
		else {
			if (awakenings !== '0') p.awakenings = Number(awakenings);
			if (legacyNaps?.length) p.naps = legacyNaps;
		}
		if (note.trim()) p.note = note.trim();
		return p;
	}
</script>

<LogSheet
	kind="sleep"
	title={t('sleep.title')}
	valid={problem === null}
	{payload}
	{onopen}
	showTime={false}
	saveLabel={kind === 'nap' ? t('sleep.nap.save') : undefined}
>
	<Segmented options={kindOptions} bind:value={() => kind, setKind} label={t('sleep.kind')} />
	{#if isNew}<p class="muted small hint">{t('sleep.kind.hint')}</p>{/if}
	<div class="sum">
		<div class="big" aria-live="polite" data-testid="sleep-duration">{duration}</div>
		{#if kind === 'nap'}
			<div class="muted small">{t('sleep.napHint')}</div>
		{:else if usual}
			<div class="muted small">{t('sleep.usualHint')}</div>
		{/if}
	</div>
	<div class="times">
		<label class="tcard">
			<span class="k"><Icon name="moon" size={18} />{t('sleep.asleep')}</span>
			<input type="datetime-local" aria-label={t('sleep.asleep')} bind:value={asleep} />
		</label>
		<label class="tcard">
			<span class="k"><Icon name="sunrise" size={18} />{t('sleep.wake')}</span>
			<input type="datetime-local" aria-label={t('sleep.wake')} bind:value={wake} />
		</label>
	</div>
	{#if problem === 'range'}<p class="muted small" role="status">{t('sleep.problem.range')}</p>{/if}

	<p class="label">
		{kind === 'nap' ? t('sleep.nap.quality') : t('sleep.quality')}
		{#if kind === 'nap'}<span class="muted small opt">{t('common.optional')}</span>{/if}
	</p>
	<ScalePicker
		bind:value={quality}
		label={kind === 'nap' ? t('sleep.nap.quality') : t('sleep.quality')}
		low={t('sleep.quality.low')}
		high={t('sleep.quality.high')}
		tint="sleep"
	/>
	{#if kind === 'main'}
		<p class="label">{t('sleep.awakenings')}</p>
		<Segmented options={awakeningOptions} bind:value={awakenings} label={t('sleep.awakenings')} />
	{/if}

	<div class="row2">
		<Button variant="quiet" onclick={() => (showNote = !showNote)}
			><Icon name="notebook-pen" size={18} />{t('common.note')}</Button
		>
	</div>
	{#if showNote}
		<textarea
			rows="3"
			aria-label={t('common.note')}
			placeholder={t('common.optional')}
			maxlength="2000"
			bind:value={note}
		></textarea>
	{/if}
</LogSheet>

<style>
	.sum {
		text-align: center;
		padding: var(--sp-1) 0;
	}
	.big {
		font-size: var(--fs-display);
		font-weight: var(--fw-bold);
		line-height: 1.1;
	}
	.times {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sp-3);
	}
	.tcard {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		background: var(--sleep-tint);
		color: var(--sleep-ink);
		border-radius: var(--r-lg);
		padding: var(--sp-3);
	}
	.k {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
	}
	.tcard input {
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
		min-height: 32px;
	}
	.hint {
		margin: var(--sp-2) 0 0;
	}
	.opt {
		margin-left: 6px;
		font-weight: var(--fw-regular);
	}
	.row2 {
		display: flex;
		gap: var(--sp-2);
	}
	.row2 :global(.btn) {
		flex: 1;
	}
</style>
