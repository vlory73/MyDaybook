<script lang="ts">
	import Button from './Button.svelte';
	import Sheet from './Sheet.svelte';
	import { t, tn } from '$lib/i18n/index.svelte';

	/** Shown before signing out while changes made on this device have not reached the server: they would be lost. */
	let {
		open = $bindable(false),
		count,
		onconfirm
	}: { open?: boolean; count: number; onconfirm: () => void } = $props();
</script>

<Sheet bind:open wrapTitle title={tn('outbox.signout.title', count)}>
	<div class="warn" data-testid="signout-warning">
		<p class="muted">{tn('outbox.signout.body', count)}</p>
		<Button block size="lg" onclick={() => (open = false)}>{t('outbox.signout.stay')}</Button>
		<Button
			variant="quiet"
			block
			style="color: var(--pain-ink); background: transparent"
			onclick={() => {
				open = false;
				onconfirm();
			}}>{tn('outbox.signout.go', count)}</Button
		>
	</div>
</Sheet>

<style>
	.warn {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding-bottom: var(--sp-2);
	}
	.warn p {
		margin-bottom: var(--sp-2);
	}
</style>
