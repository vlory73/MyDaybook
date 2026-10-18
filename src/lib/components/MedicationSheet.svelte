<script lang="ts">
	import { untrack } from 'svelte';
	import Button from './Button.svelte';
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Segmented from './Segmented.svelte';
	import Sheet from './Sheet.svelte';
	import { showToast } from './toast.svelte';
	import Toggle from './Toggle.svelte';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { WEEK_ORDER, weekdayName } from '$lib/meds/schedule';
	import { parseNumber } from '$lib/records/log';
	import { closeEditors, editor } from '$lib/records/editor.svelte';
	import { remove, save, store } from '$lib/records/store.svelte';
	import { todayKey } from '$lib/records/time';
	import {
		MAX_MED_TIMES,
		MED_FORMS,
		MED_UNITS,
		type MedForm,
		type MedicationPayload,
		type MedSchedule,
		type MedTime
	} from '$lib/records/types';

	type Often = 'daily' | 'weekdays' | 'every_n_days' | 'as_needed';
	type Row = { key: number; time: string; amount: string };

	let name = $state('');
	let strength = $state('');
	let unitChoice = $state<string>('mg');
	let unitCustom = $state('');
	let form = $state<MedForm>('tablet');
	let often = $state<Often>('daily');
	let days = $state<number[]>([]);
	let n = $state(2);
	let rows = $state<Row[]>([]);
	let start = $state('');
	let hasEnd = $state(false);
	let end = $state('');
	let reminders = $state(false);
	let note = $state('');
	let busy = $state(false);
	let failed = $state<'save' | 'delete' | null>(null);
	let keep = $state.raw<MedicationPayload | null>(null);
	let nextKey = 0;

	const id = $derived(editor.med?.id ?? null);
	const isNew = $derived(id === null);

	const newRow = (time = '08:00', amount = ''): Row => ({ key: nextKey++, time, amount });

	// Fill the form whenever the sheet opens (new: sensible defaults; existing: its saved values).
	$effect(() => {
		const target = editor.med;
		if (!target) return;
		untrack(() => {
			const existing = target.id ? store.items[target.id]?.payload : undefined;
			const m = existing?.type === 'medication' ? existing : null;
			keep = m;
			name = m?.name ?? '';
			strength = m?.strength !== undefined ? String(m.strength) : '';
			const unit = m?.unit ?? '';
			if (!unit) {
				unitChoice = 'mg';
				unitCustom = '';
			} else if ((MED_UNITS as readonly string[]).includes(unit)) {
				unitChoice = unit;
				unitCustom = '';
			} else {
				unitChoice = 'other';
				unitCustom = unit;
			}
			form = m?.form ?? 'tablet';
			often = m?.schedule.kind ?? 'daily';
			days = m?.schedule.kind === 'weekdays' ? [...m.schedule.days] : [];
			n = m?.schedule.kind === 'every_n_days' ? m.schedule.n : 2;
			rows = m && m.times.length > 0 ? m.times.map((x) => newRow(x.time, x.amount)) : [newRow()];
			start = m?.start ?? todayKey();
			hasEnd = m?.end !== undefined;
			end = m?.end ?? '';
			reminders = m?.reminders ?? false;
			note = m?.note ?? '';
			busy = false;
			failed = null;
		});
	});

	const oftenOptions = $derived<{ value: Often; label: string }[]>([
		{ value: 'daily', label: t('meds.often.daily') },
		{ value: 'weekdays', label: t('meds.often.weekdays') },
		{ value: 'every_n_days', label: t('meds.often.everyN') },
		{ value: 'as_needed', label: t('meds.often.asNeeded') }
	]);

	const strengthValue = $derived(strength.trim() === '' ? undefined : parseNumber(strength));
	const unit = $derived(unitChoice === 'other' ? unitCustom.trim() : unitChoice);
	const datesOk = $derived(!hasEnd || (end !== '' && end >= start));
	const timesOk = $derived(
		often === 'as_needed' || (rows.length >= 1 && rows.every((r) => /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)))
	);
	// One dose per medication, day and time: the same time twice would be one slot, so it is refused here.
	const duplicateTimes = $derived(
		often === 'as_needed'
			? new Set<string>()
			: new Set(rows.map((r) => r.time).filter((time, i, all) => time !== '' && all.indexOf(time) !== i))
	);
	const valid = $derived(
		name.trim() !== '' &&
			strengthValue !== null &&
			(strengthValue === undefined || unit.length <= 40) &&
			(often !== 'weekdays' || days.length > 0) &&
			timesOk &&
			duplicateTimes.size === 0 &&
			/^\d{4}-\d{2}-\d{2}$/.test(start) &&
			datesOk
	);

	function schedule(): MedSchedule {
		if (often === 'weekdays') return { kind: 'weekdays', days: [...days].sort((a, b) => a - b) };
		if (often === 'every_n_days') {
			const prev = keep?.schedule;
			return { kind: 'every_n_days', n, from: prev?.kind === 'every_n_days' ? prev.from : start };
		}
		return { kind: often };
	}

	function payload(archived: boolean): MedicationPayload | null {
		if (!valid) return null;
		const times: MedTime[] =
			often === 'as_needed' ? [] : rows.map((r) => ({ time: r.time, amount: r.amount.trim() }));
		const p: MedicationPayload = {
			v: 1,
			type: 'medication',
			name: name.trim().slice(0, 100),
			form,
			schedule: schedule(),
			times,
			start,
			reminders,
			archived
		};
		if (strengthValue !== undefined && strengthValue !== null) {
			p.strength = strengthValue;
			if (unit) p.unit = unit;
		}
		if (hasEnd) p.end = end;
		if (note.trim()) p.note = note.trim();
		if (keep?.attachments?.length) p.attachments = keep.attachments;
		return p;
	}

	function toggleDay(d: number) {
		days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
	}
	function addRow() {
		if (rows.length >= MAX_MED_TIMES) return;
		rows.push(newRow('12:00'));
	}
	function removeRow(key: number) {
		if (rows.length > 1) rows = rows.filter((r) => r.key !== key);
	}

	async function run(action: () => Promise<void>, error: 'save' | 'delete') {
		if (busy) return;
		busy = true;
		failed = null;
		try {
			await action();
		} catch {
			failed = error;
		} finally {
			busy = false;
		}
	}

	const onSave = () =>
		run(async () => {
			const p = payload(keep?.archived ?? false);
			if (!p) return;
			await save(p, id ?? undefined);
			closeEditors();
			showToast(t('entry.saved'));
		}, 'save');

	/** Archives or restores the saved medication as it was last saved (unsaved edits in the form are not used). */
	const onArchive = () =>
		run(async () => {
			if (!keep || !id) return;
			const previous = keep;
			const next = { ...previous, archived: !previous.archived };
			await save(next, id);
			closeEditors();
			showToast(t(next.archived ? 'meds.archivedToast' : 'meds.unarchivedToast'), () => {
				save(previous, id).catch(() => showToast(t('entry.error.save')));
			});
		}, 'save');

	const onDelete = () =>
		run(async () => {
			if (!id) return;
			const undo = await remove(id);
			closeEditors();
			showToast(t('meds.deleted'), () => {
				undo().then(
					() => showToast(t('meds.restored')),
					() => showToast(t('entry.error.save'))
				);
			});
		}, 'delete');
