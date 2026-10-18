<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import PhotoThumb from './PhotoThumb.svelte';
	import Spinner from './Spinner.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import type { PhotoDrafts } from '$lib/photos/drafts.svelte';

	/** Photo button, previews with remove (x), and messages for one entry sheet. The sheet owns `drafts`. */
	let { drafts }: { drafts: PhotoDrafts } = $props();

	onDestroy(() => drafts.destroy());

	function onchange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		void drafts.add(files);
	}
</script>

<div class="photos">
	<p class="plabel">{t('photo.label')}<span class="hint">{t('common.optional')}</span></p>
	<div class="row">
		{#each drafts.items as d, i (d.key)}
			<div class="tile">
				{#if d.kind === 'new'}
					<img src={d.preview} alt={t('photo.alt')} width="64" height="64" />
				{:else}
					<PhotoThumb photo={d.ref} label={t('photo.alt')} size={64} />
				{/if}
				<button
					type="button"
					class="rm"
					aria-label={t('photo.remove', { n: i + 1 })}
					onclick={() => drafts.remove(d.key)}><Icon name="x" size={14} /></button
				>
			</div>
		{/each}
		{#if drafts.preparing > 0}
			<div class="tile wait" role="status">
				<Spinner size={22} /><span class="sr-only">{t('photo.preparing')}</span>
			</div>
		{/if}
		{#if !drafts.full}
			<label class="add">
				<Icon name="camera" size={22} />
				<span>{drafts.items.length > 0 ? t('photo.addAnother') : t('photo.add')}</span>
				<input type="file" accept="image/*" multiple {onchange} />
			</label>
		{/if}
	</div>
	{#if drafts.progress}
		<p class="muted small" role="status">
			{t('photo.uploading', { done: drafts.progress.done + 1, total: drafts.progress.total })}
		</p>
	{/if}
	{#if drafts.problem}
		<Notice tone="error">{t(`photo.error.${drafts.problem}` as MessageKey)}</Notice>
	{/if}
	{#if drafts.items.length === 0}
		<p class="muted small">{t('photo.privacy')}</p>
	{/if}
</div>

<style>
	.photos {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.plabel {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin-top: var(--sp-2);
	}
	.hint {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.tile {
		position: relative;
		width: 64px;
		height: 64px;
	}
	.tile img {
		display: block;
		border-radius: var(--r-sm);
		object-fit: cover;
	}
	.wait {
		display: grid;
		place-items: center;
		border-radius: var(--r-sm);
		background: var(--surface-2);
	}
	.rm {
		position: absolute;
		top: -6px;
		right: -6px;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border-radius: var(--r-full);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-1);
	}
	.rm:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.add {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
		cursor: pointer;
	}
	.add:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	/* The native input covers the label so a tap opens the picker (camera or library on a phone). */
	.add input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		cursor: pointer;
	}
</style>
