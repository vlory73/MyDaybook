<script lang="ts">
	import { EmptyState } from '$lib/components';
	import { t } from '$lib/i18n/index.svelte';
</script>

<header class="page-head"><h1 class="large-title">{t('trends.title')}</h1></header>
<EmptyState icon="chart-spline" title={t('common.comingSoon')} body={t('trends.empty.body')} />
