<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import { connection } from '$lib/connection.svelte';
	import Icon from './Icon.svelte';

	/** The one shared line shown beside an action that needs the server while the device is offline. */
</script>

{#if !connection.online}
	<p class="needs small muted" data-testid="needs-connection">
		<Icon name="cloud-off" size={16} />{t('offline.needsConnection')}
	</p>
{/if}

<style>
	.needs {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
	}
	.needs :global(.icon) {
		flex: none;
		margin-top: 2px;
	}
</style>
