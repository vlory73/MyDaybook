<script lang="ts">
	import { Button, CategoryBadge, DueDoses, EmptyState, Icon } from '$lib/components';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { scheduleSummary } from '$lib/meds/schedule';
	import { openAdhocDose, openMedication } from '$lib/records/editor.svelte';
	import { todayKey } from '$lib/records/time';
	import { allRecords, store } from '$lib/records/store.svelte';
	import type { MedicationPayload } from '$lib/records/types';

	type Med = { id: string; med: MedicationPayload };

	const meds = $derived.by(() => {
		const list: Med[] = [];
		for (const r of allRecords())
			if (r.payload.type === 'medication') list.push({ id: r.id, med: r.payload });
		list.sort((a, b) => a.med.name.localeCompare(b.med.name, i18n.locale));
		return list;
	});
	const active = $derived(meds.filter((m) => !m.med.archived));
	const archived = $derived(meds.filter((m) => m.med.archived));

	/** "20 µg · Tablet", exactly what was entered. */
	function detail(m: MedicationPayload): string {
		const strength = m.strength !== undefined ? `${m.strength}${m.unit ? ` ${m.unit}` : ''}` : '';
		return [strength, t(`meds.form.${m.form}` as MessageKey)].filter(Boolean).join(' · ');
	}
</script>

<header class="page-head"><h1 class="large-title">{t('meds.title')}</h1></header>

<DueDoses day={todayKey()} title={t('dose.card.today')} asNeeded />

{#if store.status === 'ready' && meds.length === 0}
	<EmptyState icon="pill" title={t('meds.empty.title')} body={t('meds.empty.body')} />
{/if}

{#snippet row(item: Med)}
	<li>
		<button
			type="button"
			class="med"
			aria-label={t('meds.edit.aria', { name: item.med.name })}
			onclick={() => openMedication(item.id)}
		>
			<CategoryBadge category="meds" size={40} />
			<span class="text">
				<b>{item.med.name}</b>
				<span class="muted">{detail(item.med)}</span>
				<span class="muted">{scheduleSummary(item.med, t, i18n.locale)}</span>
			</span>
			<span class="edit" aria-hidden="true">{t('meds.edit')}</span>
			<Icon name="chevron-right" size={18} />
		</button>
	</li>
{/snippet}

{#if active.length > 0}
	<ul class="list" aria-label={t('meds.title')}>
		{#each active as item (item.id)}{@render row(item)}{/each}
	</ul>
{/if}

<div class="add">
	<Button variant={meds.length === 0 ? 'primary' : 'soft'} block onclick={() => openMedication()}
		><Icon name="plus" size={20} />{t('meds.add')}</Button
	>
	<Button variant="soft" block onclick={() => openAdhocDose()}
		><Icon name="plus" size={20} />{t('adhoc.open')}</Button
	>
</div>

{#if archived.length > 0}
	<details class="archived">
		<summary>{t('meds.archived')} ({archived.length})</summary>
		<ul class="list" aria-label={t('meds.archived')}>
			{#each archived as item (item.id)}{@render row(item)}{/each}
		</ul>
	</details>
{/if}

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.med {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		min-height: 64px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-lg);
		background: var(--surface);
		box-shadow: var(--shadow-1);
		text-align: left;
		color: var(--text);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow-wrap: anywhere;
	}
	.edit {
		flex: none;
		color: var(--primary-press);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
	}
	.text .muted {
		font-size: var(--fs-footnote);
	}
	.add {
		margin-top: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.archived {
		margin-top: var(--sp-5);
	}
	.archived summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.archived .list {
		margin-top: var(--sp-2);
	}
</style>
