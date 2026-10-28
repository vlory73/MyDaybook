<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * Bottom sheet built on the native <dialog>: focus is trapped and Escape closes it for free.
	 * Tapping the backdrop closes it too.
	 */
	let {
		open = $bindable(false),
		title,
		header,
		wrapTitle = false,
		children
	}: {
		open?: boolean;
		title: string;
		header?: Snippet;
		/** Let a long title wrap onto more lines instead of being cut with an ellipsis. */
		wrapTitle?: boolean;
		children: Snippet;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	function onclick(event: MouseEvent) {
		if (event.target === dialog) open = false;
	}
</script>

<dialog bind:this={dialog} aria-label={title} {onclick} onclose={() => (open = false)}>
	<div class="sheet">
		<div class="grabber" aria-hidden="true"></div>
		<div class="head">
			<h2 class={{ wrap: wrapTitle }}>{title}</h2>
			{#if header}{@render header()}{/if}
			<button type="button" class="close" aria-label={t('common.close')} onclick={() => (open = false)}>
				<Icon name="x" />
			</button>
		</div>
		{@render children()}
	</div>
</dialog>

<style>
	dialog {
		margin: auto 0 0;
		width: 100%;
		max-width: 100%;
		max-height: calc(100dvh - env(safe-area-inset-top) - 24px);
		/* The sheet scrolls on its own; reaching its end does not hand the swipe to the page behind. */
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
	}
	dialog::backdrop {
		background: var(--scrim);
	}
	dialog[open] .sheet {
		animation: rise var(--dur-3) var(--ease-out);
	}
	.sheet {
		max-width: 560px;
		margin: 0 auto;
		background: var(--surface);
		border-radius: var(--r-xl) var(--r-xl) 0 0;
		padding: var(--sp-2) var(--gutter) calc(env(safe-area-inset-bottom) + var(--sp-4));
		box-shadow: 0 -8px 30px rgb(0 0 0 / 0.12);
	}
	.grabber {
		width: 38px;
		height: 5px;
		border-radius: 3px;
		background: var(--surface-3);
		margin: 0 auto var(--sp-3);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
	}
	h2 {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
	}
	h2.wrap {
		white-space: normal;
		overflow: visible;
		text-overflow: clip;
	}
	.close {
		width: var(--tap);
		height: var(--tap);
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		color: var(--text-2);
		margin-right: calc(-1 * var(--sp-2));
	}
	@keyframes rise {
		from {
			transform: translateY(40px);
			opacity: 0;
		}
	}
</style>
