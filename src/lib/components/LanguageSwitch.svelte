<script lang="ts">
	import Segmented from './Segmented.svelte';
	import { i18n, setLocale, t, type Locale } from '$lib/i18n/index.svelte';

	// Language names are shown in their own language and are not translated.
	const languages: { value: Locale; label: string }[] = [
		{ value: 'en', label: 'English' },
		{ value: 'da', label: 'Dansk' }
	];
	let locale = $state<Locale>(i18n.locale);
	$effect(() => setLocale(locale));
</script>

<Segmented label={t('me.language.heading')} options={languages} bind:value={locale} />
