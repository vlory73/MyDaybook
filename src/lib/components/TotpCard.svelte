<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError } from '$lib/api';
	import {
		commonErrorKey,
		confirmTotp,
		disableTotp,
		startTotpSetup,
		totpStatus,
		type TotpSetup
	} from '$lib/auth';
	import type { MessageKey } from '$lib/i18n/en';
	import { t } from '$lib/i18n/index.svelte';
	import { connection } from '$lib/connection.svelte';
	import Button from './Button.svelte';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import NeedsConnection from './NeedsConnection.svelte';
	import Notice from './Notice.svelte';
	import Sheet from './Sheet.svelte';
	import Spinner from './Spinner.svelte';
	import TextField from './TextField.svelte';
	import { showToast } from './toast.svelte';

	/** Me → "Two-step sign-in": status, the enrolment sheet and the turn-off sheet (ARCHITECTURE §3.4). */
	let enabled = $state<boolean | null>(null);

	let setupOpen = $state(false);
	let setup = $state<TotpSetup | null>(null);
	let passphrase = $state('');
	let code = $state('');
	let busy = $state(false);
	let error = $state<MessageKey | null>(null);

	let stopOpen = $state(false);
	let stopPassphrase = $state('');
	let stopCode = $state('');

	const groups = $derived(setup ? (setup.secret.match(/.{1,4}/g) ?? []) : []);

	onMount(async () => {
		try {
			enabled = (await totpStatus()).enabled;
		} catch {
			enabled = null;
		}
	});

	$effect(() => {
		if (!setupOpen) {
			setup = null;
			passphrase = code = '';
			error = null;
		}
	});
	$effect(() => {
		if (!stopOpen) {
			stopPassphrase = stopCode = '';
			error = null;
		}
	});

	async function showKey(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (passphrase === '') return (error = 'auth.error.fillIn');
		busy = true;
		error = null;
		try {
			setup = await startTotpSetup(passphrase);
			passphrase = '';
		} catch (err) {
			error =
				err instanceof ApiError && err.status === 401
					? 'me.totp.wrongPassphrase'
					: err instanceof ApiError && err.code === 'totp_already_enabled'
						? 'me.totp.alreadyOn'
						: commonErrorKey(err);
		} finally {
			busy = false;
		}
	}

	async function confirm(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (code.trim() === '') return (error = 'auth.error.fillIn');
		busy = true;
		error = null;
		try {
			await confirmTotp(code);
			enabled = true;
			setupOpen = false;
			showToast(t('me.totp.enabledDone'));
		} catch (err) {
			error =
				err instanceof ApiError && (err.status === 401 || err.status === 400)
					? 'me.totp.invalidCode'
					: commonErrorKey(err);
			code = '';
		} finally {
			busy = false;
		}
	}

	async function turnOff(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (stopPassphrase === '' || stopCode.trim() === '') return (error = 'auth.error.fillIn');
		busy = true;
		error = null;
		try {
			await disableTotp(stopPassphrase, stopCode);
			enabled = false;
			stopOpen = false;
			showToast(t('me.totp.disabledDone'));
		} catch (err) {
			error =
				err instanceof ApiError && err.code === 'invalid_totp'
					? 'me.totp.invalidCode'
					: err instanceof ApiError && err.status === 401
						? 'me.totp.wrongPassphrase'
						: commonErrorKey(err);
			stopCode = '';
		} finally {
			busy = false;
		}
	}

	async function copyKey() {
		if (!setup) return;
		try {
			await navigator.clipboard.writeText(setup.secret);
			showToast(t('me.totp.copied'));
		} catch {
			showToast(t('me.totp.copyFailed'));
		}
	}
</script>

