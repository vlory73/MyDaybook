<script lang="ts">
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import Toggle from './Toggle.svelte';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import {
		LEAK_AMOUNTS,
		LEAK_WHEN,
		URGENCIES,
		lastVisitOnDay,
		repeatVisit,
		visitsOnDay,
		type BladderPayload,
		type LeakAmount,
		type LeakWhen,
		type Urgency
	} from '$lib/records/bladder';
	import { closeEditors, editor } from '$lib/records/editor.svelte';
	import { quickSave } from '$lib/records/quick';
	import { allRecords } from '$lib/records/store.svelte';
	import { dayKey, formatAt, fromLocalInput, timeOf, todayKey } from '$lib/records/time';
	import type { Payload } from '$lib/records/types';

	/**
	 * The Bladder sheet (#123): "Log a visit" saves at once with whatever details are set, and the usual Save at the
	 * bottom does the same, like every other sheet. Record only: no counts are compared with anything.
	 */
	let time = $state('');
	let visit = $state(true);
	let urgency = $state<Urgency | null>(null);
	let discomfort = $state(false);
	let amount = $state<LeakAmount | null>(null);
	let when = $state<LeakWhen | null>(null);
	let note = $state('');

	const editing = $derived(editor.log?.kind === 'bladder' && editor.log.id !== null);

	function onopen(existing: Payload | null) {
		const p = existing?.type === 'bladder' ? existing : null;
		visit = p?.visit ?? true;
		urgency = p?.urgency ?? null;
		discomfort = p?.discomfort === true;
		amount = p?.leak?.amount ?? null;
		when = p?.leak?.when ?? null;
		note = p?.note ?? '';
	}

	const valid = $derived(fromLocalInput(time) !== null && (visit || amount !== null));

	function build(at: string, asVisit: boolean): BladderPayload {
		const p: BladderPayload = { v: 1, type: 'bladder', at, visit: asVisit };
		if (urgency) p.urgency = urgency;
		if (discomfort) p.discomfort = true;
		if (amount) p.leak = when ? { amount, when } : { amount };
		if (note.trim()) p.note = note.trim();
		return p;
	}
	function payload(): Payload | null {
		const at = fromLocalInput(time);
		return at && valid ? build(at, visit) : null;
	}

	// The one-tap buttons save at once (with Undo) and close the sheet.
	function logVisit() {
		const at = fromLocalInput(time);
		if (!at) return;
		closeEditors();
		void quickSave(build(at, true), 'entry.saved');
	}
	function logLeakOnly() {
		const at = fromLocalInput(time);
		if (!at || amount === null) return;
		closeEditors();
		void quickSave(build(at, false), 'entry.saved');
	}

	// The day's last visit, for "+ 1 again" and the plain count of the day.
	const day = $derived(time ? dayKey(time) : todayKey());
	const last = $derived(!editing ? lastVisitOnDay(allRecords(), day) : undefined);
	const count = $derived(visitsOnDay(allRecords(), day));
	const lastText = $derived.by(() => {
		if (!last) return '';
		const parts: string[] = [];
		if (last.payload.urgency) {
			parts.push(
				t('bladder.lastUrgency', { level: t(`fmt.bladder.urgency.${last.payload.urgency}` as MessageKey) })
			);
		}
		parts.push(tn('bladder.today', count));
		return parts.join(' · ');
	});
	function again() {
		if (!last) return;
		closeEditors();
		void quickSave(repeatVisit(last.payload, formatAt(new Date())), 'entry.saved');
	}
	// Reading "Last visit 08:12" in the phone's own clock style.
	const clock = $derived(
		last
			? new Intl.DateTimeFormat(i18n.locale, { hour: 'numeric', minute: '2-digit' }).format(
					new Date(`2000-01-01T${timeOf(last.payload.at)}:00`)
				)
			: ''
	);

	const urgencyText = (u: Urgency) => t(`bladder.urgency.${u}` as MessageKey);
	function pickUrgency(u: Urgency) {
		urgency = urgency === u ? null : u;
	}
	function pickAmount(a: LeakAmount | null) {
		amount = a !== null && amount === a ? null : a;
		if (amount === null) when = null;
	}
	function pickWhen(w: LeakWhen) {
		when = when === w ? null : w;
	}
</script>

