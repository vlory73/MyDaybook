<script lang="ts">
	import Icon from './Icon.svelte';
	import { acquirePhoto } from '$lib/photos/client';
	import type { AttachmentRef } from '$lib/records/types';

	/**
	 * A decrypted thumbnail. The object URL lives only while this component is mounted (revoked on unmount and on
	 * lock); the image itself is never stored anywhere.
	 */
	let { photo, label, size = 56 }: { photo: AttachmentRef; label: string; size?: number } = $props();

	let url = $state<string | null>(null);
	let failed = $state(false);

	$effect(() => {
		const { url: pending, release } = acquirePhoto(photo, 'thumb');
		let live = true;
		url = null;
		failed = false;
		pending.then(
			(u) => {
				if (live) url = u;
			},
			() => {
				if (live) failed = true;
			}
		);
		return () => {
			live = false;
			url = null;
			release();
		};
	});
</script>

{#if url}
	<img src={url} alt={label} width={size} height={size} />
{:else}
	<span class="ph" class:failed style:width="{size}px" style:height="{size}px" role="img" aria-label={label}>
		<Icon name="camera" size={20} />
	</span>
{/if}

<style>
	img,
	.ph {
		display: block;
		border-radius: var(--r-sm);
		object-fit: cover;
		background: var(--surface-3);
	}
	.ph {
		display: grid;
		place-items: center;
		color: var(--text-3);
	}
	.ph:not(.failed) {
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.6;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ph:not(.failed) {
			animation: none;
		}
	}
</style>
