<script lang="ts">
	import Button from './Button.svelte';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import { openEntry } from '$lib/records/openEntry';
	import { flushOutbox, store } from '$lib/records/store.svelte';

	/** Me → Sync: shown only while something made on this device has not reached the server. */
	const ids = $derived(Object.keys(store.pending));
	const refusedIds = $derived(ids.filter((id) => store.pending[id] === 'refused'));
	const waiting = $derived(ids.length - refusedIds.length);
	// "Show entry" needs something to show: a refused delete has no entry on screen any more.
	const showable = $derived(refusedIds.find((id) => store.items[id]));

	const lastSynced = $derived.by(() => {
		const at = store.lastSyncedAt;
		if (!at) return null;
		const date = new Date(at);
		const time = new Intl.DateTimeFormat(i18n.locale, { hour: '2-digit', minute: '2-digit' }).format(date);
		if (date.toDateString() === new Date().toDateString()) return t('outbox.card.lastToday', { time });
		return new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }).format(date) + ` ${time}`;
	});
</script>

{#if ids.length > 0}
	<Card title={t('outbox.card.title')}>
		<div class="sync" data-testid="sync-card">
			{#if waiting > 0}
				<p class="line"><strong>{tn('outbox.card.waiting', waiting)}</strong></p>
				{#if lastSynced}<p class="small muted">{t('outbox.card.last', { when: lastSynced })}</p>{/if}
				<div class="buttons">
					<Button variant="quiet" size="sm" disabled={store.flushing} onclick={() => flushOutbox()}>
						{#if store.flushing}<Spinner size={16} />{/if}{t('outbox.card.tryNow')}
					</Button>
				</div>
			{/if}
			{#if refusedIds.length > 0}
				<p class="line warn">
					<Icon name="clock-alert" size={18} /><strong>{tn('outbox.card.refused', refusedIds.length)}</strong>
				</p>
				<p class="small muted">{tn('outbox.card.refusedBody', refusedIds.length)}</p>
				<div class="buttons">
					<Button
						variant="soft"
						size="sm"
						disabled={store.flushing}
						onclick={() => flushOutbox({ retryRefused: true })}>{t('outbox.card.tryAgain')}</Button
					>
					{#if showable}
						<Button variant="quiet" size="sm" onclick={() => openEntry(showable)}
							>{t('outbox.card.show')}</Button
						>
					{/if}
				</div>
			{/if}
		</div>
	</Card>
{/if}

<style>
	.sync {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.line {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.warn {
		color: var(--pain-ink);
		margin-top: var(--sp-2);
	}
	.buttons {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
</style>
