<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Sheet from './Sheet.svelte';
	import { showToast } from './toast.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { closeEditors, editor, leaveSheet, type LogKind } from '$lib/records/editor.svelte';
	import { remove, save, store } from '$lib/records/store.svelte';
	import { deletedText, savedText } from '$lib/records/syncText';
	import { formatAt, toLocalInput } from '$lib/records/time';
	import type { PhotoDrafts } from '$lib/photos/drafts.svelte';
	import type { AttachmentRef, Payload } from '$lib/records/types';

	/**
	 * The frame shared by the entry sheets: opens for one `kind`, fills the form when it opens (`onopen` gets the
	 * saved payload when editing), saves what `payload()` returns, and deletes with an Undo toast (no confirmation).
	 */
	let {
		kind,
		title,
		valid,
		payload,
		onopen,
		onbeforesave,
		alsoSave,
		alsoSavedText,
		time = $bindable(''),
		showTime = true,
		photos,
		saveLabel,
		hideSave = false,
		dock,
		extra,
		children
	}: {
		kind: LogKind;
		title: string;
		valid: boolean;
		/** Builds the record to save, or null when the form is not complete. */
		payload: () => Payload | null;
		onopen: (existing: Payload | null, typeId?: string) => void;
		/** Runs before the entry is saved (for example to also save a saved meal); a failure stops the save. */
		onbeforesave?: () => Promise<void>;
		/** New entries only: more records to save with this one (they are given the saved payload). Undo removes them all. */
		alsoSave?: (saved: Payload) => Payload[];
		/** Toast text for a save that also saved `n` more records. */
		alsoSavedText?: (n: number) => string;
		/** Value for the time chip ("YYYY-MM-DDTHH:mm"); the sheet reads it when it builds the payload. */
		time?: string;
		showTime?: boolean;
		/** Photos of the entry (sheets that offer them). Uploaded when saving; sheets without it keep existing photos as they are. */
		photos?: PhotoDrafts;
		/** Text of the Save button when it is not just "Save". */
		saveLabel?: string;
		/** No Save button on a new entry (the sheet saves with its own buttons); editing still saves normally. */
		hideSave?: boolean;
		/** Content pinned above the buttons at the bottom of the sheet (the body map's panel); it stays in view while the sheet scrolls. */
		dock?: Snippet;
		/** Another button between Delete and Save. */
		extra?: Snippet;
		children: Snippet;
	} = $props();

	let busy = $state(false);
	let failed = $state<'save' | 'delete' | null>(null);
	let kept: AttachmentRef[] | undefined;

	const target = $derived(editor.log?.kind === kind ? editor.log : null);
	const id = $derived(target?.id ?? null);

	// Fill the form whenever the sheet is opened (new entry: now; existing entry: its saved values).
	$effect(() => {
		const current = target;
		if (!current) return;
		untrack(() => {
			const existing = current.id ? (store.items[current.id]?.payload ?? null) : null;
			// An existing entry keeps its own date and time; a new one uses the given time, else now.
			const own = existing && 'at' in existing && typeof existing.at === 'string' ? existing.at : null;
			time = toLocalInput(own ?? (current.id ? undefined : current.at) ?? formatAt(new Date()));
			const same = existing && existing.type === kind ? existing : null;
			kept = same?.attachments;
			photos?.reset(kept);
			onopen(same, current.typeId);
			busy = false;
			failed = null;
		});
	});

	async function onSave() {
		const p = payload();
		if (!p || busy) return;
		busy = true;
		failed = null;
		try {
			await onbeforesave?.();
			if (photos) {
				const refs = await photos.commit();
				if (refs.length > 0) p.attachments = refs;
				else delete p.attachments;
			} else if (kept?.length) {
				p.attachments = kept;
			}
			const savedId = await save(p, id ?? undefined);
			const more = id ? [] : (alsoSave?.(p) ?? []);
			const moreIds: string[] = [];
			for (const m of more) moreIds.push(await save(m));
			void photos?.settle();
			leaveSheet();
			if (moreIds.length === 0) showToast(savedText(t('entry.saved'), savedId));
			else {
				const ids = [savedId, ...moreIds];
				const text = alsoSavedText?.(moreIds.length) ?? t('entry.saved');
				showToast(savedText(text, ...ids), () => {
					Promise.all(ids.map((i) => remove(i))).then(
						() => showToast(t('entry.deleted')),
						() => showToast(t('entry.error.save'))
					);
				});
			}
		} catch {
			// A failed upload is reported by the photo picker itself.
			failed = photos?.problem === 'upload' ? null : 'save';
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
			const message = deletedText(t('entry.deleted'), id); // before the sheet closes: `id` goes with it
			closeEditors();
			showToast(message, () => {
				undo().then(
					() => showToast(t('entry.restored')),
					() => showToast(t('entry.error.save'))
				);
			});
		} catch {
			failed = 'delete';
		} finally {
			busy = false;
		}
	}
</script>

<Sheet bind:open={() => target !== null, (v) => !v && target !== null && leaveSheet()} {title}>
	<div class="form">
		{#if showTime}
			<label class="time-chip">
				<Icon name="clock" size={18} />
				<input type="datetime-local" aria-label={t('entry.time')} bind:value={time} />
			</label>
		{/if}
		{@render children()}
		{#if failed}
			<Notice tone="error">{failed === 'save' ? t('entry.error.save') : t('entry.error.delete')}</Notice>
		{/if}
		<div class={['bottom', { dock: dock !== undefined }]}>
			{#if dock}{@render dock()}{/if}
			<div class="actions">
				{#if id}
					<Button variant="quiet" disabled={busy} onclick={onDelete}>{t('common.delete')}</Button>
				{/if}
				{#if extra}{@render extra()}{/if}
				{#if !(hideSave && !id)}
					<Button disabled={!valid || busy} onclick={onSave}>{saveLabel ?? t('common.save')}</Button>
				{/if}
			</div>
		</div>
	</div>
</Sheet>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.dock {
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		margin: 0 calc(-1 * var(--gutter));
		padding: var(--sp-3) var(--gutter) calc(env(safe-area-inset-bottom) + var(--sp-3));
		background: var(--surface);
		box-shadow: 0 -10px 24px -12px rgb(0 0 0 / 0.18);
	}
	.actions {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-top: var(--sp-2);
	}
	.actions :global(.btn:last-child) {
		margin-left: auto;
	}
	.dock .actions {
		margin-top: 0;
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
	/* Shared look of the sheet contents, which render inside this frame. */
	.form :global(.label) {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: var(--sp-2) 0 calc(-1 * var(--sp-1));
	}
	.form :global(.label .hint) {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.form :global(.chip-row) {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.form :global(textarea) {
		width: 100%;
		min-height: 88px;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
		font-size: var(--fs-body);
		resize: vertical;
	}
	.form :global(textarea::placeholder) {
		color: var(--text-3);
	}
	.form :global(textarea:focus-visible) {
		outline: none;
		border-color: var(--focus);
	}
</style>
