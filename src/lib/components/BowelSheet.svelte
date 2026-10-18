<script lang="ts">
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import StoolIcon from './StoolIcon.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { fromLocalInput } from '$lib/records/time';
	import { BOWEL_FLAGS, type BowelPayload, type Payload } from '$lib/records/types';

	let time = $state('');
	let bristol = $state<number | undefined>();
	let flags = $state<BowelPayload['flags']>([]);
	let note = $state('');

	function onopen(existing: Payload | null) {
		const b = existing?.type === 'bowel' ? existing : null;
		bristol = b?.bristol;
		flags = b?.flags ?? [];
		note = b?.note ?? '';
	}

	const valid = $derived(bristol !== undefined && fromLocalInput(time) !== null);

	function toggle(flag: (typeof BOWEL_FLAGS)[number]) {
		flags = flags.includes(flag) ? flags.filter((f) => f !== flag) : [...flags, flag];
	}

	// Records only: a flag is stored and shown back, and never triggers a message (not a medical device).
	function payload(): Payload | null {
		const at = fromLocalInput(time);
		if (!at || bristol === undefined) return null;
		const p: BowelPayload = {
			v: 1,
			type: 'bowel',
			at,
			bristol,
			flags: BOWEL_FLAGS.filter((f) => flags.includes(f))
		};
		if (note.trim()) p.note = note.trim();
		return p;
	}
</script>

<LogSheet kind="bowel" title={t('fmt.bowel.title')} {valid} {payload} {onopen} bind:time>
	<p class="label">{t('bowel.type')}<span class="hint">{t('bowel.type.hint')}</span></p>
	<div class="types" role="radiogroup" aria-label={t('bowel.type')}>
		{#each [1, 2, 3, 4, 5, 6, 7] as n (n)}
			<button
				type="button"
				role="radio"
				aria-checked={bristol === n}
				aria-label={t('bowel.type.option', { n, name: t(`bowel.type.${n}` as MessageKey) })}
				class:on={bristol === n}
				onclick={() => (bristol = n)}
			>
				<StoolIcon type={n} />
				<b>{n}</b>
				<span>{t(`bowel.type.${n}` as MessageKey)}</span>
			</button>
		{/each}
	</div>
	<p class="label">{t('bowel.flags')}<span class="hint">{t('common.optional')}</span></p>
	<div class="chip-row">
		{#each BOWEL_FLAGS as f (f)}
			<Chip selected={flags.includes(f)} onclick={() => toggle(f)}>{t(`bowel.flag.${f}` as MessageKey)}</Chip>
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
	<p class="foot"><Icon name="lock" size={18} />{t('bowel.privacy')}</p>
</LogSheet>

<style>
	.types {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}
	.types button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 10px 2px 8px;
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--gut-ink);
		font-size: var(--fs-caption);
	}
	.types b {
		color: var(--text);
		font-size: var(--fs-callout);
	}
	.types span {
		color: var(--text-2);
		text-align: center;
	}
	.types button.on {
		background: var(--gut-tint);
		box-shadow: inset 0 0 0 2px var(--gut-ink);
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