</script>

<Sheet
	bind:open={() => editor.med !== null, (v) => !v && closeEditors()}
	title={isNew ? t('meds.sheet.new') : t('meds.sheet.edit')}
>
	<div class="form">
		<label class="label" for="med-name">{t('meds.name')}</label>
		<input id="med-name" class="field" maxlength="100" autocomplete="off" bind:value={name} />

		<p class="label">{t('meds.strength')} <span class="hint">{t('meds.strength.hint')}</span></p>
		<div class="pair">
			<input
				class="field"
				inputmode="decimal"
				autocomplete="off"
				aria-label={t('meds.strength')}
				aria-invalid={strengthValue === null}
				bind:value={strength}
			/>
			<select class="field unit" aria-label={t('meds.unit')} bind:value={unitChoice}>
				{#each MED_UNITS as u (u)}
					<option value={u}>{u}</option>
				{/each}
				<option value="other">{t('meds.unit.other')}</option>
			</select>
		</div>
		{#if unitChoice === 'other'}
			<input
				class="field"
				maxlength="40"
				autocomplete="off"
				aria-label={t('meds.unit.custom')}
				placeholder={t('meds.unit.custom')}
				bind:value={unitCustom}
			/>
		{/if}

		<p class="label">{t('meds.form')}</p>
		<div class="chip-row" role="group" aria-label={t('meds.form')}>
			{#each MED_FORMS as f (f)}
				<Chip selected={form === f} onclick={() => (form = f)}>{t(`meds.form.${f}` as MessageKey)}</Chip>
			{/each}
		</div>

		<p class="label">{t('meds.often')}</p>
		<Segmented options={oftenOptions} bind:value={often} label={t('meds.often')} />

		{#if often === 'weekdays'}
			<div class="chip-row days" role="group" aria-label={t('meds.weekdays')}>
				{#each WEEK_ORDER as d (d)}
					<Chip selected={days.includes(d)} onclick={() => toggleDay(d)}>{weekdayName(d, i18n.locale)}</Chip>
				{/each}
			</div>
		{:else if often === 'every_n_days'}
			<div class="stepper">
				<button
					type="button"
					class="step"
					aria-label={t('meds.everyN.less')}
					disabled={n <= 2}
					onclick={() => (n = Math.max(2, n - 1))}><Icon name="minus" size={22} /></button
				>
				<output aria-live="polite">{t('meds.sum.everyN', { n })}</output>
				<button
					type="button"
					class="step"
					aria-label={t('meds.everyN.more')}
					disabled={n >= 365}
					onclick={() => (n = Math.min(365, n + 1))}><Icon name="plus" size={22} /></button
				>
			</div>
		{/if}

		{#if often === 'as_needed'}
			<p class="muted small">{t('meds.asNeeded.note')}</p>
		{:else}
			<p class="label">{t('meds.times')} <span class="hint">{t('meds.times.hint')}</span></p>
			<div class="card">
				{#each rows as row, i (row.key)}
					<div class="timerow">
						<input
							type="time"
							class="time"
							aria-label={t('meds.time', { n: i + 1 })}
							aria-invalid={duplicateTimes.has(row.time)}
							bind:value={row.time}
						/>
						<input
							class="amount"
							maxlength="100"
							autocomplete="off"
							aria-label={t('meds.amount', { n: i + 1 })}
							placeholder={t('meds.amount.placeholder')}
							bind:value={row.amount}
						/>
						{#if rows.length > 1}
							<button
								type="button"
								class="x"
								aria-label={t('meds.time.remove', { n: i + 1 })}
								onclick={() => removeRow(row.key)}><Icon name="x" size={18} /></button
							>
						{/if}
					</div>
				{/each}
				{#if duplicateTimes.size > 0}<Notice tone="error">{t('meds.error.duplicateTime')}</Notice>{/if}
				{#if rows.length < MAX_MED_TIMES}
					<button type="button" class="addrow" onclick={addRow}
						><Icon name="plus" size={18} />{t('meds.time.add')}</button
					>
				{/if}
			</div>
		{/if}

		<div class="card">
			<div class="setrow">
				<label class="grow" for="med-start">{t('meds.starts')}</label>
				<input id="med-start" type="date" class="date" bind:value={start} />
			</div>
			<div class="setrow">
				<span class="grow">{t('meds.ends')}</span>
				<Toggle bind:checked={hasEnd} label={t('meds.ends')} />
			</div>
			{#if hasEnd}
				<div class="setrow">
					<label class="grow" for="med-end">{t('meds.ends.date')}</label>
					<input id="med-end" type="date" class="date" bind:value={end} min={start} />
				</div>
			{/if}
			<div class="setrow">
				<span class="grow">{t('meds.reminders')}</span>
				<Toggle bind:checked={reminders} label={t('meds.reminders')} />
			</div>
		</div>
		<p class="muted small hint-line">{t('meds.reminders.hint')}</p>
		{#if hasEnd && !datesOk}<Notice tone="error">{t('meds.error.dates')}</Notice>{/if}

		<label class="label" for="med-note">{t('common.note')}</label>
		<textarea id="med-note" rows="2" placeholder={t('common.optional')} maxlength="2000" bind:value={note}
		></textarea>

		<p class="muted small">{t('meds.exact')}</p>

		{#if failed}
			<Notice tone="error">{failed === 'save' ? t('entry.error.save') : t('entry.error.delete')}</Notice>
		{/if}
		<div class="actions">
			{#if id}
				<Button variant="quiet" disabled={busy} onclick={onDelete}>{t('common.delete')}</Button>
				<Button variant="soft" disabled={busy} onclick={onArchive}
					>{keep?.archived ? t('meds.unarchive') : t('meds.archive')}</Button
				>
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
	.field,
	.date,
	textarea {
		min-height: 48px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
		min-width: 0;
	}
	textarea {
		width: 100%;
		min-height: 88px;
		padding: var(--sp-3) var(--sp-4);
		resize: vertical;
	}
	.field:focus-visible,
	.date:focus-visible,
	textarea:focus-visible,
	.time:focus-visible,
	.amount:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.pair {
		display: flex;
		gap: var(--sp-2);
	}
	.pair .field:first-child {
		flex: 1;
	}
	.unit {
		flex: 0 0 120px;
	}
	.chip-row {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.stepper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.stepper output {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
	}
	.step {
		width: 48px;
		height: 48px;
		border-radius: var(--r-full);
		background: var(--meds-tint);
		color: var(--meds-ink);
		display: grid;
		place-items: center;
	}
	.step:disabled {
		opacity: 0.4;
	}
	.card {
		background: var(--surface-2);
		border-radius: var(--r-lg);
		padding: 4px var(--sp-4);
	}
	.timerow {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 8px 0;
	}
	.timerow + .timerow {
		border-top: 1px solid var(--line);
	}
	.time {
		flex: none;
		width: 7.5em;
		min-height: 44px;
		border: 1.5px solid transparent;
		border-radius: var(--r-md);
		background: transparent;
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
	}
	.time[aria-invalid='true'] {
		color: var(--pain-ink);
		text-decoration: underline wavy;
	}
	.amount {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		border: 1.5px solid transparent;
		border-radius: var(--r-md);
		background: transparent;
		font-size: var(--fs-body);
	}
	.x {
		flex: none;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		color: var(--text-2);
	}
	.addrow {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 48px;
		width: 100%;
		color: var(--primary-press);
		font-weight: var(--fw-semibold);
		border-top: 1px solid var(--line);
	}
	.setrow {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: 8px 0;
		min-height: 52px;
	}
	.setrow + .setrow {
		border-top: 1px solid var(--line);
	}
	.setrow .grow {
		flex: 1;
	}
	.setrow .date {
		min-height: 40px;
		background: transparent;
		text-align: right;
		padding: 0;
	}
	.hint-line {
		margin-top: calc(-1 * var(--sp-1));
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