<LogSheet kind="bladder" title={t('cat.bladder')} {valid} {payload} {onopen} bind:time>
	{#if !editing}
		<div class="bigrow">
			<button type="button" class="big" data-testid="bladder-visit" onclick={logVisit}>
				<Icon name="check" size={26} />
				<span>{t('bladder.visit')}<small>{t('bladder.visit.sub')}</small></span>
			</button>
			<button
				type="button"
				class="leakonly"
				data-testid="bladder-leak-only"
				disabled={amount === null}
				onclick={logLeakOnly}
			>
				{t('bladder.leakOnly')}
				{#if amount === null}<small>{t('bladder.leakOnly.hint')}</small>{/if}
			</button>
		</div>

		{#if last}
			<div class="again" data-testid="bladder-last">
				<span class="grow">{t('bladder.last', { time: clock })}<small>{lastText}</small></span>
				<button type="button" class="plus" aria-label={t('bladder.again.aria')} onclick={again}
					>{t('bladder.again')}</button
				>
			</div>
		{/if}
		<p class="label">{t('bladder.details')}<span class="hint">{t('common.optional')}</span></p>
	{/if}

	<p class="sub">{t('bladder.urgency')}</p>
	<div class="seg3" role="radiogroup" aria-label={t('bladder.urgency')}>
		{#each URGENCIES as u (u)}
			<button
				type="button"
				role="radio"
				aria-checked={urgency === u}
				class:on={urgency === u}
				onclick={() => pickUrgency(u)}>{urgencyText(u)}</button
			>
		{/each}
	</div>

	<div class="swrow">
		<span>{t('bladder.discomfort')}</span>
		<Toggle bind:checked={discomfort} label={t('bladder.discomfort')} />
	</div>

	<p class="label">{t('bladder.leak')}<span class="hint">{t('bladder.leak.hint')}</span></p>
	<div class="chip-row leaks">
		<button
			type="button"
			class="bchip"
			class:on={amount === null}
			aria-pressed={amount === null}
			onclick={() => pickAmount(null)}>{t('bladder.leak.0')}</button
		>
		{#each LEAK_AMOUNTS as a (a)}
			<button
				type="button"
				class="bchip lk"
				class:on={amount === a}
				aria-pressed={amount === a}
				onclick={() => pickAmount(a)}
			>
				{#each Array.from({ length: a }, (_, i) => i) as i (i)}<Icon name="droplet" size={14} />{/each}
				{t(`bladder.leak.${a}` as MessageKey)}
			</button>
		{/each}
	</div>

	{#if amount !== null}
		<p class="label">{t('bladder.when')}<span class="hint">{t('common.optional')}</span></p>
		<div class="chip-row" data-testid="bladder-when">
			{#each LEAK_WHEN as w (w)}
				<button
					type="button"
					class="bchip"
					class:on={when === w}
					aria-pressed={when === w}
					onclick={() => pickWhen(w)}>{t(`bladder.when.${w}` as MessageKey)}</button
				>
			{/each}
		</div>
	{/if}

	<textarea
		rows="2"
		aria-label={t('common.note')}
		placeholder={t('common.optional')}
		maxlength="2000"
		bind:value={note}
	></textarea>
	<p class="foot"><Icon name="lock" size={18} />{t('quicklog.footnote')}</p>
</LogSheet>

<style>
	.bigrow {
		display: flex;
		gap: 10px;
	}
	.big {
		flex: 1.4;
		min-height: 64px;
		border-radius: var(--r-lg);
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
		background: var(--bladder-tint);
		color: var(--bladder-ink);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		box-shadow: inset 0 0 0 2px var(--bladder-mark);
	}
	.big small {
		display: block;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-medium);
		text-align: left;
	}
	.leakonly {
		flex: 1;
		min-height: 64px;
		line-height: 1.2;
		text-align: center;
		border-radius: var(--r-lg);
		background: var(--surface-2);
		font-weight: var(--fw-semibold);
		padding: 0 var(--sp-2);
	}
	.leakonly:disabled {
		color: var(--text-2);
	}
	.leakonly small {
		display: block;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.again {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 14px;
		border-radius: var(--r-md);
		background: var(--surface-2);
	}
	.again .grow {
		flex: 1;
		line-height: 1.25;
		font-weight: var(--fw-semibold);
	}
	.again small {
		display: block;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-regular);
		color: var(--text-2);
	}
	.plus {
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface);
		font-weight: var(--fw-semibold);
		white-space: nowrap;
		box-shadow: var(--shadow-1);
	}
	.sub {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: 0 0 calc(-1 * var(--sp-1));
	}
	.seg3 {
		display: flex;
		background: var(--surface-2);
		border-radius: var(--r-full);
		padding: 3px;
	}
	.seg3 button {
		flex: 1;
		min-height: 38px;
		border-radius: var(--r-full);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
		color: var(--text-2);
	}
	.seg3 .on {
		background: var(--bladder-tint);
		color: var(--bladder-ink);
		box-shadow: inset 0 0 0 1.5px var(--bladder-mark);
		font-weight: var(--fw-semibold);
	}
	.swrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 48px;
	}
	.swrow :global(.toggle.on) {
		background: var(--bladder-mark);
	}
	.bchip {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		min-height: 36px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
		border: 1.5px solid transparent;
		text-align: left;
	}
	.bchip.lk {
		padding: 0 9px;
		font-size: var(--fs-footnote);
	}
	.bchip :global(svg) {
		color: var(--bladder-mark);
	}
	.bchip.on {
		background: var(--bladder-tint);
		color: var(--bladder-ink);
		border-color: var(--bladder-mark);
	}
	.foot {
		display: flex;
		gap: 6px;
		align-items: center;
		justify-content: center;
		color: var(--text-2);
		font-size: var(--fs-footnote);
	}
</style>
