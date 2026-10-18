<script lang="ts">
	import { EmptyState } from '$lib/components';
	import { i18n, t } from '$lib/i18n/index.svelte';

	const now = new Date();
	const hour = now.getHours();
	const greeting = hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening';
	const dateLabel = $derived(
		new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
	);
</script>

<header class="page-head">
	<div>
		<p class="eyebrow">{dateLabel}</p>
		<h1 class="large-title">{t(greeting)}</h1>
	</div>
</header>

<EmptyState icon="sunrise" title={t('today.empty.title')} body={t('today.empty.body')} />