<Card title={t('me.totp.heading')}>
	<p class="small muted hint">{t('me.totp.lead')}</p>
	{#if enabled !== null}
		<div class="state">
			<span class="pill" class:on={enabled} data-testid="totp-state">
				<Icon name={enabled ? 'shield-check' : 'lock'} size={16} />
				{enabled ? t('me.totp.on') : t('me.totp.off')}
			</span>
			{#if enabled}
				<Button variant="quiet" disabled={!connection.online} onclick={() => (stopOpen = true)}
					>{t('me.totp.stop')}</Button
				>
			{:else}
				<Button variant="soft" disabled={!connection.online} onclick={() => (setupOpen = true)}
					>{t('me.totp.start')}</Button
				>
			{/if}
		</div>
		{#if enabled}<p class="small muted hint">{t('me.totp.recoveryNote')}</p>{/if}
	{/if}
	<NeedsConnection />
</Card>

<Sheet bind:open={setupOpen} title={t('me.totp.setupTitle')}>
	{#if !setup}
		<form onsubmit={showKey} class="form" novalidate>
			<p class="small muted">{t('me.totp.setupLead')}</p>
			<TextField
				label={t('me.totp.passphrase')}
				name="totp-passphrase"
				type="password"
				autocomplete="current-password"
				autocapitalize="off"
				spellcheck="false"
				disabled={busy}
				bind:value={passphrase}
			/>
			{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
			{#if busy}<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>{/if}
			<Button type="submit" block size="lg" disabled={busy}>{t('me.totp.next')}</Button>
		</form>
	{:else}
		<form onsubmit={confirm} class="form" novalidate>
			<p class="small muted">{t('me.totp.keyLead')}</p>
			<div class="key" role="group" aria-label={t('me.totp.keyLabel')} data-testid="totp-secret">
				{#each groups as group, i (i)}<span>{group}</span>{/each}
			</div>
			<div class="actions">
				<Button variant="quiet" onclick={copyKey}><Icon name="copy" size={18} />{t('me.totp.copy')}</Button>
				<!-- An otpauth: link leaves the app on purpose (hands the URI to an authenticator app). -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="link-button" href={setup.uri} data-testid="totp-open-app">
					{t('me.totp.openApp')}
				</a>
			</div>
			<TextField
				label={t('me.totp.codeLabel')}
				name="totp-confirm"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength={7}
				spellcheck="false"
				disabled={busy}
				bind:value={code}
			/>
			{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
			{#if busy}<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>{/if}
			<Button type="submit" block size="lg" disabled={busy}>{t('me.totp.confirm')}</Button>
		</form>
	{/if}
</Sheet>

<Sheet bind:open={stopOpen} title={t('me.totp.disableTitle')}>
	<form onsubmit={turnOff} class="form" novalidate>
		<p class="small muted">{t('me.totp.disableLead')}</p>
		<TextField
			label={t('me.totp.passphrase')}
			name="totp-stop-passphrase"
			type="password"
			autocomplete="current-password"
			autocapitalize="off"
			spellcheck="false"
			disabled={busy}
			bind:value={stopPassphrase}
		/>
		<TextField
			label={t('me.totp.codeLabel')}
			name="totp-stop-code"
			inputmode="numeric"
			autocomplete="one-time-code"
			maxlength={7}
			spellcheck="false"
			disabled={busy}
			bind:value={stopCode}
		/>
		{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
		{#if busy}<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>{/if}
		<Button type="submit" variant="danger" block size="lg" disabled={busy}>
			{t('me.totp.disableConfirm')}
		</Button>
	</form>
</Sheet>

<style>
	.hint {
		margin-bottom: var(--sp-3);
	}
	.state {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
	}
	.pill.on {
		color: var(--text);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		max-height: 70dvh;
		overflow-y: auto;
		padding: 2px;
	}
	.busy {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text-2);
	}
	.key {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}
	.key span {
		font-family: var(--font-mono);
		font-size: 1.0625rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.08em;
		text-align: center;
		padding: 10px 0;
		border-radius: var(--r-sm);
		background: var(--surface-2);
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
	}
</style>
