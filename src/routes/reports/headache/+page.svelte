<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Card, Chip, Icon, Segmented, TextField } from '$lib/components';
	import { i18n, t, type Locale, type MessageKey } from '$lib/i18n/index.svelte';
	import { periodLabel, type ReportLayout } from '$lib/reports/headache';
	import { getReportRequest, loadLayout, saveLayout, setReportRequest } from '$lib/reports/state';
	import { findProfile, reportName } from '$lib/records/profile';
	import { allRecords } from '$lib/records/store.svelte';
	import { session } from '$lib/session.svelte';
	import { todayKey } from '$lib/records/time';
	import { customRange, dayRange, lastDays } from '$lib/trends/range';

	const today = todayKey();
	const PRESETS = [7, 14, 28] as const;
	// Coming back from the report keeps the choices made a moment ago (they are only held in memory).
	const previous = getReportRequest();
	const lengthOf = (r: { from: string; to: string }) => dayRange(r.from, r.to).length;
	const preset =
		previous && previous.to === today ? PRESETS.find((n) => n === lengthOf(previous)) : undefined;
	let period = $state<string>(previous ? String(preset ?? 'custom') : '7');
	let from = $state(previous?.from ?? lastDays(7, today)[0]!);
	let to = $state(previous?.to ?? today);
	let language = $state<Locale>(previous?.locale ?? i18n.locale);
	let layout = $state<ReportLayout>(previous?.layout ?? 'table');
	// What the app already knows about the account; editable, optional, and never saved or sent anywhere.
	const knownName = $derived(
		reportName(findProfile(allRecords())?.payload, session.identity?.username ?? '')
	);
	// Shows the saved name (or login name) until the person types; then what they typed.
	let typedName = $state<string | undefined>(previous?.name);
	const name = {
		get value() {
			return typedName ?? knownName;
		},
		set value(v: string) {
			typedName = v;
		}
	};
	let ready = $state(false);

	onMount(() => {
		if (!previous) layout = loadLayout();
		ready = true;
	});
	$effect(() => {
		if (ready) saveLayout(layout);
	});

	const custom = $derived(period === 'custom' ? customRange(from, to) : null);
	const days = $derived<string[]>(custom ? (custom.ok ? custom.days : []) : lastDays(Number(period), today));
	const hint = $derived(days.length > 0 ? periodLabel(days[0]!, days.at(-1)!, i18n.locale) : '');

	function make() {
		if (days.length === 0) return;
		setReportRequest({ from: days[0]!, to: days.at(-1)!, locale: language, layout, name: name.value.trim() });
		void goto(resolve('/reports/headache/print'));
	}
</script>

<div class="nav-head">
	<a class="back" href={resolve('/trends')} aria-label={t('reports.back')}
		><Icon name="chevron-left" size={24} /></a
	>
</div>
<header class="page-head">
	<div>
		<p class="eyebrow">{t('reports.eyebrow')}</p>
		<h1 class="large-title">{t('rep.title')}</h1>
	</div>
</header>

