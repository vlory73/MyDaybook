<script lang="ts">
	/** Decorative; the surrounding text says what is happening. */
	let { size = 40 }: { size?: number } = $props();
</script>

<span class="spinner" aria-hidden="true" style:width="{size}px" style:height="{size}px"></span>

<style>
	.spinner {
		display: inline-block;
		border-radius: 50%;
		border: 4px solid var(--surface-3);
		border-top-color: var(--primary);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 3s;
		}
	}
</style>
