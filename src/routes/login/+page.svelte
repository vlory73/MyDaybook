<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Hero, Notice, Spinner, TextField } from '$lib/components';
	import { focusOnMount } from '$lib/actions';
	import { ApiError } from '$lib/api';
	import { brand } from '$lib/brand';
	import { commonErrorKey, signIn } from '$lib/auth';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { session } from '$lib/session.svelte';

	let username = $state('');
	let passphrase = $state('');
	let busy = $state(false);
	let error = $state<MessageKey | null>(null);

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
			await signIn(username, passphrase);
			passphrase = '';
			await goto(resolve('/'));
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

	{#if session.flash}
		<div class="flash">
			<Notice>{t(`login.flash.${session.flash}`, { app: brand.displayName })}</Notice>
		</div>
	{/if}

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
	.note {
		margin-top: var(--sp-3);
	}
</style>
