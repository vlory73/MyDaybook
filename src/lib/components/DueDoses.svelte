<script lang="ts">
	import Button from './Button.svelte';
	import CategoryBadge from './CategoryBadge.svelte';
	import Icon from './Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { asNeededMedications, dueSlots, pending, type DueDose } from '$lib/meds/due';
	import { takeDoses } from '$lib/meds/log';
	import { openDose } from '$lib/records/editor.svelte';
	import { allRecords } from '$lib/records/store.svelte';
	import { timeOf, todayKey } from '$lib/records/time';

	/**
	 * The doses scheduled for one day, one group per time. Descriptive only: a dose nobody has logged is simply not
	 * logged (no colour judgement, no counts). Amounts are shown exactly as the person entered them.
	 */
	let {
		day,
		title,
		asNeeded = false,
		ondone
	}: {
		day: string;
		title: string;
		/** Also list the medications that are taken when needed, each with a "Log a dose" action. */
		asNeeded?: boolean;
		/** Called after any action, so a host sheet can step aside before its toast shows. */
		ondone?: () => void;
	} = $props();

	const id = $props.id();
	const slots = $derived(dueSlots(allRecords(), day));
	const needed = $derived(asNeeded ? asNeededMedications(allRecords()) : []);
	/** Future days only show what is planned; logging is for today and days already gone. */
	const canLog = $derived(day <= todayKey());

	function openRow(d: DueDose) {
		ondone?.();
		openDose({ id: d.dose?.id ?? null, medicationId: d.medicationId, slot: d.slot });
	}
	function take(doses: DueDose[]) {
		ondone?.();
		void takeDoses(doses);
	}
</script>

{#if slots.length > 0 || needed.length > 0}
	<section class="card" aria-labelledby="{id}-title">
		<h2 class="card-title" id="{id}-title">
			<CategoryBadge category="meds" size={32} />{title}
		</h2>
		{#each slots as slot (slot.time)}
			{@const open = pending(slot)}
			<div class="slot" role="group" aria-label={slot.time}>
				<div class="slot-head">
					<h3>{slot.time}</h3>
					{#if canLog && open.length > 0 && slot.doses.length > 1}
						<Button
							size="sm"
							variant="primary"
							aria-label={t('dose.allTaken.aria', { time: slot.time })}
							onclick={() => take(open)}><Icon name="check-check" size={18} />{t('dose.allTaken')}</Button
						>
					{/if}
				</div>
				{#each slot.doses as d (d.medicationId)}
					<div class="dose">
						{#if canLog}
							<button type="button" class="main" onclick={() => openRow(d)}>
								<b>{d.medication.name}</b>
								{#if d.amount}<span class="muted">{d.amount}</span>{/if}
							</button>
						{:else}
							<span class="main">
								<b>{d.medication.name}</b>
								{#if d.amount}<span class="muted">{d.amount}</span>{/if}
							</span>
						{/if}
						{#if d.dose}
							{@const p = d.dose.payload}
							<button type="button" class="pill {p.status}" onclick={() => openRow(d)}>
								<Icon
									name={p.status === 'late' ? 'clock-alert' : p.status === 'skipped' ? 'minus' : 'check'}
									size={16}
								/>
								{p.status === 'skipped'
									? t('dose.pill.skipped')
									: t(p.status === 'late' ? 'dose.pill.late' : 'dose.pill.taken', { time: timeOf(p.at) })}
							</button>
						{:else if canLog}
							<Button
								size="sm"
								variant="soft"
								aria-label={t('dose.taken.aria', { name: d.medication.name })}
								onclick={() => take([d])}><Icon name="check" size={18} />{t('dose.taken')}</Button
							>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
		{#if needed.length > 0}
			<div class="slot" role="group" aria-label={t('dose.whenNeeded')}>
				<div class="slot-head"><h3>{t('dose.whenNeeded')}</h3></div>
				{#each needed as m (m.id)}
					<div class="dose">
						<span class="main"><b>{m.medication.name}</b></span>
						<Button
							size="sm"
							variant="soft"
							aria-label={t('dose.logDose.aria', { name: m.medication.name })}
							onclick={() => {
								ondone?.();
								openDose({ medicationId: m.id });
							}}>{t('dose.logDose')}</Button
						>
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.card {
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-4);
		box-shadow: var(--shadow-1);
		margin-top: var(--sp-3);
	}
	.card-title {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-body);
		font-weight: var(--fw-semibold);
	}
	.slot {
		margin-top: var(--sp-3);
	}
	.slot-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		min-height: 36px;
	}
	.slot-head h3 {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-bold);
		color: var(--text-2);
		letter-spacing: 0.04em;
	}
	.dose {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-1) 0;
		min-height: 48px;
	}
	.dose + .dose {
		border-top: 1px solid var(--line);
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		text-align: left;
		min-height: 44px;
		justify-content: center;
		overflow-wrap: anywhere;
		color: var(--text);
	}
	.main .muted {
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 36px;
		padding: 0 10px;
		border-radius: var(--r-full);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		flex: none;
	}
	.pill.taken {
		background: var(--meds-tint);
		color: var(--meds-ink);
	}
	.pill.late {
		background: var(--food-tint);
		color: var(--food-ink);
	}
	.pill.skipped {
		background: var(--surface-2);
		color: var(--text-2);
	}
	.main:focus-visible,
	.pill:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
		border-radius: var(--r-sm);
	}
</style>
