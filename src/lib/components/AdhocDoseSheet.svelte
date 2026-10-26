<script lang="ts">
	import { untrack } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Sheet from './Sheet.svelte';
	import { showToast } from './toast.svelte';
	import Toggle from './Toggle.svelte';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { adhocMedication, findByName, medicationNames } from '$lib/meds/adhoc';
	import { closeEditors, editor } from '$lib/records/editor.svelte';
	import { allRecords, remove, save } from '$lib/records/store.svelte';
	import { savedText } from '$lib/records/syncText';
	import { dayKey, formatAt, fromLocalInput, toLocalInput } from '$lib/records/time';
	import type { DosePayload } from '$lib/records/types';

	/**
	 * Logs a dose of a medicine that is not in the list yet. A new "when needed" medication is created (archived when
	 * the person does not want to keep it), so every dose still links to a medication. A name that matches an existing
	 * medication is reused. Nothing is calculated or suggested.
	 */
	let name = $state('');
	let amount = $state('');
	let time = $state('');
	let keep = $state(true);
	let busy = $state(false);
	let failed = $state(false);

	const open = $derived(editor.adhoc);

	$effect(() => {
		if (!editor.adhoc) return;
		untrack(() => {
			name = '';
			amount = '';
			time = toLocalInput(formatAt(new Date()));
			keep = true;
			busy = false;
			failed = false;
		});
	});

	const names = $derived(open ? medicationNames(allRecords(), i18n.locale) : []);
	const match = $derived(open ? findByName(allRecords(), name) : null);
	const at = $derived(fromLocalInput(time));
	const valid = $derived(name.trim() !== '' && at !== null);

	async function onSave() {
		if (!valid || busy || !at) return;
		busy = true;
		failed = false;
		let createdId: string | null = null;
		try {
			// Look the match up again: a retry after a failed dose save finds the medication created before.
			let medicationId = findByName(allRecords(), name)?.id;
			if (!medicationId) {
				createdId = await save(adhocMedication(name, dayKey(at), keep));
				medicationId = createdId;
			}
			const p: DosePayload = { v: 1, type: 'dose', at, medicationId, status: 'taken' };
			const text = amount.trim();
			if (text) p.amount = text.slice(0, 100);
			const doseId = await save(p);
			const created = createdId;
			closeEditors();
			showToast(savedText(t('adhoc.toast'), doseId), () => {
				Promise.all([remove(doseId), ...(created ? [remove(created)] : [])]).catch(() =>
					showToast(t('entry.error.delete'))
				);
			});
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open={() => open, (v) => !v && closeEditors()} title={t('adhoc.open')}>
	<div class="form">
		<label class="label" for="adhoc-name">{t('adhoc.name')}</label>
		<input
			id="adhoc-name"
			class="field"
			maxlength="100"
			autocomplete="off"
			list="adhoc-names"
			bind:value={name}
		/>
		<datalist id="adhoc-names">
			{#each names as n (n)}<option value={n}></option>{/each}
		</datalist>

		<label class="label" for="adhoc-amount"
			>{t('dose.amount')}<span class="hint">{t('common.optional')}</span></label
		>
		<input
			id="adhoc-amount"
			class="field"
			maxlength="100"
			autocomplete="off"
			placeholder={t('dose.amount.placeholder')}
			bind:value={amount}
		/>

		<p class="label">{t('entry.time')}</p>
		<label class="time-chip">
			<Icon name="clock" size={18} />
			<input type="datetime-local" aria-label={t('entry.time')} bind:value={time} />
		</label>

		{#if match}
			<p class="muted small">
				{match.medication.archived ? t('adhoc.known.archived') : t('adhoc.known.active')}
			</p>
		{:else}
			<div class="setrow">
				<span class="grow">{t('adhoc.keep')}</span>
				<Toggle bind:checked={keep} label={t('adhoc.keep')} />
			</div>
			<p class="muted small hint-line">{t('adhoc.keep.hint')}</p>
		{/if}

		<p class="muted small exact">{t('meds.exact')}</p>
		{#if failed}
			<Notice tone="error">{t('entry.error.save')}</Notice>
		{/if}
		<div class="actions">
			<Button disabled={!valid || busy} onclick={onSave}>{t('common.save')}</Button>
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
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: var(--sp-2) 0 calc(-1 * var(--sp-1));
	}
	.label .hint {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.field {
		min-height: 48px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
		min-width: 0;
	}
	.field:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.time-chip {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 12px;
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
	}
	.time-chip input {
		border: 0;
		background: transparent;
		min-height: 32px;
		font-size: inherit;
		font-weight: inherit;
		/* No max-width: 12-hour formats need room for AM/PM (times follow the phone's setting). */
	}
	.setrow {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 48px;
		margin-top: var(--sp-2);
	}
	.grow {
		flex: 1;
	}
	.hint-line {
		margin-top: calc(-1 * var(--sp-2));
	}
	.exact {
		margin-top: var(--sp-1);
	}
	.actions {
		display: flex;
		margin-top: var(--sp-2);
	}
	.actions :global(.btn:last-child) {
		margin-left: auto;
	}
</style>
