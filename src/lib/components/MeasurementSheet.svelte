<script lang="ts">
	import Button from './Button.svelte';
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import Segmented from './Segmented.svelte';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import {
		BUILT_IN_CONTEXT,
		WEIGHT_ID,
		formatNumber,
		lastMeasurement,
		parseNumber,
		stepValue,
		type TypeInfo
	} from '$lib/records/log';
	import { allRecords, save } from '$lib/records/store.svelte';
	import { dayDate, dayKey, fromLocalInput } from '$lib/records/time';
	import type { MeasurementPayload, Payload } from '$lib/records/types';

	let time = $state('');
	let typeId = $state(WEIGHT_ID);
	let values = $state<string[]>(['']);
	let context = $state<string[]>([]);
	let note = $state('');
	let addingContext = $state(false);
	let freeContext = $state('');
	let creating = $state(false);
	let newName = $state('');
	let newUnit = $state('');
	let newCount = $state<'1' | '2' | '3'>('1');
	let newDecimals = $state<'0' | '1' | '2'>('1');

	const weight = $derived<TypeInfo>({
		id: WEIGHT_ID,
		name: t('cat.weight'),
		unit: 'kg',
		valueCount: 1,
		decimals: 1
	});
	const types = $derived.by(() => {
		const custom: TypeInfo[] = [];
		for (const r of allRecords()) {
			if (r.payload.type === 'measurement_type') custom.push({ id: r.id, ...r.payload });
		}
		custom.sort((a, b) => a.name.localeCompare(b.name));
		return [weight, ...custom];
	});
	const info = $derived(types.find((x) => x.id === typeId) ?? weight);
	const last = $derived(lastMeasurement(allRecords(), typeId));
	const lastText = $derived.by(() => {
		if (!last) return '';
		const value = last.values.map((v) => formatNumber(v, info.decimals)).join('/');
		const day = new Intl.DateTimeFormat(i18n.locale, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		}).format(dayDate(dayKey(last.at)));
		return t('measure.lastTime', { value: `${value} ${last.unit}`.trim(), day });
	});
	const allContext = $derived([
		...BUILT_IN_CONTEXT.map((k) => ({ key: k as string, label: t(`measure.ctx.${k}` as MessageKey) })),
		...context
			.filter((c) => !(BUILT_IN_CONTEXT as readonly string[]).includes(c))
			.map((c) => ({ key: c, label: c }))
	]);

	function defaultsFor(id: string, decimals: number, count: number): string[] {
		const prev = lastMeasurement(allRecords(), id);
		return Array.from({ length: count }, (_, i) =>
			prev?.values[i] !== undefined ? formatNumber(prev.values[i]!, decimals) : ''
		);
	}

	function selectType(id: string) {
		typeId = id;
		const x = types.find((y) => y.id === id) ?? weight;
		values = defaultsFor(id, x.decimals, x.valueCount);
	}

	function onopen(existing: Payload | null, wanted?: string) {
		const m = existing?.type === 'measurement' ? existing : null;
		context = m?.context ?? [];
		note = m?.note ?? '';
		addingContext = false;
		freeContext = '';
		creating = false;
		newName = newUnit = '';
		newCount = '1';
		newDecimals = '1';
		if (m) {
			typeId = m.typeId;
			const x = types.find((y) => y.id === m.typeId) ?? weight;
			values = m.values.map((v) => formatNumber(v, x.decimals));
		} else {
			selectType(wanted && types.some((y) => y.id === wanted) ? wanted : WEIGHT_ID);
		}
	}

	function step(i: number, direction: 1 | -1) {
		values[i] = formatNumber(
			stepValue(parseNumber(values[i] ?? ''), direction, info.decimals),
			info.decimals
		);
	}

	function toggleContext(key: string) {
		context = context.includes(key) ? context.filter((c) => c !== key) : [...context, key];
	}
	function addContext() {
		const c = freeContext.trim().slice(0, 40);
		if (c && !context.includes(c)) context = [...context, c];
		freeContext = '';
		addingContext = false;
	}

	const newValid = $derived(newName.trim() !== '' && newUnit.trim().length <= 40);
	async function createType() {
		if (!newValid) return;
		const p: Payload = {
			v: 1,
			type: 'measurement_type',
			name: newName.trim().slice(0, 100),
			unit: newUnit.trim().slice(0, 40),
			valueCount: Number(newCount),
			decimals: Number(newDecimals)
		};
		try {
			const id = await save(p);
			creating = false;
			newName = newUnit = '';
			typeId = id;
			values = Array.from({ length: p.valueCount }, () => '');
		} catch {
			// Stays open so the person can try again.
		}
	}

	const parsed = $derived(values.map(parseNumber));
	const valid = $derived(
		parsed.length === info.valueCount && parsed.every((v) => v !== null) && fromLocalInput(time) !== null
	);

	function payload(): Payload | null {
		const at = fromLocalInput(time);
		if (!at || !valid) return null;
		const p: MeasurementPayload = {
			v: 1,
			type: 'measurement',
			at,
			typeId,
			values: parsed as number[],
			unit: info.unit,
			context
		};
		if (note.trim()) p.note = note.trim();
		return p;
	}

	const countOptions = [
		{ value: '1' as const, label: '1' },
		{ value: '2' as const, label: '2' },
		{ value: '3' as const, label: '3' }
	];
	const decimalOptions = [
		{ value: '0' as const, label: '0' },
		{ value: '1' as const, label: '1' },
		{ value: '2' as const, label: '2' }
	];
