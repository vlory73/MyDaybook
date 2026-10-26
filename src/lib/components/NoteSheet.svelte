<script lang="ts">
	import { untrack } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import Sheet from './Sheet.svelte';
	import { showToast } from './toast.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { PhotoDrafts } from '$lib/photos/drafts.svelte';
	import { closeEditors, editor } from '$lib/records/editor.svelte';
	import { remove, save, store } from '$lib/records/store.svelte';
	import { deletedText, savedText } from '$lib/records/syncText';
	import { formatAt, fromLocalInput, toLocalInput } from '$lib/records/time';
	import type { NotePayload } from '$lib/records/types';

	const photos = new PhotoDrafts();
	let text = $state('');
	let local = $state('');
	let tags = $state<string[]>([]);
	let area: HTMLTextAreaElement | undefined = $state();
	let busy = $state(false);
	let failed = $state<'save' | 'delete' | null>(null);

	const id = $derived(editor.note?.id ?? null);

	// Fill the form whenever the sheet is opened (new note: now; existing note: its saved values).
	$effect(() => {
		const target = editor.note;
		if (!target) return;
		untrack(() => {
			const existing = target.id ? store.items[target.id]?.payload : undefined;
			const note = existing?.type === 'note' ? existing : null;
			text = note?.text ?? '';
			tags = note?.tags ?? [];
			photos.reset(note?.attachments);
			local = toLocalInput(note?.at ?? formatAt(new Date()));
			busy = false;
			failed = null;
			setTimeout(() => area?.focus(), 50);
		});
	});

	const valid = $derived(text.trim().length > 0 && fromLocalInput(local) !== null);

	async function onSave() {
		const at = fromLocalInput(local);
		if (!at || busy || text.trim() === '') return;
		busy = true;
		failed = null;
		const payload: NotePayload = { v: 1, type: 'note', at, text: text.trim(), tags };
		try {
			const refs = await photos.commit();
			if (refs.length > 0) payload.attachments = refs;
			const savedId = await save(payload, id ?? undefined);
			void photos.settle();
			closeEditors();
			showToast(savedText(t('note.saved'), savedId));
		} catch {
			failed = photos.problem === 'upload' ? null : 'save';
		} finally {
			busy = false;
		}
	}

	async function onDelete() {
		if (!id || busy) return;
		busy = true;
		failed = null;
		try {
			const undo = await remove(id);
			const message = deletedText(t('note.deleted'), id); // before the sheet closes: `id` goes with it
			closeEditors();
			showToast(message, () => {
				undo().then(
					() => showToast(t('note.restored')),
					() => showToast(t('note.error.save'))
				);
			});
		} catch {
			failed = 'delete';
		} finally {
			busy = false;
		}
	}
</script>

<Sheet
	bind:open={() => editor.note !== null, (v) => !v && closeEditors()}
	title={id ? t('note.title.edit') : t('note.title.new')}
>
	<div class="form">
		<label class="time-chip">
			<Icon name="clock" size={18} />
			<input type="datetime-local" aria-label={t('note.time')} bind:value={local} />
		</label>
		<textarea
			bind:this={area}
			rows="6"
			aria-label={t('note.text')}
			placeholder={t('note.placeholder')}
			maxlength="8000"
			bind:value={text}
		></textarea>
		<PhotoPicker drafts={photos} />
		{#if failed}
			<Notice tone="error">{failed === 'save' ? t('note.error.save') : t('note.error.delete')}</Notice>
		{/if}
		<div class="actions">
			{#if id}
				<Button variant="quiet" disabled={busy} onclick={onDelete}>{t('common.delete')}</Button>
			{/if}
			<Button disabled={!valid || busy} onclick={onSave}>{t('common.save')}</Button>
		</div>
	</div>
</Sheet>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	textarea {
		width: 100%;
		min-height: 140px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
		resize: vertical;
	}
	textarea::placeholder {
		color: var(--text-3);
	}
	textarea:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.actions {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.actions :global(.btn:last-child) {
		margin-left: auto;
	}
	.time-chip {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 12px;
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
	}
	.time-chip input {
		border: 0;
		background: transparent;
		min-height: 32px;
		font-size: inherit;
		font-weight: inherit;
		/* No max-width: 12-hour formats need room for AM/PM (times follow the phone's setting). */
	}
</style>
