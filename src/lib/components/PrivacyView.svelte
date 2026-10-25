<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Spinner from './Spinner.svelte';
	import { brand } from '$lib/brand';
	import { CONSENT_VERSION, consentText, isConsentVersion } from '$lib/consent';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import { loadOwnConsent, loadPrivacySettings, privacy, versionNumber } from '$lib/privacy.svelte';
	import type { StoredConsent } from '$lib/privacy.svelte';
	import { session } from '$lib/session.svelte';

	/**
	 * The Privacy content. Used as the /privacy page and, with `onback`, inside the sign-up flow (so nothing typed
	 * there is lost). The "Your agreement" block needs a session and is hidden without one.
	 */
	let { onback }: { onback?: () => void } = $props();

	const signedIn = $derived(session.status === 'locked' || session.status === 'unlocked');
	const settings = $derived(privacy.settings);

	type Own = { state: 'loading' } | { state: 'ready'; consent: StoredConsent } | { state: 'failed' };
	let own = $state<Own>({ state: 'loading' });
	let reading = $state(false);

	onMount(() => {
		void loadPrivacySettings();
	});
	$effect(() => {
		if (!signedIn) return;
		let live = true;
		loadOwnConsent().then(
			(consent) => live && (own = { state: 'ready', consent }),
			() => live && (own = { state: 'failed' })
		);
		return () => {
			live = false;
		};
	});

	const dateFormat = $derived(new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium' }));
	const agreed = $derived(own.state === 'ready' ? own.consent : null);
	const agreedVersion = $derived(agreed && isConsentVersion(agreed.version) ? agreed.version : null);
	const text = $derived(
		agreedVersion ? consentText(i18n.locale, agreedVersion, settings.backupRetentionDays) : null
	);
	const hasOperator = $derived(settings.operatorName !== '' || settings.operatorContact !== '');

	function contactHref(contact: string): string | null {
		if (/^https?:\/\/\S+$/i.test(contact)) return contact;
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return `mailto:${contact}`;
		return null;
	}
	const href = $derived(contactHref(settings.operatorContact));

	/** Opens Me scrolled to the Delete account card. */
	async function toDeleteCard(event: MouseEvent) {
		event.preventDefault();
		await goto(resolve('/me'));
		document.getElementById('delete-account')?.scrollIntoView({ block: 'center' });
	}
</script>

<div class="nav-head">
	{#if reading}
		<button type="button" class="back" onclick={() => (reading = false)}>
			<Icon name="chevron-left" size={24} /><span>{t('privacy.back')}</span>
		</button>
	{:else if onback}
		<button type="button" class="back" onclick={onback} data-testid="privacy-back">
			<Icon name="chevron-left" size={24} /><span>{t('privacy.back')}</span>
		</button>
	{:else if session.status === 'unlocked'}
		<a class="back" href={resolve('/me')} data-testid="privacy-back">
			<Icon name="chevron-left" size={24} /><span>{t('nav.me')}</span>
		</a>
	{/if}
</div>

{#if reading && text}
	<h1 class="large-title" tabindex="-1">{t('privacy.text.title')}</h1>
	<p class="small muted note-lang">{t('privacy.text.note')}</p>
	<div class="text" data-testid="agreement-text">
		<h2>{text.title}</h2>
		{#if text.age}<p class="agepill">{text.age}</p>{/if}
		{#each text.paragraphs as paragraph (paragraph)}<p>{paragraph}</p>{/each}
		<p class="tick"><Icon name="check" size={20} /><span>{text.checkbox}</span></p>
	</div>
	{#if agreedVersion !== CONSENT_VERSION}
		<p class="note plain"><Icon name="info" size={20} /><span>{t('privacy.agreement.newer')}</span></p>
	{/if}
{:else}
	<header class="phead">
		<span class="seal"><Icon name="shield-check" size={32} /></span>
		<h1 class="large-title">{t('privacy.title')}</h1>
		<p class="promise">{t('privacy.promise')}</p>
	</header>

	<section class="pblock">
		<span class="cat feel"><Icon name="notebook-pen" size={26} /></span>
		<div>
			<h2>{t('privacy.kept.heading')}</h2>
			<p>{t('privacy.kept.entries')}</p>
			<p>{t('privacy.kept.account')}</p>
		</div>
	</section>
	<section class="pblock">
		<span class="cat sleep"><Icon name="eye-off" size={26} /></span>
		<div>
			<h2>{t('privacy.seen.heading')}</h2>
			<p>{t('privacy.seen.body')}</p>
			<p class="strong">{t('privacy.seen.never')}</p>
		</div>
	</section>
	<section class="pblock">
		<span class="cat food"><Icon name="clock" size={26} /></span>
		<div>
			<h2>{t('privacy.keep.heading')}</h2>
			<ul class="keep" data-testid="privacy-keep">
				<li>
					{#if settings.ipRetentionDays > 0}
						<b>{tn('privacy.keep.days', settings.ipRetentionDays)}</b>
						<span>{t('privacy.keep.ip')}</span>
					{:else}
						<b>{t('privacy.keep.none')}</b>
						<span>{t('privacy.keep.ipNone')}</span>
					{/if}
				</li>
				<li>
					<b>{tn('privacy.keep.days', settings.backupRetentionDays)}</b>
					<span>{t('privacy.keep.backups')}</span>
				</li>
			</ul>
		</div>
	</section>
	<section class="pblock">
		<span class="cat meds"><Icon name="bell" size={26} /></span>
		<div>
			<h2>{t('privacy.reminders.heading')}</h2>
			<p>{t('privacy.reminders.body')}</p>
		</div>
	</section>

	<h2 class="sec">{t('privacy.rights.heading')}</h2>
	<div class="rlist">
		{#if signedIn}
			<a class="rrow" href={resolve('/me/export')} data-testid="privacy-export">
				<span class="bul"><Icon name="file-down" size={18} /></span>
				<span class="grow">
					<span class="t">{t('privacy.rights.download')}</span>
					<span class="s">{t('privacy.rights.downloadHint')}</span>
				</span>
				<span class="chev"><Icon name="chevron-right" size={18} /></span>
			</a>
		{:else}
			<div class="rrow">
				<span class="bul"><Icon name="file-down" size={18} /></span>
				<span class="grow">
					<span class="t">{t('privacy.rights.download')}</span>
					<span class="s">{t('privacy.rights.downloadHint')}</span>
				</span>
			</div>
		{/if}
		<div class="rrow">
			<span class="bul"><Icon name="notebook-pen" size={18} /></span>
			<span class="grow">
				<span class="t">{t('privacy.rights.edit')}</span>
				<span class="s">{t('privacy.rights.editHint')}</span>
			</span>
		</div>
		{#if signedIn}
			<a class="rrow" href={resolve('/me')} onclick={toDeleteCard} data-testid="privacy-delete">
				<span class="bul"><Icon name="trash" size={18} /></span>
				<span class="grow">
					<span class="t">{t('privacy.rights.delete')}</span>
					<span class="s">{t('privacy.rights.deleteHint')}</span>
				</span>
				<span class="chev"><Icon name="chevron-right" size={18} /></span>
			</a>
		{:else}
			<div class="rrow">
				<span class="bul"><Icon name="trash" size={18} /></span>
				<span class="grow">
					<span class="t">{t('privacy.rights.delete')}</span>
					<span class="s">{t('privacy.rights.deleteHint')}</span>
				</span>
			</div>
		{/if}
		<div class="rrow">
			<span class="bul"><Icon name="scale" size={18} /></span>
			<span class="grow">
				<span class="t">{t('privacy.rights.complain')}</span>
				<span class="s">{t('privacy.rights.complainHint')}</span>
			</span>
		</div>
	</div>

	{#if signedIn}
		<h2 class="sec">{t('privacy.agreement.heading')}</h2>
		<div class="card" data-testid="agreement">
			{#if own.state === 'loading'}
				<p class="busy" role="status"><Spinner size={20} />{t('common.loading')}</p>
			{:else if own.state === 'failed'}
				<Notice tone="error">{t('auth.error.network')}</Notice>
			{:else if agreed}
				<p data-testid="agreement-line">
					{t('privacy.agreement.line', {
						date: dateFormat.format(new Date(agreed.acceptedAt)),
						version: versionNumber(agreed.version)
					})}
				</p>
				{#if agreedVersion}
					<button type="button" class="drow" onclick={() => (reading = true)} data-testid="agreement-read">
						<span>{t('privacy.agreement.read')}</span><Icon name="chevron-right" size={20} />
					</button>
				{/if}
			{:else}
				<p>{t('privacy.agreement.unknown')}</p>
			{/if}
		</div>
	{/if}

	<h2 class="sec">{t('privacy.know.heading')}</h2>
	<p class="note">
		<Icon name="key-round" size={22} />
		<span><b>{t('privacy.know.keyBold')}</b> {t('privacy.know.keyRest')}</span>
	</p>
	<p class="note plain">
		<Icon name="heart-pulse" size={22} /><span>{t('privacy.know.medical', { app: brand.displayName })}</span>
	</p>

	{#if hasOperator}
		<h2 class="sec">{t('privacy.operator.heading')}</h2>
		<div class="card operator" data-testid="operator">
			<span class="bul"><Icon name="server" size={18} /></span>
			<div>
				{#if settings.operatorName}<div class="t">{settings.operatorName}</div>{/if}
				{#if settings.operatorContact}
					<div class="s">
						{t('privacy.operator.questions')}
						{#if href}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the operator's own mailto: or https: contact, not an app route -->
							<a class="link" {href} rel="noopener">{settings.operatorContact}</a
							>{:else}{settings.operatorContact}{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	.nav-head {
		display: flex;
		margin-bottom: var(--sp-1);
		min-height: var(--tap);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: var(--tap);
		margin-left: calc(-1 * var(--sp-2));
		padding: 0;
		background: none;
		border: 0;
		color: var(--primary);
		text-decoration: none;
		font: inherit;
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
		cursor: pointer;
	}
	.back:focus-visible,
	.rrow:focus-visible,
	.drow:focus-visible,
	.link:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.phead {
		text-align: center;
		padding: var(--sp-2) 0 var(--sp-5);
	}
	.seal {
		width: 64px;
		height: 64px;
		border-radius: 22px;
		background: var(--primary-soft);
		color: var(--primary-press);
		display: grid;
		place-items: center;
		margin: 0 auto var(--sp-3);
	}
	.promise {
		margin-top: var(--sp-3);
		font-size: var(--fs-title3);
		line-height: 1.35;
		font-weight: var(--fw-semibold);
	}
	.pblock {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-start;
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-5) var(--sp-4);
		box-shadow: var(--shadow-1);
		margin-top: var(--sp-4);
	}
	.pblock h2 {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
		margin-bottom: var(--sp-2);
	}
	.pblock p {
		color: var(--text-2);
		line-height: 1.45;
	}
	.pblock p + p {
		margin-top: var(--sp-2);
	}
	.pblock p.strong {
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.cat {
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: 16px;
		display: grid;
		place-items: center;
	}
	.cat.feel {
		background: var(--feel-tint);
		color: var(--feel-ink);
	}
	.cat.sleep {
		background: var(--sleep-tint);
		color: var(--sleep-ink);
	}
	.cat.food {
		background: var(--food-tint);
		color: var(--food-ink);
	}
	.cat.meds {
		background: var(--meds-tint);
		color: var(--meds-ink);
	}
	.keep {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
	}
	.keep li {
		display: grid;
		gap: 2px;
	}
	.keep b {
		font-size: var(--fs-title3);
		color: var(--text);
	}
	.keep span {
		color: var(--text-2);
		line-height: 1.4;
	}
	.sec {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
		margin: var(--sp-6) 0 var(--sp-3);
	}
	.rlist {
		display: grid;
		gap: var(--sp-3);
	}
	.rrow {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-4);
		box-shadow: var(--shadow-1);
		min-height: 64px;
		color: var(--text);
		text-decoration: none;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.rrow .t {
		display: block;
		font-weight: var(--fw-semibold);
	}
	.rrow .s {
		display: block;
		color: var(--text-2);
		font-size: var(--fs-callout);
		line-height: 1.4;
		margin-top: 2px;
	}
	.chev {
		color: var(--text-3);
		display: inline-flex;
	}
	.bul {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--primary-soft);
		color: var(--primary-press);
		display: grid;
		place-items: center;
		flex: none;
	}
	.card {
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-4);
		box-shadow: var(--shadow-1);
	}
	.drow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: var(--tap);
		margin-top: var(--sp-3);
		padding: 0 var(--sp-4);
		border: 0;
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-weight: var(--fw-semibold);
		cursor: pointer;
	}
	.busy {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text-2);
	}
	.note {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
		padding: var(--sp-4);
		border-radius: var(--r-lg);
		background: var(--note-tint);
		color: var(--note-ink);
		line-height: 1.45;
		margin-bottom: var(--sp-3);
	}
	.note.plain {
		background: var(--surface-2);
		color: var(--text-2);
	}
	.note :global(.icon) {
		margin-top: 2px;
	}
	.operator {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
	}
	.operator .t {
		font-weight: var(--fw-semibold);
	}
	.operator .s {
		color: var(--text-2);
		font-size: var(--fs-callout);
		margin-top: 2px;
		overflow-wrap: anywhere;
	}
	.link {
		color: var(--primary-press);
		font-weight: var(--fw-semibold);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.note-lang {
		margin: var(--sp-1) 0 var(--sp-4);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-4);
		box-shadow: var(--shadow-1);
		margin-bottom: var(--sp-4);
	}
	.text h2 {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
	}
	.text p {
		color: var(--text-2);
		line-height: 1.5;
	}
	.agepill {
		width: fit-content;
		padding: 8px var(--sp-4);
		border-radius: var(--r-full);
		background: var(--primary-soft);
		color: var(--primary-press) !important;
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
	.tick {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--text) !important;
	}
</style>
