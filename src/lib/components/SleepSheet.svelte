<script lang="ts">
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import ScalePicker from './ScalePicker.svelte';
	import Segmented from './Segmented.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { formatDuration } from '$lib/records/format';
	import { nightFor, sleepProblem, usualNight } from '$lib/records/log';
	import { allRecords } from '$lib/records/store.svelte';
	import { formatAt, fromLocalInput, minutesBetween, toLocalInput, todayKey } from '$lib/records/time';
	import type { Payload, SleepPayload } from '$lib/records/types';

	type Nap = { from: string; to: string };

	let asleep = $state('');
	let wake = $state('');
	let quality = $state<number | undefined>();
	let awakenings = $state<'0' | '1' | '2' | '3'>('0');
	let naps = $state<Nap[]>([]);
	let note = $state('');
	let showNote = $state(false);
	let usual = $state(false);

	const awakeningOptions = [
		{ value: '0' as const, label: '0' },
		{ value: '1' as const, label: '1' },
		{ value: '2' as const, label: '2' },
		{ value: '3' as const, label: '3+' }
	];

	function onopen(existing: Payload | null) {
		const s = existing?.type === 'sleep' ? existing : null;
		usual = !s;
		if (s) {
			asleep = toLocalInput(s.asleepAt);
			wake = toLocalInput(s.at);
		} else {
			// Pre-filled from the usual times: the median of the last 7 nights, else 23:00 to 07:00.
			const sleeps: SleepPayload[] = [];
			for (const r of allRecords()) if (r.payload.type === 'sleep') sleeps.push(r.payload);
			const u = usualNight(sleeps);
			const night = nightFor(todayKey(), u.asleep, u.wake);
			asleep = night ? toLocalInput(night.asleepAt) : '';
			wake = night ? toLocalInput(night.at) : toLocalInput(formatAt(new Date()));
		}
		quality = s?.quality;
		awakenings = (String(Math.min(s?.awakenings ?? 0, 3)) as typeof awakenings) ?? '0';
		naps = s?.naps?.map((n) => ({ from: toLocalInput(n.from), to: toLocalInput(n.to) })) ?? [];
		note = s?.note ?? '';
		showNote = !!s?.note;
	}

	const asleepAt = $derived(fromLocalInput(asleep));
	const wakeAt = $derived(fromLocalInput(wake));
	const problem = $derived(
		sleepProblem(
			asleepAt,
			wakeAt,
			naps.map((n) => ({ from: fromLocalInput(n.from), to: fromLocalInput(n.to) }))
		)
	);
	const duration = $derived(
		asleepAt && wakeAt && !problem ? formatDuration(minutesBetween(asleepAt, wakeAt)) : '–'
	);

	function addNap() {
		const base = wake.slice(0, 11);
		naps = [...naps, { from: `${base}13:00`, to: `${base}13:30` }];
	}

	function payload(): Payload | null {
		if (!asleepAt || !wakeAt || problem) return null;
		const p: SleepPayload = { v: 1, type: 'sleep', asleepAt, at: wakeAt };
		if (quality !== undefined) p.quality = quality;
		if (awakenings !== '0') p.awakenings = Number(awakenings);
		const list = naps.flatMap((n) => {
			const from = fromLocalInput(n.from);
			const to = fromLocalInput(n.to);
			return from && to ? [{ from, to }] : [];
		});
		if (list.length > 0) p.naps = list;
		if (note.trim()) p.note = note.trim();
		return p;
	}
</script>

<LogSheet kind="sleep" title={t('sleep.title')} valid={problem === null} {payload} {onopen} showTime={false}>
	<div class="sum">
		<div class="big" aria-live="polite" data-testid="sleep-duration">{duration}</div>
		{#if usual}<div class="muted small">{t('sleep.usualHint')}</div>{/if}
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
	{#if problem === 'nap'}<p class="muted small" role="status">{t('sleep.problem.nap')}</p>{/if}

	<p class="label">{t('sleep.quality')}</p>
	<ScalePicker
		bind:value={quality}
		label={t('sleep.quality')}
		low={t('sleep.quality.low')}
		high={t('sleep.quality.high')}
		tint="sleep"
	/>
	<p class="label">{t('sleep.awakenings')}</p>
	<Segmented options={awakeningOptions} bind:value={awakenings} label={t('sleep.awakenings')} />

	{#each naps as nap, i (i)}
		<div class="nap">
			<span class="k"><Icon name="bed" size={18} />{t('sleep.nap')}</span>
			<button
				type="button"
				class="rm"
				aria-label={t('sleep.nap.remove')}
				onclick={() => (naps = naps.filter((_, j) => j !== i))}><Icon name="x" size={18} /></button
			>
			<input type="datetime-local" aria-label={t('sleep.nap.from')} bind:value={nap.from} />
			<input type="datetime-local" aria-label={t('sleep.nap.to')} bind:value={nap.to} />
		</div>
	{/each}
	<div class="row2">
		<Button variant="quiet" onclick={addNap}><Icon name="plus" size={18} />{t('sleep.nap')}</Button>
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
	.tcard input,
	.nap input {
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
		min-height: 32px;
	}
	.nap {
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-items: center;
		gap: var(--sp-2);
		background: var(--sleep-tint);
		color: var(--sleep-ink);
		border-radius: var(--r-lg);
		padding: var(--sp-2) var(--sp-3);
	}
	.nap input {
		font-size: var(--fs-footnote);
	}
	.rm {
		grid-row: 1;
		grid-column: 2;
		justify-self: end;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
	}
	.row2 {
		display: flex;
		gap: var(--sp-2);
	}
	.row2 :global(.btn) {
		flex: 1;
	}
</style>