</script>

<LogSheet
	kind="measurement"
	title={typeId === WEIGHT_ID ? t('cat.weight') : t('measure.title')}
	{valid}
	{payload}
	{onopen}
	bind:time
>
	<div class="chip-row" role="group" aria-label={t('measure.type')}>
		{#each types as x (x.id)}
			<Chip selected={x.id === typeId} onclick={() => selectType(x.id)}>{x.name}</Chip>
		{/each}
		<Chip onclick={() => (creating = !creating)}><Icon name="plus" size={16} />{t('measure.newType')}</Chip>
	</div>

	{#if creating}
		<form
			class="new"
			onsubmit={(e) => {
				e.preventDefault();
				void createType();
			}}
		>
			<input
				aria-label={t('measure.newType.name')}
				placeholder={t('measure.newType.name')}
				maxlength="100"
				bind:value={newName}
			/>
			<input
				aria-label={t('measure.newType.unit')}
				placeholder={t('measure.newType.unit')}
				maxlength="40"
				bind:value={newUnit}
			/>
			<p class="label">{t('measure.newType.count')}</p>
			<Segmented options={countOptions} bind:value={newCount} label={t('measure.newType.count')} />
			<p class="label">{t('measure.newType.decimals')}</p>
			<Segmented options={decimalOptions} bind:value={newDecimals} label={t('measure.newType.decimals')} />
			<Button type="submit" variant="soft" disabled={!newValid}>{t('measure.newType.add')}</Button>
		</form>
	{/if}

	{#each values.map((_, i) => i) as i (i)}
		<div class="value">
			<button type="button" class="step" aria-label={t('measure.minus')} onclick={() => step(i, -1)}
				><Icon name="minus" size={26} /></button
			>
			<div class="num">
				<input
					inputmode="decimal"
					autocomplete="off"
					aria-label={info.valueCount > 1 ? t('measure.valueN', { n: i + 1 }) : t('measure.value')}
					placeholder={formatNumber(0, info.decimals)}
					bind:value={values[i]}
				/>
				{#if i === values.length - 1 && info.unit}<small>{info.unit}</small>{/if}
			</div>
			<button type="button" class="step" aria-label={t('measure.plus')} onclick={() => step(i, 1)}
				><Icon name="plus" size={26} /></button
			>
		</div>
	{/each}
	{#if lastText}<p class="muted small center">{lastText}</p>{/if}

	<p class="label">{t('measure.when')}</p>
	<div class="chip-row">
		{#each allContext as c (c.key)}
			<Chip selected={context.includes(c.key)} onclick={() => toggleContext(c.key)}>{c.label}</Chip>
		{/each}
		<Chip onclick={() => (addingContext = !addingContext)}
			><Icon name="plus" size={16} />{t('measure.ctx.other')}</Chip
		>
	</div>
	{#if addingContext}
		<form
			class="inline"
			onsubmit={(e) => {
				e.preventDefault();
				addContext();
			}}
		>
			<input aria-label={t('measure.ctx.free')} maxlength="40" bind:value={freeContext} />
			<Button type="submit" variant="soft">{t('common.add')}</Button>
		</form>
	{/if}

	<p class="label">{t('common.note')}</p>
	<textarea
		rows="2"
		aria-label={t('common.note')}
		placeholder={t('common.optional')}
		maxlength="2000"
		bind:value={note}
	></textarea>
</LogSheet>

<style>
	.value {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.num {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 4px;
	}
	.num input {
		width: 5.2ch;
		min-width: 0;
		flex: 0 1 auto;
		border: 0;
		background: transparent;
		text-align: right;
		font-size: 3rem;
		font-weight: var(--fw-bold);
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.num input:focus-visible {
		outline: none;
		border-bottom: 2px solid var(--focus);
	}
	.num small {
		font-size: var(--fs-callout);
		color: var(--text-2);
		font-weight: var(--fw-semibold);
	}
	.step {
		width: 56px;
		height: 56px;
		flex: none;
		border-radius: var(--r-full);
		background: var(--measure-tint);
		color: var(--measure-ink);
		display: grid;
		place-items: center;
	}
	.center {
		text-align: center;
	}
	.new {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-3);
		border-radius: var(--r-lg);
		background: var(--surface-2);
	}
	.new input,
	.inline input {
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface);
	}
	.inline {
		display: flex;
		gap: var(--sp-2);
	}
	.inline input {
		flex: 1;
		background: var(--surface-2);
	}
	.new input:focus-visible,
	.inline input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
</style>
