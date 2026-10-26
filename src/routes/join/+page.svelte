<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Button,
		Hero,
		Icon,
		NeedsConnection,
		Notice,
		PassphraseFields,
		PrivacyView,
		RecoveryConfirm,
		RecoveryKey,
		Spinner,
		StepDots,
		TextField
	} from '$lib/components';
	import type { IconName } from '$lib/components';
	import { focusOnMount } from '$lib/actions';
	import { connection } from '$lib/connection.svelte';
	import { ApiError, apiPost } from '$lib/api';
	import type { Identity } from '$lib/api';
	import {
		USERNAME_PATTERN,
		commonErrorKey,
		normalizeUsername,
		signupBody,
		storedFromAccount
	} from '$lib/auth';
	import { brand } from '$lib/brand';
	import { CONSENT_VERSION, consentHash, consentText } from '$lib/consent';
	import { createAccount, DEFAULT_KDF, formatRecoveryKey } from '$lib/crypto/keys';
	import type { NewAccount } from '$lib/crypto/keys';
	import { initCrypto, sodium } from '$lib/crypto/sodium';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { checkNewPassphrase } from '$lib/passphrase';
	import { loadPrivacySettings, privacy } from '$lib/privacy.svelte';
	import { establish, nextFrame } from '$lib/session.svelte';

	type Step = 'welcome' | 'account' | 'creating' | 'key' | 'confirm' | 'consent' | 'sending';
	type Invite = 'checking' | 'ok' | 'invalid' | 'unreachable';
	const DOT: Record<Step, number> = {
		welcome: 1,
		account: 2,
		creating: 2,
		key: 3,
		confirm: 4,
		consent: 5,
		sending: 5
	};

	let invite = $state<Invite>('checking');
	let step = $state<Step>('welcome');
	let error = $state<MessageKey | null>(null);
	let username = $state('');
	let passphrase = $state('');
	let repeat = $state('');
	let agreed = $state(false);
	/** Formatted recovery key for display; cleared as soon as the account exists. */
	let recoveryText = $state('');

	// Not reactive on purpose: key material stays out of $state.
	let token = '';
	let userId = '';
	let account: NewAccount | null = null;
	let createdFor = '';
	let confirmed = false;

	/** The "Read how your data is handled" view. It replaces the step, so everything typed so far is kept. */
	let readingPrivacy = $state(false);
	const backupDays = $derived(privacy.settings.backupRetentionDays);
	const consent = $derived(consentText(i18n.locale, CONSENT_VERSION, backupDays));

	onMount(() => {
		// The invite token travels in the URL fragment so it never reaches server logs (ARCHITECTURE §3.1).
		const match = /(?:^|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(location.hash.slice(1));
		if (location.hash) clearFragment();
		if (!match) {
			invite = 'invalid';
			return;
		}
		token = match[1]!;
		void checkInvite();
		void loadPrivacySettings();
	});

	onDestroy(forgetAccount);

	function clearFragment() {
		try {
			replaceState(resolve('/join'), {});
		} catch {
			// The router isn't ready yet (development only): fall back to the plain History API.
			history.replaceState(history.state, '', location.pathname + location.search);
		}
	}

	async function checkInvite() {
		invite = 'checking';
		try {
			await apiPost('/api/invites/check', { token });
			invite = 'ok';
		} catch (err) {
			invite = err instanceof ApiError && err.status === 404 ? 'invalid' : 'unreachable';
		}
	}

	function go(next: Step, message: MessageKey | null = null) {
		error = message;
		step = next;
	}

	function forgetAccount() {
		if (account) {
			sodium().memzero(account.recoveryKey);
			account = null;
		}
		recoveryText = '';
		createdFor = '';
		confirmed = false;
	}

	async function submitAccount(event: SubmitEvent) {
		event.preventDefault();
		const name = normalizeUsername(username);
		if (!USERNAME_PATTERN.test(name)) return (error = 'auth.error.usernameInvalid');
		const check = checkNewPassphrase(passphrase, repeat);
		if (check === 'weak') return (error = 'auth.error.passphraseWeak');
		if (check === 'mismatch') return (error = 'auth.error.passphraseMismatch');
		error = null;
		// Same passphrase as before (e.g. back from a later step, or a taken username): the keys, and the recovery
		// key the person may already have saved, stay valid. Nothing in them depends on the username.
		if (account && createdFor === passphrase) return go(confirmed ? 'consent' : 'key');
		forgetAccount();
		go('creating');
		try {
			await initCrypto();
			await nextFrame(); // let the spinner paint before Argon2id blocks the main thread
			userId = crypto.randomUUID();
			account = createAccount(userId, passphrase, DEFAULT_KDF);
			createdFor = passphrase;
			recoveryText = formatRecoveryKey(account.recoveryKey);
			go('key');
		} catch {
			forgetAccount();
			go('account', 'join.error.keys');
		}
	}

	async function submitConsent(event: SubmitEvent) {
		event.preventDefault();
		if (!account) return go('account');
		if (!agreed) return (error = 'join.consent.required');
		// The text names the server's backup period; it must be the real one before it is hashed and stored.
		if (!privacy.loaded) await loadPrivacySettings();
		if (!privacy.loaded) return (error = 'auth.error.network');
		const locale = i18n.locale;
		go('sending');
		try {
			const textHash = await consentHash(locale, CONSENT_VERSION, backupDays);
			const identity = await apiPost<Identity>(
				'/api/auth/signup',
				signupBody(token, userId, normalizeUsername(username), account.bundle, {
					version: CONSENT_VERSION,
					textHash,
					locale
				})
			);
			const { keys, bundle } = account;
			sodium().memzero(account.recoveryKey);
			account = null;
			recoveryText = '';
			establish(identity, storedFromAccount(bundle), keys);
			await goto(resolve('/'));
		} catch (err) {
			if (err instanceof ApiError && err.code === 'invalid_invite') {
				invite = 'invalid';
			} else if (err instanceof ApiError && err.code === 'username_taken') {
				go('account', 'join.account.taken');
			} else if (err instanceof ApiError && err.code === 'user_exists') {
				forgetAccount();
				go('account', 'auth.error.generic');
			} else {
				go('consent', commonErrorKey(err));
			}
		}
	}

	const welcomePoints: { icon: IconName; text: () => string }[] = [
		{ icon: 'lock-keyhole', text: () => t('join.welcome.private') },
		{ icon: 'key-round', text: () => t('join.welcome.key') },
		{ icon: 'shield-check', text: () => t('join.welcome.notMedical', { app: brand.displayName }) }
	];
</script>

<section class="join">
	{#if invite === 'checking'}
		<p class="auth-busy checking" role="status"><Spinner size={22} />{t('join.checking')}</p>
	{:else if invite === 'unreachable'}
		<div class="auth-center">
			<Hero icon="info" />
			<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('join.unreachable.title')}</h1>
			<p class="muted auth-lead">{t('auth.error.network')}</p>
			<Button onclick={checkInvite}>{t('common.retry')}</Button>
		</div>
	{:else if invite === 'invalid'}
		<div class="auth-center">
			<Hero icon="info" />
			<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('join.invalid.title')}</h1>
			<p class="muted auth-lead">{t('join.invalid.body')}</p>
			<a class="link-button" href={resolve('/login')}>{t('join.invalid.signIn')}</a>
		</div>
	{:else if readingPrivacy}
		<PrivacyView onback={() => (readingPrivacy = false)} />
	{:else}
		<StepDots total={5} current={DOT[step]} />

		{#if step === 'welcome'}
			<div class="auth-center">
				<Hero icon="shield-check" />
				<h1 class="large-title" tabindex="-1" use:focusOnMount>
					{t('join.welcome.title', { app: brand.displayName })}
				</h1>
				<p class="muted auth-lead">{t('join.welcome.lead')}</p>
			</div>
			<ul class="points">
				{#each welcomePoints as point (point.icon)}
					<li><span class="badge"><Icon name={point.icon} size={22} /></span><span>{point.text()}</span></li>
				{/each}
			</ul>
			<div class="auth-form actions">
				<Button block size="lg" onclick={() => go('account')}>{t('join.welcome.start')}</Button>
				<a class="link-button auth-center" href={resolve('/login')}>{t('join.welcome.haveAccount')}</a>
			</div>
		{:else if step === 'account'}
			<div class="auth-back">
				<Button variant="quiet" size="sm" onclick={() => go('welcome')}>
					<Icon name="chevron-left" size={18} />{t('common.back')}
				</Button>
			</div>
			<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('join.account.title')}</h1>
			<p class="muted auth-lead">{t('join.account.lead')}</p>
			<form onsubmit={submitAccount} class="auth-form" novalidate>
				<TextField
					label={t('auth.username')}
					hint={t('auth.username.hint')}
					name="username"
					autocomplete="username"
					autocapitalize="off"
					spellcheck="false"
					maxlength={40}
					required
					bind:value={username}
				/>
				<PassphraseFields bind:passphrase bind:repeat />
				{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
				<Button type="submit" block size="lg">{t('join.account.continue')}</Button>
			</form>
		{:else if step === 'creating'}
			<div class="auth-center working" role="status">
				<Spinner size={48} />
				<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('join.creating.title')}</h1>
				<p class="muted">{t('join.creating.body')}</p>
			</div>
		{:else if step === 'key'}
			<div class="auth-back">
				<Button variant="quiet" size="sm" onclick={() => go('account')}>
					<Icon name="chevron-left" size={18} />{t('common.back')}
				</Button>
			</div>
			<RecoveryKey
				recoveryKey={recoveryText}
				username={normalizeUsername(username)}
				onnext={() => go('confirm')}
			/>
		{:else if step === 'confirm'}
			{#if recoveryText !== ''}
				<RecoveryConfirm
					groups={recoveryText.split('-')}
					onconfirmed={() => {
						confirmed = true;
						go('consent');
					}}
					onback={() => go('key')}
				/>
			{/if}
		{:else if step === 'consent'}
			<div class="auth-back">
				<Button variant="quiet" size="sm" onclick={() => go('key')}>
					<Icon name="chevron-left" size={18} />{t('common.back')}
				</Button>
			</div>
			<h1 class="large-title" tabindex="-1" use:focusOnMount>{consent.title}</h1>
			<form onsubmit={submitConsent} class="auth-form consent" novalidate>
				{#if consent.age}
					<p class="agepill" data-testid="consent-age"><Icon name="user-round" size={18} />{consent.age}</p>
				{/if}
				{#each consent.paragraphs as paragraph (paragraph)}<p class="para">{paragraph}</p>{/each}
				<button
					type="button"
					class="readlink"
					onclick={() => (readingPrivacy = true)}
					data-testid="consent-read"
				>
					<Icon name="shield-check" size={18} />{t('join.consent.read')}<Icon
						name="chevron-right"
						size={18}
					/>
				</button>
				<label class="agree">
					<input type="checkbox" name="consent" bind:checked={agreed} />
					<span>{consent.checkbox}</span>
				</label>
				{#if error}<Notice tone="error">{t(error)}</Notice>{/if}
				<Button
					type="submit"
					block
					size="lg"
					disabled={(!privacy.loaded && !privacy.failed) || !connection.online}
				>
					{t('join.consent.create')}
				</Button>
				<NeedsConnection />
			</form>
		{:else if step === 'sending'}
			<div class="auth-center working" role="status">
				<Spinner size={48} />
				<h1 class="large-title" tabindex="-1" use:focusOnMount>{t('join.sending.title')}</h1>
			</div>
		{/if}
	{/if}
</section>

<style>
	.join {
		padding-top: var(--sp-3);
	}
	.checking {
		justify-content: center;
		min-height: 40dvh;
	}
	.points {
		list-style: none;
		margin: 0 0 var(--sp-6);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
	.points li {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
		color: var(--text-2);
	}
	.badge {
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		background: var(--primary-soft);
		color: var(--primary-press);
	}
	.actions {
		gap: var(--sp-2);
	}
	.actions .link-button {
		align-self: center;
	}
	.working {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		padding-top: var(--sp-8);
	}
	.consent {
		margin-top: var(--sp-4);
	}
	.para {
		color: var(--text-2);
	}
	.agepill {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: fit-content;
		margin: 0;
		padding: 10px var(--sp-4);
		border-radius: var(--r-full);
		background: var(--primary-soft);
		color: var(--primary-press);
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
	.readlink {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--tap);
		padding: 0;
		background: none;
		border: 0;
		color: var(--primary-press);
		font: inherit;
		font-weight: var(--fw-semibold);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-align: left;
		cursor: pointer;
	}
	.readlink:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.agree {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
		padding: var(--sp-3) var(--sp-4);
		min-height: var(--tap);
		border-radius: var(--r-md);
		background: var(--surface-2);
	}
	.agree input {
		flex: none;
		width: 24px;
		height: 24px;
		margin: 0;
		accent-color: var(--primary);
	}
</style>
