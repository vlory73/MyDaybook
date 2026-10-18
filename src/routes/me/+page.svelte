<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Button,
		Card,
		Icon,
		Notice,
		PassphraseFields,
		Segmented,
		SelectField,
		Sheet,
		Spinner,
		TextField,
		TotpCard,
		WatchList,
		showToast
	} from '$lib/components';
	import { ApiError } from '$lib/api';
	import { brand } from '$lib/brand';
	import { changePassphrase, commonErrorKey, deleteAccount } from '$lib/auth';
	import { i18n, setLocale, t, type Locale } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { checkNewPassphrase } from '$lib/passphrase';
	import {
		AUTO_LOCK_CHOICES,
		afterDeletion,
		lock,
		session,
		setAutoLockMinutes,
		signOut
	} from '$lib/session.svelte';
	import { theme, type Theme } from '$lib/theme.svelte';

	let locale = $state<Locale>(i18n.locale);
	$effect(() => setLocale(locale));

	// Language names are shown in their own language, as is conventional; they are not translated.
	const languages: { value: Locale; label: string }[] = [
		{ value: 'en', label: 'English' },
		{ value: 'da', label: 'Dansk' }
	];
	const themes = $derived<{ value: Theme; label: string }[]>([
		{ value: 'system', label: t('me.theme.system') },
		{ value: 'light', label: t('me.theme.light') },
		{ value: 'dark', label: t('me.theme.dark') }
	]);

	// ---- Auto-lock ----
	let autoLock = $state<string | number>(session.autoLockMinutes);
	const lockOptions = $derived(
		AUTO_LOCK_CHOICES.map((minutes) => ({ value: minutes, label: t('me.autolock.option', { minutes }) }))
	);

	// ---- Change passphrase ----
	let changeOpen = $state(false);
	let current = $state('');
	let next = $state('');
	let repeat = $state('');
	let changeBusy = $state(false);
	let changeError = $state<MessageKey | null>(null);

	// ---- Delete account ----
	let deleteOpen = $state(false);
	let deletePassphrase = $state('');
	let deleteBusy = $state(false);
	let deleteError = $state<MessageKey | null>(null);

	$effect(() => {
		if (!changeOpen) {
			current = next = repeat = '';
			changeError = null;
		}
	});
	$effect(() => {
		if (!deleteOpen) {
			deletePassphrase = '';
			deleteError = null;
		}
	});

	async function submitChange(event: SubmitEvent) {
		event.preventDefault();
		if (changeBusy) return;
		if (current === '') return (changeError = 'auth.error.fillIn');
		const check = checkNewPassphrase(next, repeat);
		if (check === 'weak') return (changeError = 'auth.error.passphraseWeak');
		if (check === 'mismatch') return (changeError = 'auth.error.passphraseMismatch');
		changeBusy = true;
		changeError = null;
		try {
			await changePassphrase(current, next);
			changeOpen = false;
			showToast(t('me.passphrase.done'));
		} catch (err) {
			changeError =
				err instanceof ApiError && err.status === 401 ? 'me.passphrase.wrong' : commonErrorKey(err);
		} finally {
			changeBusy = false;
		}
	}

	async function submitDelete(event: SubmitEvent) {
		event.preventDefault();
		if (deleteBusy) return;
		if (deletePassphrase === '') return (deleteError = 'auth.error.fillIn');
		deleteBusy = true;
		deleteError = null;
		try {
			await deleteAccount(deletePassphrase);
			deleteOpen = false;
			afterDeletion();
			await goto(resolve('/login'));
		} catch (err) {
			deleteError =
				err instanceof ApiError && err.status === 401
					? 'me.danger.wrong'
					: err instanceof ApiError && err.code === 'last_guardian'
						? 'me.danger.lastGuardian'
						: commonErrorKey(err);
		} finally {
			deleteBusy = false;
		}
	}

	async function doSignOut() {
		await signOut();
		await goto(resolve('/login'));
	}
</script>

<header class="page-head"><h1 class="large-title">{t('me.title')}</h1></header>

<Card title={t('me.account.heading')}>
	<p class="who">
		<Icon name="user-round" size={20} />
		<span>{t('me.account.signedInAs', { username: session.identity?.username ?? '' })}</span>
	</p>
	<div class="row">
		<Button variant="soft" onclick={lock}><Icon name="lock" size={18} />{t('me.account.lockNow')}</Button>
		<Button variant="quiet" onclick={doSignOut}>{t('me.account.signOut')}</Button>
	</div>
