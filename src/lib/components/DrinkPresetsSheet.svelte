<script lang="ts">
	import { untrack } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Sheet from './Sheet.svelte';
	import { showToast } from './toast.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import {
		clToMl,
		draftOf,
		draftProblem,
		findPresets,
		moveItem,
		presetsFromDraft,
		resolvePresets,
		type DraftDrink,
		type DraftSize
	} from '$lib/records/drinks';
	import { drinkName } from '$lib/records/format';
	import { allRecords, save } from '$lib/records/store.svelte';

	/**
	 * Edit mode for the drink choices: add, rename, hide and reorder drinks, set each drink's usual size, and
	 * add, rename, change or hide sizes. Works on a draft; nothing is stored until Save, and only as ONE record.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	let drinks = $state<DraftDrink[]>([]);
	let sizes = $state<DraftSize[]>([]);
	/** Names as they were when the sheet opened, so that the field labels stay put while typing. */
	let names = $state<Record<string, string>>({});
	let newDrink = $state('');
	let newSizeName = $state('');
	let newSizeCl = $state('');
	let busy = $state(false);
	let failed = $state(false);

	const record = $derived(findPresets(allRecords()));

	$effect(() => {
		if (!open) return;
		untrack(() => {
			const draft = draftOf(resolvePresets(record?.payload, drinkName));
			drinks = draft.drinks;
			sizes = draft.sizes;
			names = Object.fromEntries([...draft.drinks, ...draft.sizes].map((x) => [x.id, x.name]));
			newDrink = '';
			newSizeName = '';
			newSizeCl = '';
			busy = false;
			failed = false;
		});
	});

	const problem = $derived(draftProblem(drinks, sizes));
	const nameOf = (id: string) => names[id] ?? '';

	function addDrink() {
		const name = newDrink.trim().slice(0, 40);
		if (!name) return;
		const usual = sizes.find((s) => !s.hidden && s.id === 'glass') ?? sizes.find((s) => !s.hidden);
		const id = crypto.randomUUID();
		names[id] = t('drink.edit.newDrink');
		drinks = [...drinks, { id, isDefault: false, name, hidden: false, sizeId: usual?.id ?? '' }];
		newDrink = '';
	}

	function addSize() {
		const name = newSizeName.trim().slice(0, 40);
		if (!name || clToMl(newSizeCl) === null) return;
		const id = crypto.randomUUID();
		names[id] = t('drink.edit.newSize');
		sizes = [...sizes, { id, isDefault: false, name, cl: newSizeCl.trim(), hidden: false }];
		newSizeName = '';
		newSizeCl = '';
	}

	/** Deleting a size also takes it off any drink that used it as its usual size. */
	function removeSize(id: string) {
		sizes = sizes.filter((s) => s.id !== id);
		drinks = drinks.map((d) => (d.sizeId === id ? { ...d, sizeId: '' } : d));
	}

	const sizeOptions = $derived(sizes.filter((s) => !s.hidden));

	async function onSave() {
		const next = presetsFromDraft(drinks, sizes, drinkName);
		if (!next || busy) return;
		busy = true;
		failed = false;
		try {
			await save(next, record?.id);
			open = false;
			showToast(t('drink.edit.saved'));
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open title={t('drink.edit.title')}>
	<div class="form">
		<p class="muted small">{t('drink.edit.hint')}</p>

		<h3 class="label">{t('drink.edit.drinks')}</h3>
		<ul class="rows">
			{#each drinks as d, i (d.id)}
				{@const label = nameOf(d.id)}
				<li class="row" class:off={d.hidden}>
					<input
						class="field"
						aria-label={t('drink.edit.nameOf', { name: label })}
						maxlength="40"
						bind:value={d.name}
					/>
					<select
						class="field usual"
						aria-label={t('drink.edit.usualOf', { name: label })}
						bind:value={d.sizeId}
					>
						{#if d.sizeId === '' || !sizeOptions.some((s) => s.id === d.sizeId)}
							<option value={d.sizeId}>–</option>
						{/if}
						{#each sizeOptions as s (s.id)}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
					<div class="tools">
						<button
							type="button"
							class="icon"
							aria-label={t('drink.edit.up', { name: label })}
							disabled={i === 0}
							onclick={() => (drinks = moveItem(drinks, i, -1))}
							><span class="up"><Icon name="chevron-down" size={20} /></span></button
						>
						<button
							type="button"
							class="icon"
							aria-label={t('drink.edit.down', { name: label })}
							disabled={i === drinks.length - 1}
							onclick={() => (drinks = moveItem(drinks, i, 1))}><Icon name="chevron-down" size={20} /></button
						>
						{#if d.isDefault}
							<button
								type="button"
								class="text"
								aria-label={t(d.hidden ? 'drink.edit.show' : 'drink.edit.hide', { name: label })}
								onclick={() => (d.hidden = !d.hidden)}
								>{t(d.hidden ? 'drink.edit.showBtn' : 'drink.edit.hideBtn')}</button
							>
						{:else}
							<button
								type="button"
								class="text"
								aria-label={t('drink.edit.remove', { name: label })}
								onclick={() => (drinks = drinks.filter((x) => x.id !== d.id))}>{t('common.delete')}</button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
		<form
			class="add"
			onsubmit={(e) => {
				e.preventDefault();
				addDrink();
			}}
		>
			<input
				class="field"
				aria-label={t('drink.edit.addDrink')}
				placeholder={t('drink.edit.addDrink')}
				maxlength="40"
				bind:value={newDrink}
			/>
			<button type="submit" class="go" disabled={newDrink.trim() === ''}
				><Icon name="plus" size={18} />{t('common.add')}</button
			>
		</form>

		<h3 class="label">{t('drink.edit.sizes')}</h3>
		<ul class="rows">
			{#each sizes as s (s.id)}
				{@const label = nameOf(s.id)}
				<li class="row" class:off={s.hidden}>
					<input
						class="field"
						aria-label={t('drink.edit.nameOf', { name: label })}
						maxlength="40"
						bind:value={s.name}
					/>
					<span class="cl-wrap">
						<input
							class="field cl"
							inputmode="decimal"
							autocomplete="off"
							aria-label={t('drink.edit.clOf', { name: label })}
							aria-invalid={clToMl(s.cl) === null}
							maxlength="5"
							bind:value={s.cl}
						/>
						<span class="unit">{t('drink.edit.cl')}</span>
					</span>
					<div class="tools">
						{#if s.isDefault}
							<button
								type="button"
								class="text"
								aria-label={t(s.hidden ? 'drink.edit.show' : 'drink.edit.hide', { name: label })}
								onclick={() => (s.hidden = !s.hidden)}
								>{t(s.hidden ? 'drink.edit.showBtn' : 'drink.edit.hideBtn')}</button
							>
						{:else}
							<button
								type="button"
								class="text"
								aria-label={t('drink.edit.remove', { name: label })}
								onclick={() => removeSize(s.id)}>{t('common.delete')}</button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
		<form
			class="add"
			onsubmit={(e) => {
				e.preventDefault();
				addSize();
			}}
		>
			<input
				class="field"
				aria-label={t('drink.edit.addSize')}
				placeholder={t('drink.edit.addSize')}
				maxlength="40"
				bind:value={newSizeName}
			/>
			<span class="cl-wrap">
				<input
					class="field cl"
					inputmode="decimal"
					autocomplete="off"
					aria-label={t('drink.edit.cl')}
					placeholder={t('drink.edit.cl')}
					maxlength="5"
					bind:value={newSizeCl}
				/>
			</span>
			<button type="submit" class="go" disabled={newSizeName.trim() === '' || clToMl(newSizeCl) === null}
				><Icon name="plus" size={18} />{t('common.add')}</button
			>
		</form>

		{#if problem !== null}
			<Notice tone="warn">{t('drink.edit.invalid')}</Notice>
		{:else if failed}
			<Notice tone="error">{t('entry.error.save')}</Notice>
		{/if}
		<div class="actions">
			<Button variant="quiet" disabled={busy} onclick={() => (open = false)}>{t('common.cancel')}</Button>
			<Button disabled={problem !== null || busy} onclick={onSave}>{t('common.save')}</Button>
		</div>
	</div>
</Sheet>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.label {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin-top: var(--sp-2);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		padding-bottom: var(--sp-3);
		border-bottom: 1px solid var(--surface-3);
	}
	.row.off .field {
		opacity: 0.55;
	}
	.field {
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
		min-width: 0;
	}
	.row > .field:first-child,
	.add > .field:first-child {
		flex: 1 1 140px;
	}
	.field:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.field[aria-invalid='true'] {
		border-color: var(--danger, currentColor);
	}
	.usual {
		flex: 0 1 130px;
	}
	.cl-wrap {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.cl {
		width: 76px;
		text-align: right;
	}
	.unit {
		color: var(--text-2);
		font-size: var(--fs-callout);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		margin-left: auto;
	}
	.icon {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		color: var(--text-2);
	}
	.icon:disabled {
		opacity: 0.3;
	}
	.up {
		display: inline-flex;
		transform: rotate(180deg);
	}
	.text {
		min-height: 44px;
		padding: 0 var(--sp-2);
		color: var(--primary);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.add {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.go {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		background: var(--primary-soft);
		color: var(--primary-press);
		font-weight: var(--fw-semibold);
	}
	.go:disabled {
		opacity: 0.45;
	}
	.actions {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-top: var(--sp-2);
	}
</style>
