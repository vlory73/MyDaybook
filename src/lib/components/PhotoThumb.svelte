<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { connection } from '$lib/connection.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { acquirePhoto } from '$lib/photos/client';
	import { photoQueue } from '$lib/photos/queue.svelte';
	import type { AttachmentRef } from '$lib/records/types';

	/**
	 * A decrypted thumbnail. The object URL lives only while this component is mounted (revoked on unmount and on
	 * lock); the image itself is never stored anywhere. A photo that is only queued on this device (made offline) is
	 * decrypted from the local ciphertext and wears a "Waiting to upload" badge, in a wider tile so the words fit; a
	 * photo that is on the server cannot be fetched offline and shows a calm placeholder until the connection is back.
	 */
	let { photo, label, size = 56 }: { photo: AttachmentRef; label: string; size?: number } = $props();

	let url = $state<string | null>(null);
	let failed = $state(false);
	let failedOffline = $state(false);
	let attempt = $state(0);

	const queued = $derived(photo.thumbId in photoQueue.ids || photo.id in photoQueue.ids);
	const width = $derived(queued ? Math.max(size * 2, 128) : size);
	const offlinePlaceholder = $derived(failed && failedOffline && !connection.online);

	// Back online after a failure that happened offline: try again once.
	$effect(() => {
		if (connection.online && untrack(() => failed && failedOffline)) attempt++;
	});

	$effect(() => {
		void attempt;
		const { url: pending, release } = acquirePhoto(photo, 'thumb');
		let live = true;
		url = null;
		failed = false;
		failedOffline = false;
		pending.then(
			(u) => {
				if (live) url = u;
			},
			() => {
				if (live) {
					failed = true;
					failedOffline = !connection.online;
				}
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
	<span class="wrap" style:width="{width}px" style:height="{size}px" data-queued={queued || undefined}>
		<img src={url} alt={label} {width} height={size} />
		{#if queued}
			<span class="badge" data-testid="photo-queued">
				<Icon name="clock" size={12} />{t('photo.queued')}
			</span>
		{/if}
	</span>
{:else}
	<span
		class="ph"
		class:failed
		style:width="{width}px"
		style:height="{size}px"
		role="img"
		aria-label={offlinePlaceholder ? t('photo.offlineTile') : label}
		title={offlinePlaceholder ? t('photo.offlineTile') : undefined}
		data-testid={offlinePlaceholder ? 'photo-offline-tile' : undefined}
	>
		<Icon name="camera" size={20} />
	</span>
{/if}

<style>
	.wrap {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: var(--r-sm);
	}
	.badge {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		gap: 4px;
		align-items: center;
		justify-content: center;
		padding: 3px 4px;
		background: rgb(42 36 48 / 0.86);
		color: #fff;
		font-size: 11px;
		font-weight: var(--fw-semibold);
		line-height: 1.2;
		white-space: nowrap;
	}
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
