<script lang="ts">
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import LogSheet from './LogSheet.svelte';
	import ScalePicker from './ScalePicker.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { lastFeeling } from '$lib/records/log';
	import { allRecords, save } from '$lib/records/store.svelte';
	import { fromLocalInput } from '$lib/records/time';
	import type { Payload, Symptom } from '$lib/records/types';

	let time = $state('');
	let mood = $state<number | undefined>();
	let energy = $state<number | undefined>();
	let stress = $state<number | undefined>();
	let symptoms = $state<Symptom[]>([]);
	let note = $state('');
	let adding = $state(false);
	let newTag = $state('');
	let known = $state<string[]>([]);
	let last = $state<{ mood?: number; energy?: number; stress?: number }>({});

	const tagNames = $derived.by(() => {
		const stored: string[] = [];
		for (const r of allRecords()) if (r.payload.type === 'tag') stored.push(r.payload.name);
		stored.sort((a, b) => a.localeCompare(b));
		const names: string[] = [];
		for (const name of [...stored, ...known, ...symptoms.map((s) => s.tag)]) {
			if (!names.includes(name)) names.push(name);
		}
		return names;
	});

	function onopen(existing: Payload | null) {
		const f = existing?.type === 'feeling' ? existing : null;
		mood = f?.mood;
		energy = f?.energy;
		stress = f?.stress;
		symptoms = f?.symptoms.map((s) => ({ ...s })) ?? [];
		note = f?.note ?? '';
		adding = false;
		newTag = '';
		known = [];
		const all = allRecords();
		last = {
			mood: lastFeeling(all, 'mood'),
			energy: lastFeeling(all, 'energy'),
			stress: lastFeeling(all, 'stress')
		};
	}

	const has = (tag: string) => symptoms.some((s) => s.tag === tag);
	function toggle(tag: string) {
		symptoms = has(tag) ? symptoms.filter((s) => s.tag !== tag) : [...symptoms, { tag }];
	}
	function setSeverity(tag: string, n: number) {
		symptoms = symptoms.map((s) => (s.tag === tag ? { tag, severity: s.severity === n ? undefined : n } : s));
	}

	async function addTag() {
		const name = newTag.trim().slice(0, 40);
		if (!name) return;
		if (!tagNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
			known = [...known, name];
			try {
				await save({ v: 1, type: 'tag', name });
			} catch {
				// The tag is still usable on this entry; it is stored with the symptom either way.
			}
		}
		const existing = tagNames.find((n) => n.toLowerCase() === name.toLowerCase()) ?? name;
		if (!has(existing)) symptoms = [...symptoms, { tag: existing }];
		newTag = '';
		adding = false;
	}

	const valid = $derived(
		(mood !== undefined || energy !== undefined || stress !== undefined) && fromLocalInput(time) !== null
	);

	function payload(): Payload | null {
		const at = fromLocalInput(time);
		if (!at || !valid) return null;
		const p: Payload = { v: 1, type: 'feeling', at, symptoms: symptoms.map((s) => ({ ...s })) };
		if (mood !== undefined) p.mood = mood;
		if (energy !== undefined) p.energy = energy;
		if (stress !== undefined) p.stress = stress;
		if (note.trim()) p.note = note.trim();
		return p;
	}
</script>

<LogSheet kind="feeling" title={t('feeling.title')} {valid} {payload} {onopen} bind:time>
	<p class="label">
		{t('feeling.mood')}{#if last.mood !== undefined}<span class="hint"
				>{t('entry.lastTime', { value: last.mood })}</span
			>{/if}
	</p>
	<ScalePicker bind:value={mood} label={t('feeling.mood')} faces />
	<p class="label">
		{t('feeling.energy')}{#if last.energy !== undefined}<span class="hint"
				>{t('entry.lastTime', { value: last.energy })}</span
			>{/if}
	</p>
	<ScalePicker
		bind:value={energy}
		label={t('feeling.energy')}
		low={t('feeling.energy.low')}
		high={t('feeling.energy.high')}
	/>
	<p class="label">
		{t('feeling.stress')}{#if last.stress !== undefined}<span class="hint"
				>{t('entry.lastTime', { value: last.stress })}</span
			>{/if}
	</p>
	<ScalePicker
		bind:value={stress}
		label={t('feeling.stress')}
		low={t('feeling.stress.low')}
		high={t('feeling.stress.high')}
	/>

	<p class="label">{t('feeling.tags')}<span class="hint">{t('feeling.tags.hint')}</span></p>
	<div class="chip-row">
		{#each tagNames as name (name)}
			<Chip selected={has(name)} onclick={() => toggle(name)}>{name}</Chip>
		{/each}
		<Chip onclick={() => (adding = !adding)}><Icon name="plus" size={16} />{t('feeling.tags.new')}</Chip>
	</div>
	{#if adding}
		<form
			class="add"
			onsubmit={(e) => {
				e.preventDefault();
				void addTag();
			}}
		>
			<input aria-label={t('feeling.tags.name')} maxlength="40" bind:value={newTag} />
			<button type="submit" class="go">{t('common.add')}</button>
		</form>
	{/if}
	{#each symptoms as s (s.tag)}
		<div class="sev" role="group" aria-label={s.tag}>
			<span class="name">{s.tag}</span>
			{#each [1, 2, 3] as n (n)}
				<button
					type="button"
					class:on={s.severity === n}
					aria-pressed={s.severity === n}
					aria-label={t('feeling.severity', { tag: s.tag, n })}
					onclick={() => setSeverity(s.tag, n)}>{n}</button
				>
			{/each}
		</div>
	{/each}
	{#if symptoms.length > 0}<p class="muted small">{t('feeling.severity.hint')}</p>{/if}

	<p class="label">{t('common.note')}</p>
	<textarea
		rows="3"
		aria-label={t('common.note')}
		placeholder={t('common.optional')}
		maxlength="2000"
		bind:value={note}
	></textarea>
</LogSheet>

<style>
	.add {
		display: flex;
		gap: var(--sp-2);
	}
	.add input {
		flex: 1;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
	}
	.add input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.go {
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		background: var(--primary-soft);
		color: var(--primary-press);
		font-weight: var(--fw-semibold);
	}
	.sev {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.sev .name {
		flex: 1;
		font-weight: var(--fw-medium);
	}
	.sev button {
		width: 40px;
		height: 36px;
		border-radius: var(--r-sm);
		background: var(--surface-2);
		color: var(--text-2);
		font-weight: var(--fw-semibold);
	}
	.sev button.on {
		background: var(--feel-tint);
		color: var(--feel-ink);
		box-shadow: inset 0 0 0 2px var(--feel-ink);
	}
</style>
