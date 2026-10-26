<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Button,
		Hero,
		NeedsConnection,
		Notice,
		PassphraseFields,
		RecoveryConfirm,
		RecoveryKey,
		Spinner,
		StepDots,
		TextField
	} from '$lib/components';
	import { focusOnMount } from '$lib/actions';
	import { connection } from '$lib/connection.svelte';
	import { ApiError } from '$lib/api';
	import {
		commonErrorKey,
		discardRecovery,
		finishRecovery,
		normalizeUsername,
		prepareRecovery,
		startRecovery
	} from '$lib/auth';
	import type { RecoveryPrepared, RecoverySession } from '$lib/auth';
	import { formatRecoveryKey, parseRecoveryKey } from '$lib/crypto/keys';
	import { initCrypto } from '$lib/crypto/sodium';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { checkNewPassphrase } from '$lib/passphrase';
	import { session } from '$lib/session.svelte';

	type Step = 'enter' | 'checking' | 'passphrase' | 'creating' | 'key' | 'confirm' | 'finishing';
	const DOT: Record<Step, number> = {
		enter: 1,
		checking: 1,
		passphrase: 2,
		creating: 2,
		key: 3,
		confirm: 4,
		finishing: 4
	};

	let step = $state<Step>('enter');
	let error = $state<MessageKey | null>(null);
	// Coming from the Unlock view, the user name is already known.
	let username = $state(session.identity?.username ?? '');
	let keyText = $state('');
	let passphrase = $state('');
	let repeat = $state('');
	/** The NEW recovery key, formatted for display; cleared once the account has it. */
	let recoveryText = $state('');

	// Not reactive on purpose: key material stays out of $state.
	let recovery: RecoverySession | null = null;
	let prepared: RecoveryPrepared | null = null;

	onDestroy(forget);

	function forget() {
		discardRecovery(recovery, prepared);
		recovery = null;
		prepared = null;
		recoveryText = '';
		keyText = '';
	}

	function go(next: Step, message: MessageKey | null = null) {
		error = message;
		step = next;
	}

	async function submitEnter(event: SubmitEvent) {
		event.preventDefault();
		if (username.trim() === '' || keyText.trim() === '') return (error = 'auth.error.fillIn');
		const bytes = parseRecoveryKey(keyText);
		if (!bytes) return (error = 'recover.keyInvalid');
		go('checking');
		try {
			await initCrypto();
			recovery = await startRecovery(username, bytes);
			keyText = '';
			go('passphrase');
		} catch (err) {
			go('enter', err instanceof ApiError && err.status === 401 ? 'recover.wrong' : commonErrorKey(err));
		}
	}

	async function submitPassphrase(event: SubmitEvent) {
		event.preventDefault();
		if (!recovery) return go('enter');
		const check = checkNewPassphrase(passphrase, repeat);
		if (check === 'weak') return (error = 'auth.error.passphraseWeak');
		if (check === 'mismatch') return (error = 'auth.error.passphraseMismatch');
		go('creating');
		try {
			prepared = await prepareRecovery(recovery, passphrase);
			recoveryText = formatRecoveryKey(prepared.recovery.recoveryKey);
			go('key');
		} catch {
			go('passphrase', 'join.error.keys');
		}
	}

	async function finish() {
		if (!recovery || !prepared) return go('enter');
		go('finishing');
		try {
			await finishRecovery(recovery, prepared);
			// The session now owns the keys.
			recovery = null;
			prepared = null;
			recoveryText = '';
			await goto(resolve('/'));
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				// The five-minute recovery window passed (or was used): nothing was changed.
				forget();
				passphrase = '';
				repeat = '';
				go('enter', 'recover.expired');
			} else {
				go('confirm', commonErrorKey(err));
			}
		}
	}
</script>

<section class="recover">
	<StepDots total={4} current={DOT[step]} />

	{#if step === 'enter' || step === 'checking'}
		<div class="auth-center">
			<Hero icon="key-round" />
			<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('recover.title')}</h1>
			<p class="muted auth-lead">{t('recover.lead')}</p>
		</div>
		<form onsubmit={submitEnter} class="auth-form" novalidate>
			<TextField
				label={t('auth.username')}
				name="username"
				autocomplete="username"
				autocapitalize="off"
				spellcheck="false"
				disabled={step === 'checking'}
				bind:value={username}
			/>
			<TextField
				label={t('recover.key')}
				hint={t('recover.key.hint')}
				name="recovery-key"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				disabled={step === 'checking'}
				bind:value={keyText}
			/>
			<Notice>{t('recover.oldKeyNote')}</Notice>
			{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
			{#if step === 'checking'}
				<p class="auth-busy" role="status"><Spinner size={22} />{t('recover.checking')}</p>
			{/if}
			<Button type="submit" block size="lg" disabled={step === 'checking' || !connection.online}>
				{t('recover.continue')}
			</Button>
			<NeedsConnection />
		</form>
		<div class="auth-links">
			<a class="link-button" href={resolve('/login')}>{t('recover.backToSignIn')}</a>
		</div>
	{:else if step === 'passphrase'}
		<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('recover.passphrase.title')}</h1>
		<p class="muted auth-lead">{t('recover.passphrase.lead')}</p>
		<form onsubmit={submitPassphrase} class="auth-form" novalidate>
			<PassphraseFields bind:passphrase bind:repeat />
			{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
			<Button type="submit" block size="lg">{t('recover.passphrase.continue')}</Button>
		</form>
	{:else if step === 'creating' || step === 'finishing'}
		<div class="auth-center working" role="status">
			<Spinner size={48} />
			<h1 class="large-title" tabindex="-1" use:focusOnMount>
				{step === 'creating' ? t('join.creating.title') : t('recover.finishing')}
			</h1>
		</div>
	{:else if step === 'key'}
		{#if error}<div class="top-error"><Notice tone="error">{t(error)}</Notice></div>{/if}
		<RecoveryKey
			recoveryKey={recoveryText}
			username={normalizeUsername(username)}
			lead={t('recover.newKey.lead')}
			onnext={() => go('confirm')}
		/>
	{:else if step === 'confirm'}
		{#if error}<div class="top-error"><Notice tone="error">{t(error)}</Notice></div>{/if}
		{#if recoveryText !== ''}
			<RecoveryConfirm groups={recoveryText.split('-')} onconfirmed={finish} onback={() => go('key')} />
		{/if}
	{/if}
</section>

<style>
	.recover {
		padding-top: var(--sp-3);
	}
	.working {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		padding-top: var(--sp-8);
	}
	.top-error {
		margin-bottom: var(--sp-4);
	}
</style>
