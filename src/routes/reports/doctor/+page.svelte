<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Card, Chip, Icon, Segmented, TextField } from '$lib/components';
	import { i18n, t, tn, type Locale, type MessageKey } from '$lib/i18n/index.svelte';
	import { findProfile, reportName } from '$lib/records/profile';
	import { allRecords, store } from '$lib/records/store.svelte';
	import { todayKey } from '$lib/records/time';
	import {
		DOCTOR_SECTIONS,
		doctorOverview,
		resolveInclude,
		type DoctorSection,
		type Include
	} from '$lib/reports/doctor';
	import { periodLabel } from '$lib/reports/headache';
	import { getDoctorRequest, setDoctorRequest } from '$lib/reports/state';
	import { session } from '$lib/session.svelte';
	import { customRange, dayRange, lastDays } from '$lib/trends/range';

	const today = todayKey();
	const PRESETS = [7, 30, 90] as const;
	const MAX_QUESTIONS = 2000;
	// Coming back from the report keeps the choices made a moment ago (they are only held in memory).
	const previous = getDoctorRequest();
	const lengthOf = (r: { from: string; to: string }) => dayRange(r.from, r.to).length;
	const preset =
		previous && previous.to === today ? PRESETS.find((n) => n === lengthOf(previous)) : undefined;
	let period = $state<string>(previous ? String(preset ?? 'custom') : '30');
	let from = $state(previous?.from ?? lastDays(30, today)[0]!);
	let to = $state(previous?.to ?? today);
	let language = $state<Locale>(previous?.locale ?? i18n.locale);
	let touched = $state<Partial<Include>>({ ...previous?.touched });
	let questions = $state(previous?.questions ?? '');

	// What the app already knows about the account; editable, optional, and never saved or sent anywhere.
	const knownName = $derived(
		reportName(findProfile(allRecords())?.payload, session.identity?.username ?? '')
	);
	let typedName = $state<string | undefined>(previous?.name);
	const name = {
		get value() {
			return typedName ?? knownName;
		},
		set value(v: string) {
			typedName = v;
		}
	};

	const custom = $derived(period === 'custom' ? customRange(from, to) : null);
	const days = $derived<string[]>(custom ? (custom.ok ? custom.days : []) : lastDays(Number(period), today));
	const hint = $derived(days.length > 0 ? periodLabel(days[0]!, days.at(-1)!, i18n.locale) : '');

	const overview = $derived(days.length > 0 ? doctorOverview(allRecords(), days, today) : null);
	const include = $derived<Include>(
		overview
			? resolveInclude(overview, touched)
			: (Object.fromEntries(DOCTOR_SECTIONS.map((s) => [s, false])) as Include)
	);
	const ready = $derived(store.status === 'ready');

	function detail(s: DoctorSection, n: number): string {
		switch (s) {
			case 'medicines':
				return tn('reports.n.medicines', n);
			case 'pain':
			case 'measurements':
			case 'bowel':
			case 'gut':
				return tn('reports.n.entries', n);
			case 'episodes':
				return tn('reports.n.episodes', n);
			case 'headache':
			case 'fluids':
				return tn('reports.n.days', n);
			case 'feeling':
				return t('reports.n.feeling', { days: tn('reports.n.days', n) });
			case 'sleep':
				return tn('reports.n.nights', n);
			case 'notes':
				return tn('reports.n.notes', n);
			case 'headachePages':
				return t('reports.n.pages');
		}
	}

	function toggle(s: DoctorSection, on: boolean) {
		touched = { ...touched, [s]: on };
	}

	function make() {
		if (days.length === 0) return;
		setDoctorRequest({
			from: days[0]!,
			to: days.at(-1)!,
			locale: language,
			name: name.value.trim(),
			questions: questions.trim(),
			include,
			touched
		});
		void goto(resolve('/reports/doctor/print'));
	}
</script>

<div class="nav-head">
	<a class="back" href={resolve('/reports')} aria-label={t('reports.back.reports')}
		><Icon name="chevron-left" size={24} /><span>{t('reports.title')}</span></a
	>
</div>
<header class="page-head">
	<div>
		<p class="eyebrow">{t('reports.eyebrow')}</p>
		<h1 class="large-title">{t('reports.doctor.title')}</h1>
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

	<div class="gap"></div>
	<TextField
		label={t('reports.name')}
		hint={t('reports.name.hint')}
		bind:value={name.value}
		autocomplete="off"
		maxlength={80}
	/>
	<p class="note">{t('reports.only.printed')}</p>

	<div class="gap"></div>
	<div class="field">
		<label for="doctor-questions"
			>{t('reports.questions')}<span class="hint">{t('reports.questions.hint')}</span></label
		>
		<textarea
			id="doctor-questions"
			rows="4"
			maxlength={MAX_QUESTIONS}
			bind:value={questions}
			autocomplete="off"
			autocapitalize="sentences"
			spellcheck="true"
		></textarea>
	</div>
	<p class="note">{t('reports.only.printed')}</p>
</Card>

<Card>
	<div class="label first">{t('reports.include')} <span class="hint">{t('reports.include.hint')}</span></div>
	<ul class="checks" data-testid="include">
		{#each DOCTOR_SECTIONS as s (s)}
			{@const n = overview?.[s] ?? 0}
			{@const empty = ready && n === 0}
			<li class:sep={s === 'notes'}>
				<label class:off={empty}>
					<input
						type="checkbox"
						checked={include[s]}
						disabled={n === 0}
						onchange={(e) => toggle(s, e.currentTarget.checked)}
					/>
					<span class="cb" aria-hidden="true"><Icon name="check" size={16} /></span>
					<span class="grow">
						<b>{t(`reports.sec.${s}` as MessageKey)}</b>
						<small>{empty ? t('reports.nothing') : n > 0 ? detail(s, n) : ''}</small>
					</span>
				</label>
			</li>
		{/each}
	</ul>
</Card>

<p class="hint-note"><Icon name="printer" size={18} /><span>{t('reports.print.note')}</span></p>
<Button block disabled={days.length === 0} onclick={make}>{t('reports.doctor.make')}</Button>

<style>
	.nav-head {
		display: flex;
		margin-bottom: var(--sp-1);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: var(--tap);
		margin-left: calc(-1 * var(--sp-2));
		color: var(--primary);
		text-decoration: none;
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
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
	.label.first {
		margin-top: 0;
	}
	.gap {
		height: var(--sp-5);
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
	.custom input:focus-visible,
	textarea:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.problem {
		margin-top: var(--sp-2);
		color: var(--pain-ink);
		font-size: var(--fs-footnote);
	}
	.note {
		margin-top: var(--sp-2);
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.field label {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	textarea {
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
		line-height: 1.4;
		resize: vertical;
		min-height: 96px;
	}
	.checks {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.checks li {
		border-top: 1px solid var(--line);
	}
	.checks li:first-child {
		border-top: 0;
	}
	.checks li.sep {
		margin-top: var(--sp-2);
		border-top: 2px solid var(--surface-3);
	}
	.checks label {
		position: relative;
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		min-height: 52px;
		padding: 6px 0;
	}
	.checks input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.cb {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		border: 2px solid var(--text-3);
		color: transparent;
		background: var(--surface);
	}
	input:checked + .cb {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--on-primary);
	}
	input:focus-visible + .cb {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.off {
		opacity: 0.7;
	}
	.off .cb {
		border-style: dashed;
		background: var(--surface-2);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.grow b {
		display: block;
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.grow small {
		display: block;
		color: var(--text-2);
		font-size: var(--fs-footnote);
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
