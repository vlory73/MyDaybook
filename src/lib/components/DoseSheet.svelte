<script lang="ts">
	import { untrack } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Segmented from './Segmented.svelte';
	import Sheet from './Sheet.svelte';
	import { showToast } from './toast.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { defaultAt } from '$lib/meds/due';
	import { closeEditors, editor } from '$lib/records/editor.svelte';
	import { remove, save, store } from '$lib/records/store.svelte';
	import { formatAt, fromLocalInput, toLocalInput, todayKey } from '$lib/records/time';
	import type { DosePayload, DoseStatus } from '$lib/records/types';

	/**
	 * Logs, changes or clears one dose. A scheduled dose is Taken, Skipped or Taken late (late = the person picks the
	 * time it was really taken, default now); an as-needed dose has an optional amount and a time. The amount of a
	 * scheduled dose is copied from the medication's time row, never computed.
	 */
	let status = $state<DoseStatus>('taken');
	let time = $state('');
	let amount = $state('');
	let busy = $state(false);
	let failed = $state<'save' | 'delete' | null>(null);
	let existing = $state.raw<DosePayload | null>(null);

	const target = $derived(editor.dose);
	const slot = $derived(target?.slot);
	const id = $derived(target?.id ?? null);
	const medication = $derived.by(() => {
		const p = target ? store.items[target.medicationId]?.payload : undefined;
		return p?.type === 'medication' ? p : null;
	});
	const name = $derived(medication?.name ?? t('cat.meds'));

	$effect(() => {
		const current = editor.dose;
		if (!current) return;
		untrack(() => {
			const p = current.id ? store.items[current.id]?.payload : undefined;
			existing = p?.type === 'dose' ? p : null;
			status = existing?.status ?? 'taken';
			time = toLocalInput(existing?.at ?? formatAt(new Date()));
			amount = existing?.amount ?? '';
			busy = false;
			failed = null;
		});
	});

	const options = $derived<{ value: DoseStatus; label: string }[]>([
		{ value: 'taken', label: t('dose.taken') },
		{ value: 'skipped', label: t('dose.skipped') },
		{ value: 'late', label: t('dose.late') }
	]);

	const showTime = $derived(!slot || status === 'late');
	const valid = $derived(!showTime || fromLocalInput(time) !== null);

	function payload(): DosePayload | null {
		const current = target;
		if (!current || !valid) return null;
		const picked = fromLocalInput(time);
		let at: string;
		let st: DoseStatus = 'taken';
		if (slot) {
			st = status;
			const now = new Date();
			at =
				st === 'late'
					? picked!
					: existing && existing.status !== 'late'
						? existing.at
						: defaultAt(slot, now, todayKey(now));
		} else {
			at = picked!;
		}
		const p: DosePayload = { v: 1, type: 'dose', at, medicationId: current.medicationId, status: st };
		if (slot) p.slot = slot;
		// Copied from the medication's time row (or typed for an as-needed dose); never calculated.
		const text = slot
			? existing
				? existing.amount
				: medication?.times.find((x) => x.time === slot.time)?.amount
			: amount.trim();
		if (text) p.amount = text.slice(0, 100);
		if (existing?.note) p.note = existing.note;
		if (existing?.attachments?.length) p.attachments = existing.attachments;
		return p;
	}

	async function onSave() {
		const p = payload();
		if (!p || busy) return;
		busy = true;
		failed = null;
		try {
			await save(p, id ?? undefined);
			closeEditors();
			showToast(t('entry.saved'));
		} catch {
			failed = 'save';
		} finally {
			busy = false;
		}
	}

	async function onClear() {
		if (!id || busy) return;
		busy = true;
		failed = null;
		try {
			const undo = await remove(id);
			closeEditors();
			showToast(t('dose.toast.cleared'), () => {
				undo().then(
					() => showToast(t('entry.restored')),
					() => showToast(t('entry.error.save'))
				);
			});
		} catch {
			failed = 'delete';
		} finally {
			busy = false;
		}
	}
</script>

<Sheet
	bind:open={() => target !== null, (v) => !v && closeEditors()}
	title={slot || id ? name : t('dose.sheet.asNeeded')}
>
	<div class="form">
		{#if !slot && !id}
			<p class="who">{name}</p>
		{:else if slot}
			<p class="muted planned">{t('dose.planned', { time: slot.time })}</p>
		{/if}

		{#if slot}
			<p class="label">{t('dose.status')}</p>
			<Segmented {options} bind:value={status} label={t('dose.status')} />
		{:else}
			<label class="label" for="dose-amount"
				>{t('dose.amount')}<span class="hint">{t('common.optional')}</span></label
			>
			<input
				id="dose-amount"
				class="field"
				maxlength="100"
				autocomplete="off"
				placeholder={t('dose.amount.placeholder')}
				bind:value={amount}
			/>
		{/if}

		{#if showTime}
			<p class="label">{slot ? t('dose.lateTime') : t('entry.time')}</p>
			<label class="time-chip">
				<Icon name="clock" size={18} />
				<input
					type="datetime-local"
					aria-label={slot ? t('dose.lateTime') : t('entry.time')}
					bind:value={time}
				/>
			</label>
		{/if}

		<p class="muted small exact">{t('meds.exact')}</p>
		{#if failed}
			<Notice tone="error">{failed === 'save' ? t('entry.error.save') : t('entry.error.delete')}</Notice>
		{/if}
		<div class="actions">
			{#if id}
				<Button variant="quiet" disabled={busy} onclick={onClear}>{t('dose.clear')}</Button>
			{/if}
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
	.who {
		font-weight: var(--fw-semibold);
		overflow-wrap: anywhere;
	}
	.planned {
		font-size: var(--fs-callout);
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
	.exact {
		margin-top: var(--sp-1);
	}
	.actions {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-top: var(--sp-2);
	}
	.actions :global(.btn:last-child) {
		margin-left: auto;
	}
</style>