<Card>
	<div class="label first">{t('reports.period')} <span class="hint">{hint}</span></div>
	<div class="chips" role="group" aria-label={t('reports.period')}>
		{#each PRESETS as n (n)}
			<Chip selected={period === String(n)} onclick={() => (period = String(n))}
				>{t(`reports.period.${n}` as MessageKey)}</Chip
			>
		{/each}
		<Chip selected={period === 'custom'} onclick={() => (period = 'custom')}
			>{t('reports.period.custom')}</Chip
		>
	</div>
	{#if period === 'custom'}
		<div class="custom">
			<label>
				<span>{t('trends.custom.from')}</span>
				<input type="date" bind:value={from} max={to || undefined} />
			</label>
			<label>
				<span>{t('trends.custom.to')}</span>
				<input type="date" bind:value={to} min={from || undefined} />
			</label>
		</div>
		{#if custom && !custom.ok}
			<p class="problem" role="alert">{t(`trends.custom.${custom.problem}` as MessageKey)}</p>
		{/if}
	{/if}

	<div class="label">{t('reports.language')} <span class="hint">{t('reports.language.hint')}</span></div>
	<Segmented
		label={t('reports.language')}
		options={[
			{ value: 'da', label: 'Dansk' },
			{ value: 'en', label: 'English' }
		]}
		bind:value={language}
	/>

	<div class="label">{t('reports.layout')} <span class="hint">{t('reports.layout.hint')}</span></div>
	<div class="lay" role="radiogroup" aria-label={t('reports.layout')}>
		{#each ['table', 'form'] as const as option (option)}
			<button
				type="button"
				role="radio"
				aria-checked={layout === option}
				class:on={layout === option}
				onclick={() => (layout = option)}
			>
				<span class="thumb" aria-hidden="true"
					><span class={['pg', option === 'table' ? 'ls' : 'pt']}></span></span
				>
				<b>{t(`reports.layout.${option}` as MessageKey)}</b>
				<small>{t(`reports.layout.${option}.sub` as MessageKey)}</small>
			</button>
		{/each}
	</div>

	<div class="gap"></div>
	<TextField
		label={t('reports.name')}
		hint={t('reports.name.hint')}
		bind:value={name.value}
		autocomplete="off"
		maxlength={80}
	/>
	<p class="note small muted">{t('reports.name.note')}</p>
</Card>

<p class="hint-note"><Icon name="printer" size={18} /><span>{t('reports.print.note')}</span></p>
<Button block disabled={days.length === 0} onclick={make}>{t('reports.make')}</Button>

<style>
	.nav-head {
		display: flex;
		margin-bottom: var(--sp-1);
	}
	.back {
		display: inline-grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		margin-left: calc(-1 * var(--sp-2));
		color: var(--text);
	}
	.label {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		margin: var(--sp-5) 0 var(--sp-2);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.gap {
		height: var(--sp-5);
	}
	.label.first {
		margin-top: 0;
	}
	.hint {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.custom {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.custom label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		min-width: 0;
	}
	.custom input {
		min-height: 44px;
		min-width: 0;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-callout);
	}
	.custom input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.problem {
		margin-top: var(--sp-2);
		color: var(--pain-ink);
		font-size: var(--fs-footnote);
	}
	.lay {
		display: grid;
		gap: var(--sp-2);
	}
	.lay button {
		display: grid;
		grid-template-columns: 72px 1fr;
		column-gap: var(--sp-3);
		align-items: center;
		padding: 6px var(--sp-3);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1.5px solid transparent;
		color: var(--text);
		text-align: left;
	}
	.lay button.on {
		background: var(--primary-soft);
		border-color: var(--primary);
	}
	.lay b {
		align-self: end;
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
	.lay button.on b {
		color: var(--primary-press);
	}
	.lay small {
		align-self: start;
		font-size: var(--fs-footnote);
		color: var(--text-2);
		line-height: 1.25;
	}
	.thumb {
		grid-row: 1 / 3;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/* Tiny page drawings: a header band, a label column and a grid of cells. */
	.pg {
		display: block;
		background-color: #fff;
		border: 1px solid var(--line);
		border-radius: 2px;
		box-shadow: var(--shadow-1);
		background-image:
			linear-gradient(#8d8394, #8d8394), linear-gradient(90deg, #c9c0cf 1px, transparent 1px),
			linear-gradient(#c9c0cf 1px, transparent 1px);
		background-repeat: no-repeat, repeat, repeat;
		background-position:
			3px 3px,
			3px 9px,
			3px 9px;
	}
	.pg.ls {
		width: 64px;
		height: 45px;
		background-size:
			calc(100% - 6px) 3px,
			8px 100%,
			100% 8px;
	}
	.pg.pt {
		width: 36px;
		height: 51px;
		background-size:
			calc(100% - 6px) 3px,
			7px 100%,
			100% 7px;
	}
	.note {
		margin-top: var(--sp-2);
	}
	.hint-note {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
		color: var(--text-2);
		font-size: var(--fs-footnote);
		margin: var(--sp-3) 0;
	}
</style>
