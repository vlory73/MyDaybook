<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	/** A calm message box. Errors are announced at once (role=alert); the rest are announced politely. */
	let { tone = 'info', children }: { tone?: 'info' | 'error' | 'warn' | 'offline'; children: Snippet } =
		$props();
</script>

<div class="notice {tone}" role={tone === 'error' ? 'alert' : 'status'}>
	<Icon name={tone === 'offline' ? 'cloud-off' : 'info'} size={20} />
	<p>{@render children()}</p>
</div>

<style>
	.notice {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-md);
		font-size: var(--fs-callout);
	}
	.notice :global(.icon) {
		margin-top: 1px;
	}
	.info {
		background: var(--surface-2);
		color: var(--text);
	}
	.error {
		background: var(--pain-tint);
		color: var(--pain-ink);
	}
	.offline {
		background: var(--measure-tint);
		color: var(--measure-ink);
		font-weight: var(--fw-medium);
	}
	.warn {
		background: var(--note-tint);
		color: var(--note-ink);
	}
</style>
