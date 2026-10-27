<script lang="ts">
	/**
	 * The drink form: chips, sizes, amount, note. Shared by the Drink sheet (`mode="sheet"`, with "Same again" and the
	 * day total) and the drink added from the meal sheet (`mode="meal"`, which only builds a payload). The parent owns
	 * the time, the buttons and the presets sheet.
	 */
	import CategoryBadge from './CategoryBadge.svelte';
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { closeEditors } from '$lib/records/editor.svelte';
	import {
		MAX_COUNT,
		MIN_COUNT,
		clInput,
		clToMl,
		dayTotalMl,
		draftOf,
		findDrink,
		findPresets,
		findSize,
		lastDrink,
		mlToCl,
		presetsFromDraft,
		resolvePresets,
		sameAgain,
		storedLabel,
		usualSize,
		visibleDrinks,
		type ResolvedSize
	} from '$lib/records/drinks';
	import { describe, drinkName, lookups } from '$lib/records/format';
	import { quickSave } from '$lib/records/quick';
	import { allRecords, save } from '$lib/records/store.svelte';
	import { formatAt, todayKey } from '$lib/records/time';
	import type { DrinkPayload, Payload } from '$lib/records/types';

	let { mode = 'sheet', onEditPresets }: { mode?: 'sheet' | 'meal'; onEditPresets: () => void } = $props();

	/** A size an old entry used that is not in the presets any more: kept as it was logged. */
	type Snapshot = { stored: string; ml: number };

	/** Id of the chosen drink; ignored while `isOther` is on. */
	let drinkId = $state('');
	let isOther = $state(false);
	let otherName = $state('');
	/** A size id, `snapshot` or `custom` (a typed amount). */
	let sizeId = $state('');
	let customCl = $state('');
	let count = $state(1);
	let note = $state('');
	let editing = $state(false);
	let snapshot = $state<Snapshot | null>(null);

	const presetsRecord = $derived(findPresets(allRecords()));
	const presets = $derived(resolvePresets(presetsRecord?.payload, drinkName));
	const last = $derived(lastDrink(allRecords()));
	const todayMl = $derived(dayTotalMl(allRecords(), todayKey()));

	// The drink on show: the chosen one, else the first one on offer (for example after it was hidden).
	const drink = $derived(
		isOther ? undefined : (presets.drinks.find((d) => d.id === drinkId) ?? visibleDrinks(presets)[0])
	);
	const drinkChips = $derived(presets.drinks.filter((d) => !d.hidden || d.id === drink?.id));
	const sizeChoices = $derived(presets.sizes.filter((s) => !s.hidden || s.id === sizeId));
	const sizeKey = $derived(
		sizeId === 'custom' || (sizeId === 'snapshot' && snapshot)
			? sizeId
			: sizeChoices.some((s) => s.id === sizeId)
				? sizeId
				: (usualSize(presets, drink)?.id ?? 'custom')
	);
	const size = $derived<ResolvedSize | undefined>(presets.sizes.find((s) => s.id === sizeKey));
	const custom = $derived(sizeKey === 'custom');
	const customMl = $derived(clToMl(customCl, true));
	const sizeMl = $derived(custom ? customMl : sizeKey === 'snapshot' ? snapshot?.ml : size?.ml);
	const sizeStored = $derived(
		custom ? '' : sizeKey === 'snapshot' ? (snapshot?.stored ?? '') : (size?.stored ?? '')
	);
	const sizeName = $derived(storedLabel('size', sizeStored, drinkName));
	const n = $derived(custom ? 1 : count);
	const total = $derived(sizeMl === null || sizeMl === undefined ? null : sizeMl * n);

	/** An own drink typed under "Other" is kept for next time, except when an existing entry is being edited. */
	const remembers = $derived(mode === 'meal' || !editing);
	const typedName = $derived(otherName.trim());
	const drinkLabel = $derived(isOther ? typedName : (drink?.name ?? ''));
	const drinkStored = $derived.by(() => {
		if (!isOther) return drink?.stored ?? '';
		const same = findDrink(presets, typedName);
		return same ? same.stored : typedName;
	});
	const cl = (ml: number) => t('fmt.cl', { n: mlToCl(ml) });
	const summary = $derived(
		total === null
			? ''
			: custom
				? t('drink.total.custom', { drink: drinkLabel || t('drink.other'), total: cl(total) })
				: t('drink.total.sized', {
						drink: drinkLabel || t('drink.other'),
						size: sizeName,
						each: cl(sizeMl!),
						count: n,
						total: cl(total)
					})
	);
	const valid = $derived(drinkStored !== '' && total !== null && total !== undefined);

	/** "Same again": the last drink's name, size and count, as it would be logged now. */
	const againText = $derived.by(() => {
		if (!last) return '';
		const d = describe({ ...last, payload: sameAgain(last.payload, formatAt(new Date())) }, lookups);
		return `${d.title} · ${d.summary}`;
	});

	/** Fills the form: from a saved drink when editing, else the defaults. */
	export function open(existing: Payload | null) {
		const d = existing?.type === 'drink' ? existing : null;
		editing = d !== null;
		snapshot = null;
		note = d?.note ?? '';
		count = d?.count ?? MIN_COUNT;
		customCl = '';
		otherName = '';
		isOther = false;
		const first = visibleDrinks(presets)[0];
		drinkId = first?.id ?? '';
		sizeId = usualSize(presets, first)?.id ?? 'custom';
		if (!d) return;
		const found = findDrink(presets, d.drink);
		if (found) drinkId = found.id;
		else {
			isOther = true;
			otherName = storedLabel('drink', d.drink, drinkName);
		}
		if (d.size === '') {
			sizeId = 'custom';
			customCl = clInput(d.sizeMl);
			count = 1;
		} else {
			const s = findSize(presets, d.size, d.sizeMl, drinkName);
			if (s) sizeId = s.id;
			else {
				snapshot = { stored: d.size, ml: d.sizeMl };
				sizeId = 'snapshot';
			}
		}
	}

	function pickDrink(id: string) {
		drinkId = id;
		isOther = false;
		if (sizeId !== 'custom') {
			sizeId =
				usualSize(
					presets,
					presets.drinks.find((d) => d.id === id)
				)?.id ?? 'custom';
		}
	}

	function pickOther() {
		isOther = true;
		if (!sizeChoices.some((s) => s.id === sizeKey) && sizeKey !== 'custom') sizeId = 'custom';
	}

	function step(by: -1 | 1) {
		count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, count + by));
	}

	/** The drink as a record at `at`, or null when the form is not complete. */
	export function payload(at: string): DrinkPayload | null {
		if (!valid || sizeMl === null || sizeMl === undefined) return null;
		const p: DrinkPayload = {
			v: 1,
			type: 'drink',
			at,
			drink: drinkStored,
			size: sizeStored,
			sizeMl,
			count: n,
			totalMl: sizeMl * n
		};
		if (note.trim()) p.note = note.trim();
		return p;
	}

	/** A new drink typed under "Other" is kept in the presets for next time, with the size just chosen as its usual. */
	export async function rememberOther() {
		if (!isOther || !remembers || typedName === '' || findDrink(presets, typedName)) return;
		const draft = draftOf(presets);
		draft.drinks.push({
			id: crypto.randomUUID(),
			isDefault: false,
			name: typedName.slice(0, 40),
			hidden: false,
			sizeId: size && !custom ? size.id : (usualSize(presets, undefined)?.id ?? '')
		});
		const next = presetsFromDraft(draft.drinks, draft.sizes, drinkName);
		if (next) await save(next, presetsRecord?.id);
	}

	export const isValid = () => valid;
	export const isEditing = () => editing;

	function again() {
		if (!last) return;
		closeEditors();
		void quickSave(sameAgain(last.payload, formatAt(new Date())), 'entry.saved');
	}
