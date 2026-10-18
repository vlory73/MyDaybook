<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		variant?: 'primary' | 'soft' | 'quiet' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		block?: boolean;
		children: Snippet;
	};
	let {
		variant = 'primary',
		size = 'md',
		block = false,
		type = 'button',
		children,
		...rest
	}: Props = $props();
</script>

<button {type} class={['btn', variant, size, { block }]} {...rest}>{@render children()}</button>

<style>
	.btn {
		min-height: var(--tap);
		padding: 0 var(--sp-5);
		border-radius: var(--r-md);
		font-weight: var(--fw-semibold);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		transition:
			transform var(--dur-1) var(--ease-out),
			background var(--dur-2) var(--ease-out);
	}
	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.primary {
		background: var(--primary);
		color: var(--on-primary);
	}
	.primary:active:not(:disabled) {
		background: var(--primary-press);
	}
	.soft {
		background: var(--primary-soft);
		color: var(--primary-press);
	}
	.quiet {
		background: var(--surface-2);
		color: var(--text);
	}
	/* Soft rather than solid red: readable in both themes, and calm while still clearly set apart. */
	.danger {
		background: var(--pain-tint);
		color: var(--pain-ink);
		box-shadow: inset 0 0 0 1.5px var(--pain-ink);
	}
	.sm {
		min-height: 36px;
		padding: 0 var(--sp-3);
		font-size: var(--fs-callout);
		border-radius: var(--r-sm);
	}
	.lg {
		min-height: 52px;
	}
	.block {
		width: 100%;
	}
</style>
