<script lang="ts">
	import { EmptyState } from '$lib/components';
	import { t } from '$lib/i18n/index.svelte';
</script>

<header class="page-head"><h1 class="large-title">{t('meds.title')}</h1></header>
<EmptyState icon="pill" title={t('common.comingSoon')} body={t('meds.empty.body')} />