</Card>
<WatchList />
<Card title={t('me.autolock.heading')}>
	<SelectField
		label={t('me.autolock.label')}
		options={lockOptions}
		bind:value={autoLock}
		onchange={(event) => setAutoLockMinutes(Number(event.currentTarget.value))}
	/>
	<p class="small muted hint">{t('me.autolock.hint')}</p>
</Card>
<Card title={t('me.passphrase.heading')}>
	<p class="small muted hint">{t('me.passphrase.lead')}</p>
	<Button variant="quiet" onclick={() => (changeOpen = true)}>
		<Icon name="key-round" size={18} />{t('me.passphrase.open')}
	</Button>
</Card>
<TotpCard />
<Card title={t('me.theme.heading')}>
	<Segmented label={t('me.theme.heading')} options={themes} bind:value={theme.current} />
</Card>
<Card title={t('me.language.heading')}>
	<Segmented label={t('me.language.heading')} options={languages} bind:value={locale} />
</Card>
<Card title={t('me.about.heading')}>
	<div class="about">
		<p><strong>{brand.displayName}</strong></p>
		<p>{t('me.about.purpose', { app: brand.displayName })}</p>
		<p>{t('me.about.notMedical')}</p>
		<p>{t('me.about.privacy')}</p>
		<p class="small muted">{t('me.about.licence')}</p>
	</div>
</Card>

<div class="danger">
	<Card title={t('me.danger.heading')}>
		<div class="about">
			<p>{t('me.danger.lead')}</p>
			<p class="small muted">{t('me.danger.backups')}</p>
			<p class="small muted">{t('me.danger.export')}</p>
			<p class="small muted">{t('me.danger.withdraw')}</p>
			<Button variant="danger" onclick={() => (deleteOpen = true)}>{t('me.danger.open')}</Button>
		</div>
	</Card>
</div>

<Sheet bind:open={changeOpen} title={t('me.passphrase.open')}>
	<form onsubmit={submitChange} class="form" novalidate>
		<p class="small muted">{t('me.passphrase.lead')}</p>
		<TextField
			label={t('me.passphrase.current')}
			name="current-passphrase"
			type="password"
			autocomplete="current-password"
			autocapitalize="off"
			spellcheck="false"
			disabled={changeBusy}
			bind:value={current}
		/>
		<PassphraseFields
			bind:passphrase={next}
			bind:repeat
			label={t('me.passphrase.new')}
			disabled={changeBusy}
		/>
		{#if changeError}<Notice tone="error">{t(changeError)}</Notice>{/if}
		{#if changeBusy}<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>{/if}
		<Button type="submit" block size="lg" disabled={changeBusy}>{t('me.passphrase.open')}</Button>
	</form>
</Sheet>

<Sheet bind:open={deleteOpen} title={t('me.danger.confirmTitle')}>
	<form onsubmit={submitDelete} class="form" novalidate>
		<p>{t('me.danger.lead')}</p>
		<p class="small muted">{t('me.danger.backups')}</p>
		<p class="small muted">{t('me.danger.withdraw')}</p>
		<TextField
			label={t('me.danger.passphrase')}
			name="delete-passphrase"
			type="password"
			autocomplete="current-password"
			autocapitalize="off"
			spellcheck="false"
			disabled={deleteBusy}
			bind:value={deletePassphrase}
		/>
		{#if deleteError}<Notice tone="error">{t(deleteError)}</Notice>{/if}
		{#if deleteBusy}<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>{/if}
		<Button type="submit" variant="danger" block size="lg" disabled={deleteBusy}>
			{t('me.danger.confirm')}
		</Button>
		<Button variant="quiet" block onclick={() => (deleteOpen = false)}>{t('common.cancel')}</Button>
	</form>
</Sheet>

<style>
	.about {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.who {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		font-weight: var(--fw-medium);
	}
	.row {
		display: flex;
		gap: var(--sp-3);
	}
	.row :global(.btn) {
		flex: 1;
	}
	.hint {
		margin: var(--sp-2) 0 var(--sp-3);
	}
	.danger {
		margin-top: var(--sp-6);
	}
	.danger :global(.card) {
		box-shadow: inset 0 0 0 1.5px var(--pain-ink);
		background: var(--surface);
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
</style>
