<script lang="ts">
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { editor, openLog } from '$lib/records/editor.svelte';
	import {
		FLOWS,
		PERIOD_EXTRAS,
		flowSize,
		periodOnDay,
		yesterdayOffer,
		type Flow,
		type PeriodExtra,
		type PeriodPayload
	} from '$lib/records/period';
	import { allRecords } from '$lib/records/store.svelte';
	import { dayDate, fromLocalInput, todayKey } from '$lib/records/time';
	import type { Payload } from '$lib/records/types';

	/**
	 * The Period sheet (#123): one entry per day. The day chip starts at today; a day that already has an entry opens
	 * that entry. Record only: no predictions or alerts.
	 */
	let time = $state('');
	let flow = $state<Flow | null>(null);
	let extras = $state<PeriodExtra[]>([]);
	let note = $state('');

	const day = $derived(time.slice(0, 10));
	const editing = $derived(editor.log?.kind === 'period' && editor.log.id !== null);
	const dayText = $derived.by(() => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
		const text = new Intl.DateTimeFormat(i18n.locale, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		}).format(dayDate(day));
		return day === todayKey() ? t('period.date.today', { date: text }) : text;
	});
	// "Same as yesterday": only for a new entry, when the day before has one and this day has none.
	const offer = $derived(!editing && day ? yesterdayOffer(allRecords(), day) : undefined);

	function onopen(existing: Payload | null) {
		const p = existing?.type === 'period' ? existing : null;
		flow = p?.flow ?? null;
		extras = p?.extras ?? [];
		note = p?.note ?? '';
	}

	function setDay(value: string) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value === day) return;
		const next = `${value}T${time.slice(11, 16) || '12:00'}`;
		const there = periodOnDay(allRecords(), value);
		if (there && there.id !== editor.log?.id) openLog('period', { id: there.id });
		else time = next;
	}

	const flowText = (f: Flow) => t(`period.flow.${f}` as MessageKey);
	const detail = (p: PeriodPayload) =>
		[
			t(`fmt.period.flow.${p.flow}` as MessageKey),
			...(p.extras ?? []).map((e) => t(`period.extra.${e}` as MessageKey))
		].join(' · ');

	function sameAsYesterday() {
		if (!offer) return;
		flow = offer.payload.flow;
		extras = offer.payload.extras ?? [];
	}
	function toggleExtra(e: PeriodExtra) {
		extras = extras.includes(e) ? extras.filter((x) => x !== e) : [...extras, e];
	}

	const valid = $derived(flow !== null && fromLocalInput(time) !== null);

	function payload(): Payload | null {
		const at = fromLocalInput(time);
		if (!at || !flow) return null;
		const p: PeriodPayload = { v: 1, type: 'period', at, flow };
		const chosen = PERIOD_EXTRAS.filter((e) => extras.includes(e));
		if (chosen.length) p.extras = chosen;
		if (note.trim()) p.note = note.trim();
		return p;
	}
</script>

<LogSheet kind="period" title={t('cat.period')} {valid} {payload} {onopen} showTime={false} bind:time>
	<label class="daychip">
		<Icon name="calendar" size={18} />
		<span>{dayText}</span>
		<Icon name="chevron-down" size={16} />
		<input
			type="date"
			aria-label={t('period.date.label')}
			value={day}
			max={todayKey()}
			onchange={(e) => setDay(e.currentTarget.value)}
		/>
	</label>

	{#if offer}
		<button type="button" class="sameyd" data-testid="period-same" onclick={sameAsYesterday}>
			<Icon name="repeat" size={20} />
			<span class="grow"><b>{t('period.sameYesterday')}</b><small>{detail(offer.payload)}</small></span>
			<Icon name="chevron-right" size={18} />
		</button>
	{/if}

	<p class="label">{t('period.flow')}<span class="hint">{t('period.pickOne')}</span></p>
	<div class="flowgrid" role="radiogroup" aria-label={t('period.flow')}>
		{#each FLOWS as f (f)}
			<button
				type="button"
				role="radio"
				aria-checked={flow === f}
				class="flowopt"
				class:on={flow === f}
				onclick={() => (flow = f)}
			>
				<span class="fdot" aria-hidden="true"
					><i
						class:ring={f === 'spotting'}
						style:width="{[8, 10, 16, 21][flowSize(f) - 1]}px"
						style:height="{[8, 10, 16, 21][flowSize(f) - 1]}px"
					></i></span
				>
				{flowText(f)}
			</button>
		{/each}
	</div>

	<p class="label">{t('period.other')}<span class="hint">{t('common.optional')}</span></p>
	<div class="chip-row">
		{#each PERIOD_EXTRAS as e (e)}
			<button
				type="button"
				class="pchip"
				class:on={extras.includes(e)}
				aria-pressed={extras.includes(e)}
				onclick={() => toggleExtra(e)}
			>
				{#if extras.includes(e)}<Icon name="check" size={16} />{/if}
				{t(`period.extra.${e}` as MessageKey)}
			</button>
		{/each}
	</div>
	<p class="small muted">{t('period.otherHint')}</p>

	<p class="label">{t('common.note')}<span class="hint">{t('common.optional')}</span></p>
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
	.daychip {
		position: relative;
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 12px;
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
	}
	/* The native date field sits invisibly over the chip, so a tap opens the phone's own date picker. */
	.daychip input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	.sameyd {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 52px;
		padding: 0 14px;
		border-radius: var(--r-md);
		background: var(--surface-2);
		text-align: left;
	}
	.grow {
		flex: 1;
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.grow b {
		font-weight: var(--fw-semibold);
	}
	.grow small {
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.flowgrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.flowopt {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		padding: 0 14px;
		border-radius: var(--r-md);
		background: var(--surface-2);
		font-weight: var(--fw-medium);
		border: 1.5px solid transparent;
		text-align: left;
	}
	.flowopt.on {
		background: var(--period-tint);
		color: var(--period-ink);
		border-color: var(--period-mark);
		font-weight: var(--fw-semibold);
	}
	.fdot {
		width: 24px;
		display: grid;
		place-items: center;
		flex: none;
	}
	.fdot i {
		display: block;
		border-radius: 50%;
		background: var(--period-mark);
	}
	.fdot i.ring {
		background: none;
		box-shadow: inset 0 0 0 2px var(--period-mark);
	}
	.pchip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
		border: 1.5px solid transparent;
	}
	.pchip.on {
		background: var(--period-tint);
		color: var(--period-ink);
		border-color: var(--period-mark);
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
