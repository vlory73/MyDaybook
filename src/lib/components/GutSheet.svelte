<script lang="ts">
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import ScalePicker from './ScalePicker.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { fromLocalInput } from '$lib/records/time';
	import { GUT_FLAGS, GUT_KINDS, type GutPayload, type Payload } from '$lib/records/types';

	type Kind = (typeof GUT_KINDS)[number];

	let time = $state('');
	/** Chosen intensity per symptom; a symptom is selected once it has a key, with `undefined` until a strength is tapped. */
	let picked = $state<Partial<Record<Kind, number | undefined>>>({});
	let flags = $state<GutPayload['flags']>([]);
	let note = $state('');

	function onopen(existing: Payload | null) {
		const g = existing?.type === 'gut' ? existing : null;
		picked = Object.fromEntries((g?.symptoms ?? []).map((s) => [s.kind, s.intensity]));
		flags = g?.flags ?? [];
		note = g?.note ?? '';
	}

	const selected = (k: Kind) => Object.hasOwn(picked, k);
	const chosen = $derived(GUT_KINDS.filter(selected));
	const valid = $derived(
		chosen.length > 0 && chosen.every((k) => picked[k] !== undefined) && fromLocalInput(time) !== null
	);
	// "Vomited" belongs to nausea only.
	const flagList = $derived(GUT_FLAGS.filter((f) => f !== 'vomited' || selected('nausea')));

	function toggleKind(k: Kind) {
		if (selected(k)) {
			picked = Object.fromEntries(Object.entries(picked).filter(([key]) => key !== k));
			if (k === 'nausea') flags = flags.filter((f) => f !== 'vomited');
		} else {
			picked = { ...picked, [k]: undefined };
		}
	}
	function toggleFlag(flag: (typeof GUT_FLAGS)[number]) {
		flags = flags.includes(flag) ? flags.filter((f) => f !== flag) : [...flags, flag];
	}

	// Records only: a flag is stored and shown back, and never triggers a message (not a medical device).
	function payload(): Payload | null {
		const at = fromLocalInput(time);
		if (!at || !valid) return null;
		const p: GutPayload = {
			v: 1,
			type: 'gut',
			at,
			symptoms: chosen.map((kind) => ({ kind, intensity: picked[kind]! })),
			flags: GUT_FLAGS.filter((f) => flags.includes(f) && flagList.includes(f))
		};
		if (note.trim()) p.note = note.trim();
		return p;
	}
</script>

<LogSheet kind="gut" title={t('cat.stomach')} {valid} {payload} {onopen} bind:time>
	<p class="label">{t('gut.which')}</p>
	<div class="kinds">
		{#each GUT_KINDS as k (k)}
			<button type="button" aria-pressed={selected(k)} class:on={selected(k)} onclick={() => toggleKind(k)}>
				{t(`gut.kind.${k}` as MessageKey)}
			</button>
		{/each}
	</div>
	{#each chosen as k (k)}
		<div class="strength">
			<p class="label">{t(`gut.kind.${k}` as MessageKey)}</p>
			<ScalePicker
				tint="gut"
				label={t('gut.intensity', { name: t(`gut.kind.${k}` as MessageKey) })}
				bind:value={picked[k]}
			/>
		</div>
	{/each}
	<p class="label">{t('gut.context')}<span class="hint">{t('common.optional')}</span></p>
	<div class="chip-row">
		{#each flagList as f (f)}
			<Chip selected={flags.includes(f)} onclick={() => toggleFlag(f)}
				>{t(`gut.flag.${f}` as MessageKey)}</Chip
			>
		{/each}
	</div>
	<p class="label">{t('common.note')}</p>
	<textarea
		rows="2"
		aria-label={t('common.note')}
		placeholder={t('common.optional')}
		maxlength="2000"
		bind:value={note}
	></textarea>
	<p class="foot"><Icon name="lock" size={18} />{t('gut.privacy')}</p>
</LogSheet>

<style>
	.kinds {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.kinds button {
		min-height: 52px;
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--text-2);
		font-weight: var(--fw-semibold);
	}
	.kinds button.on {
		background: var(--gut-tint);
		color: var(--gut-ink);
		box-shadow: inset 0 0 0 2px var(--gut-ink);
	}
	.strength {
		margin-top: 8px;
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
