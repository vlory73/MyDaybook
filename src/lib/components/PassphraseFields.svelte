<script lang="ts">
	import TextField from './TextField.svelte';
	import { passphraseStrength } from '$lib/passphrase';
	import { t } from '$lib/i18n/index.svelte';

	/** Choose-a-passphrase pair with a local strength hint. Validation and error text stay with the form. */
	let {
		passphrase = $bindable(''),
		repeat = $bindable(''),
		label,
		disabled = false
	}: { passphrase?: string; repeat?: string; label?: string; disabled?: boolean } = $props();

	let reveal = $state(false);
	const strength = $derived(passphraseStrength(passphrase));
	const level = $derived(strength === 'weak' ? 1 : strength === 'okay' ? 2 : 3);
</script>

<div class="fields">
	<TextField
		label={label ?? t('auth.passphrase')}
		name="new-passphrase"
		type={reveal ? 'text' : 'password'}
		autocomplete="new-password"
		autocapitalize="off"
		spellcheck="false"
		required
		{disabled}
		bind:value={passphrase}
	/>
	<div class="meter" class:empty={passphrase === ''}>
		<span class="bars {strength}" aria-hidden="true">
			{#each [1, 2, 3] as n (n)}<i class:on={n <= level}></i>{/each}
		</span>
		<span class="strength">{t('auth.strength', { level: t(`auth.strength.${strength}`) })}</span>
	</div>
	<p class="help small muted">{t('auth.passphrase.help')}</p>
	<TextField
		label={t('auth.passphrase.repeat')}
		name="new-passphrase-repeat"
		type={reveal ? 'text' : 'password'}
		autocomplete="new-password"
		autocapitalize="off"
		spellcheck="false"
		required
		{disabled}
		bind:value={repeat}
	/>
	<label class="reveal"><input type="checkbox" bind:checked={reveal} />{t('auth.passphrase.show')}</label>
</div>

<style>
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.meter {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.meter.empty {
		opacity: 0.55;
	}
	.bars {
		display: flex;
		gap: 4px;
	}
	.bars i {
		width: 28px;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-3);
	}
	.weak i.on {
		background: var(--pain-ink);
	}
	.okay i.on {
		background: var(--note-ink);
	}
	.strong i.on {
		background: var(--meds-ink);
	}
	.reveal {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: var(--tap);
		font-size: var(--fs-callout);
	}
	.reveal input {
		width: 22px;
		height: 22px;
		accent-color: var(--primary);
	}
</style>
