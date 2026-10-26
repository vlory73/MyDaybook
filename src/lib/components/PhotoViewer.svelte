<script lang="ts">
	import Icon from './Icon.svelte';
	import Spinner from './Spinner.svelte';
	import { connection } from '$lib/connection.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { acquirePhoto } from '$lib/photos/client';
	import { closePhoto, viewer } from '$lib/photos/viewer.svelte';

	/** Full-screen view of one photo: decrypted when opened, the object URL revoked when closed or locked. */
	let dialog: HTMLDialogElement | undefined = $state();
	let url = $state<string | null>(null);
	let failed = $state(false);

	$effect(() => {
		const photo = viewer.photo;
		if (!dialog) return;
		if (!photo) {
			if (dialog.open) dialog.close();
			return;
		}
		if (!dialog.open) dialog.showModal();
		const { url: pending, release } = acquirePhoto(photo, 'full');
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

<dialog
	bind:this={dialog}
	aria-label={t('photo.viewer')}
	onclose={closePhoto}
	onclick={(e) => e.target === dialog && closePhoto()}
>
	<button type="button" class="close" aria-label={t('common.close')} onclick={closePhoto}>
		<Icon name="x" size={24} />
	</button>
	{#if url}
		<img src={url} alt={t('photo.alt')} />
	{:else if failed}
		<p role="alert">{connection.online ? t('photo.loadFailed') : t('photo.offlineTile')}</p>
	{:else}
		<div role="status"><Spinner size={32} /><span class="sr-only">{t('common.loading')}</span></div>
	{/if}
</dialog>

<style>
	dialog {
		position: fixed;
		inset: 0;
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		border: 0;
		background: #000;
		color: #fff;
	}
	dialog[open] {
		display: grid;
		place-items: center;
	}
	img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	p {
		padding: var(--sp-4);
	}
	.close {
		position: absolute;
		top: calc(env(safe-area-inset-top) + var(--sp-3));
		right: var(--sp-3);
		z-index: 1;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		background: rgb(0 0 0 / 0.55);
		color: #fff;
		border: 1px solid rgb(255 255 255 / 0.35);
	}
	.close:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