</script>

{#if mode === 'sheet' && !editing && last}
	<button type="button" class="again" onclick={again}>
		<CategoryBadge category="drink" size={32} />
		<span><b>{t('drink.again')}</b> <span class="muted">{againText}</span></span>
	</button>
{/if}

<p class="label">
	{t('drink.which')}
	<button type="button" class="link" onclick={onEditPresets}>{t('drink.edit')}</button>
</p>
<div class="chip-row" role="group" aria-label={t('drink.which')}>
	{#each drinkChips as d (d.id)}
		<Chip selected={!isOther && drink?.id === d.id} onclick={() => pickDrink(d.id)}>{d.name}</Chip>
	{/each}
	<Chip selected={isOther} onclick={pickOther}>{t('drink.other')}</Chip>
</div>
{#if isOther}
	<input
		class="field"
		aria-label={t('drink.other.name')}
		placeholder={t('drink.other.name')}
		maxlength="40"
		bind:value={otherName}
	/>
	{#if remembers}<p class="hint-line">{t('drink.other.hint')}</p>{/if}
{/if}

<p class="label">{t('drink.size.label')}</p>
<div class="chip-row" role="group" aria-label={t('drink.size.label')}>
	{#each sizeChoices as s (s.id)}
		<Chip selected={sizeKey === s.id} onclick={() => (sizeId = s.id)}>
			{s.name}<span class="cl">{cl(s.ml)}</span>
		</Chip>
	{/each}
	{#if snapshot}
		<Chip selected={sizeKey === 'snapshot'} onclick={() => (sizeId = 'snapshot')}>
			{storedLabel('size', snapshot.stored, drinkName)}<span class="cl">{cl(snapshot.ml)}</span>
		</Chip>
	{/if}
	<Chip selected={custom} onclick={() => (sizeId = 'custom')}>{t('drink.size.custom')}</Chip>
</div>

{#if custom}
	<label class="amount">
		<span class="label-text">{t('drink.amount')}<span class="hint">{t('drink.amount.hint')}</span></span>
		<input
			class="field"
			inputmode="numeric"
			autocomplete="off"
			aria-label={t('drink.amount')}
			maxlength="3"
			bind:value={customCl}
		/>
	</label>
{:else}
	<div class="count">
		<span class="label-text">{t('drink.count')}</span>
		<div class="stepper" role="group" aria-label={t('drink.count')}>
			<button
				type="button"
				aria-label={t('drink.count.less')}
				disabled={count <= MIN_COUNT}
				onclick={() => step(-1)}><Icon name="minus" size={20} /></button
			>
			<output aria-label={t('drink.count')}>{count}</output>
			<button
				type="button"
				aria-label={t('drink.count.more')}
				disabled={count >= MAX_COUNT}
				onclick={() => step(1)}><Icon name="plus" size={20} /></button
			>
		</div>
	</div>
{/if}

<p class="sum" data-testid="drink-total" aria-live="polite">{summary || ' '}</p>

<p class="label">{t('common.note')}<span class="hint">{t('common.optional')}</span></p>
<textarea
	rows="2"
	aria-label={t('common.note')}
	placeholder={t('common.optional')}
	maxlength="2000"
	bind:value={note}
></textarea>

{#if mode === 'sheet' && !editing && todayMl > 0}
	<p class="day">{t('drink.day.today', { total: cl(todayMl) })}</p>
{/if}
<p class="foot"><Icon name="lock" size={18} />{t('drink.private')}</p>

<style>
	.again {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		min-height: 52px;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--r-md);
		background: var(--drink-tint);
		color: var(--drink-ink);
		text-align: left;
	}
	.again :global(.badge) {
		background: transparent;
	}
	.again .muted {
		color: inherit;
		opacity: 0.85;
	}
	.link {
		color: var(--primary);
		font-weight: var(--fw-semibold);
		text-decoration: underline;
		min-height: 24px;
	}
	.field {
		width: 100%;
		min-height: 48px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
	}
	.field:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.hint-line {
		font-size: var(--fs-footnote);
		color: var(--text-3);
		margin-top: calc(-1 * var(--sp-1));
	}
	.cl {
		font-size: var(--fs-footnote);
		color: var(--text-2);
		font-weight: var(--fw-regular);
	}
	.amount {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.label-text {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.label-text .hint {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.count {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		background: var(--surface-2);
		border-radius: var(--r-full);
	}
	.stepper button {
		width: 48px;
		height: 48px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		color: var(--drink-ink);
	}
	.stepper button:disabled {
		opacity: 0.35;
	}
	.stepper output {
		min-width: 36px;
		text-align: center;
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
		font-variant-numeric: tabular-nums;
	}
	.sum {
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-md);
		background: var(--drink-tint);
		color: var(--drink-ink);
		font-weight: var(--fw-semibold);
		overflow-wrap: anywhere;
	}
	.day {
		color: var(--text-2);
		font-size: var(--fs-callout);
		text-align: center;
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
