<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from './Button.svelte';
	import Hero from './Hero.svelte';
	import Notice from './Notice.svelte';
	import Spinner from './Spinner.svelte';
	import TextField from './TextField.svelte';
	import { focusOnMount } from '$lib/actions';
	import { ApiError } from '$lib/api';
	import { commonErrorKey } from '$lib/auth';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { session, signOut, unlock } from '$lib/session.svelte';

	/** Full-screen view shown instead of the page while the diary is locked (after a reload or an auto-lock). */
	let passphrase = $state('');
	let busy = $state(false);
	let error = $state<MessageKey | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (passphrase === '') {
			error = 'auth.error.fillIn';
			return;
		}
		busy = true;
		error = null;
		try {
			await unlock(passphrase);
			passphrase = '';
		} catch (err) {
			error = err instanceof ApiError ? commonErrorKey(err) : 'unlock.wrong';
		} finally {
			busy = false;
		}
	}
</script>

<section class="unlock">
	<Hero icon="lock-keyhole" />
	<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('unlock.title')}</h1>
	<p class="muted lead">{t('unlock.lead', { username: session.identity?.username ?? '' })}</p>

	<form onsubmit={submit} class="form" novalidate>
		<input
			class="sr-only"
			type="text"
			name="username"
			autocomplete="username"
			value={session.identity?.username ?? ''}
			readonly
			tabindex="-1"
			aria-hidden="true"
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
		{#if busy}
			<p class="busy" role="status"><Spinner size={22} />{t('unlock.working')}</p>
		{/if}
		<Button type="submit" block size="lg" disabled={busy}>{t('unlock.submit')}</Button>
	</form>

	<div class="links">
		<button type="button" class="link" onclick={() => signOut()}>{t('unlock.notYou')}</button>
		<button type="button" class="link" onclick={() => goto(resolve('/recover'))}>{t('unlock.forgot')}</button>
	</div>
</section>

<style>
	.unlock {
		text-align: center;
		padding-top: var(--sp-7);
	}
	.lead {
		margin: var(--sp-3) 0 var(--sp-5);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		text-align: left;
	}
	.busy {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text-2);
	}
	.links {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: var(--sp-4);
	}
	.link {
		min-height: var(--tap);
		padding: 0 var(--sp-3);
		color: var(--primary);
		font-weight: var(--fw-medium);
		text-decoration: underline;
	}
</style>
