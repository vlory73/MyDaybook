<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Hero, Notice, Spinner, TextField } from '$lib/components';
	import { focusOnMount } from '$lib/actions';
	import { ApiError } from '$lib/api';
	import { brand } from '$lib/brand';
	import { commonErrorKey, discardSignIn, signIn, signInWithCode, type PendingSignIn } from '$lib/auth';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { session } from '$lib/session.svelte';
	import { onDestroy } from 'svelte';

	let username = $state('');
	let passphrase = $state('');
	let busy = $state(false);
	let error = $state<MessageKey | null>(null);
	// Set when the account has two-step sign-in: the derived keys wait here, in memory only, for the code.
	let pending = $state.raw<PendingSignIn | null>(null);
	let code = $state('');

	onDestroy(() => discardSignIn(pending));

	function startOver() {
		discardSignIn(pending);
		pending = null;
		code = '';
		error = null;
	}

	async function submitCode(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !pending) return;
		if (code.replace(/\D/g, '').length !== 6) {
			error = 'login.totp.invalid';
			return;
		}
		busy = true;
		error = null;
		try {
			await signInWithCode(pending, code);
			pending = null;
			passphrase = '';
			await goto(resolve('/'));
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				error = 'login.totp.invalid';
				code = '';
			} else error = commonErrorKey(err);
		} finally {
			busy = false;
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (username.trim() === '' || passphrase === '') {
			error = 'auth.error.fillIn';
			return;
		}
		busy = true;
		error = null;
		try {
			pending = await signIn(username, passphrase);
			if (pending) {
				passphrase = '';
			} else {
				passphrase = '';
				await goto(resolve('/'));
			}
		} catch (err) {
			error = err instanceof ApiError && err.status === 401 ? 'login.invalid' : commonErrorKey(err);
		} finally {
			busy = false;
		}
	}
</script>

<section class="auth-center">
	<Hero icon="notebook-pen" />
	<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('login.title')}</h1>
	<p class="muted auth-lead">{t('login.lead')}</p>

	{#if session.flash && !pending}
		<div class="flash">
			<Notice>{t(`login.flash.${session.flash}`, { app: brand.displayName })}</Notice>
		</div>
	{/if}

	{#if pending}
		<form onsubmit={submitCode} class="auth-form form" novalidate>
			<h2 class="step-title">{t('login.totp.title')}</h2>
			<p class="muted">{t('login.totp.lead')}</p>
			<TextField
				label={t('login.totp.label')}
				name="totp"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength={7}
				spellcheck="false"
				disabled={busy}
				bind:value={code}
			/>
			{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
			{#if busy}<p class="auth-busy" role="status"><Spinner size={22} />{t('login.working')}</p>{/if}
			<Button type="submit" block size="lg" disabled={busy}>{t('login.totp.submit')}</Button>
			<Button variant="quiet" block onclick={startOver} disabled={busy}>{t('login.totp.back')}</Button>
		</form>
	{:else}
		<form onsubmit={submit} class="auth-form form" novalidate>
			<TextField
				label={t('auth.username')}
				name="username"
				autocomplete="username"
				autocapitalize="off"
				spellcheck="false"
				disabled={busy}
				bind:value={username}
			/>
			<TextField
				label={t('auth.passphrase')}
				name="passphrase"
				type="password"
				autocomplete="current-password"
				autocapitalize="off"
				spellcheck="false"
				disabled={busy}
				bind:value={passphrase}
			/>
			{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
			{#if busy}<p class="auth-busy" role="status"><Spinner size={22} />{t('login.working')}</p>{/if}
			<Button type="submit" block size="lg" disabled={busy}>{t('login.submit')}</Button>
		</form>
	{/if}

	<div class="auth-links">
		<a class="link-button" href={resolve('/recover')}>{t('login.forgot')}</a>
	</div>
	<p class="small muted note">{t('login.noAccount')}</p>
</section>

<style>
	section {
		padding-top: var(--sp-6);
	}
	.flash {
		margin-bottom: var(--sp-4);
		text-align: left;
	}
	.form {
		text-align: left;
	}
	.step-title {
		font-size: var(--fs-title-3, 1.25rem);
		font-weight: var(--fw-semibold);
	}
	.note {
		margin-top: var(--sp-3);
	}
</style>
