<script lang="ts">
	import Icon from './Icon.svelte';
	import { toasts, dismissToast } from './toast.svelte';
	import { t } from '$lib/i18n/index.svelte';

	function undo() {
		toasts.current?.undo?.();
		dismissToast();
	}
</script>

<div class="host" role="status" aria-live="polite">
	{#if toasts.current}
		{#key toasts.current.id}
			<div class="toast">
				<span class="msg">{toasts.current.message}</span>
				{#if toasts.current.undo}
					<button type="button" onclick={undo}><Icon name="undo-2" size={18} />{t('common.undo')}</button>
				{/if}
			</div>
		{/key}
	{/if}
</div>

<style>
	.host {
		position: fixed;
		left: max(var(--gutter), env(safe-area-inset-left));
		right: max(var(--gutter), env(safe-area-inset-right));
		bottom: calc(env(safe-area-inset-bottom) + 88px);
		z-index: 25;
		max-width: 528px;
		margin: 0 auto;
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
		background: var(--text);
		color: var(--bg);
		border-radius: var(--r-md);
		box-shadow: var(--shadow-2);
		font-size: var(--fs-callout);
		animation: slide var(--dur-2) var(--ease-out);
	}
	.msg {
		flex: 1;
	}
	button {
		color: var(--bg);
		font-weight: var(--fw-bold);
		padding: 6px 10px;
		border-radius: var(--r-sm);
		background: color-mix(in srgb, var(--bg) 16%, transparent);
		display: inline-flex;
		gap: 6px;
		align-items: center;
		min-height: 36px;
	}
	@keyframes slide {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}
</style>
