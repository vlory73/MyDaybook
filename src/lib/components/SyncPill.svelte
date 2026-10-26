<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';
	import { connection } from '$lib/connection.svelte';
	import { t, tn } from '$lib/i18n/index.svelte';
	import { store } from '$lib/records/store.svelte';

	/**
	 * The one line on Today that says what is going on with syncing: offline (with how many entries wait), sending,
	 * waiting, or refused. Hidden when everything is on the server and the device is online. It links to Me, where the
	 * Sync card has the details.
	 */
	const values = $derived(Object.values(store.pending));
	const refused = $derived(values.filter((v) => v === 'refused').length);
	const waiting = $derived(values.length - refused);

	type View = { icon: 'cloud-off' | 'clock-alert' | null; text: string };
	const view = $derived.by<View | null>(() => {
		if (!connection.online) {
			return {
				icon: 'cloud-off',
				text: values.length > 0 ? tn('outbox.pill.offlineWaiting', values.length) : t('outbox.pill.offline')
			};
		}
		if (store.flushing && waiting > 0)
			return { icon: null, text: t('outbox.pill.syncing', { count: waiting }) };
		if (waiting > 0) return { icon: 'cloud-off', text: tn('outbox.pill.waiting', waiting) };
		if (refused > 0) return { icon: 'clock-alert', text: tn('outbox.pill.refused', refused) };
		return null;
	});
</script>

{#snippet body(v: View)}
	{#if v.icon}<Icon name={v.icon} size={16} />{:else}<Spinner size={14} />{/if}
	<span>{v.text}</span>
{/snippet}

{#if view}
	<div class="wrap" role="status" data-testid="sync-pill">
		{#if values.length > 0}
			<a class="pill" href={resolve('/me')}>{@render body(view)}</a>
		{:else}
			<span class="pill">{@render body(view)}</span>
		{/if}
	</div>
{/if}

<style>
	.wrap {
		margin-bottom: var(--sp-3);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		min-height: 32px;
		padding: 4px 12px;
		border-radius: var(--r-full);
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		text-decoration: none;
	}
	.pill :global(.icon),
	.pill :global(.spinner) {
		flex: none;
	}
	.pill :global(.spinner) {
		border-width: 2px;
	}
</style>
