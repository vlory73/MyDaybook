<script lang="ts">
	import { Card, Segmented } from '$lib/components';
	import { brand } from '$lib/brand';
	import { i18n, setLocale, t, type Locale } from '$lib/i18n/index.svelte';
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
</script>

<header class="page-head"><h1 class="large-title">{t('me.title')}</h1></header>

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

<style>
	.about {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
</style>
