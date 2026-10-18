/**
 * The photos of the entry being edited in a sheet: photos already saved with the entry, and new ones that were
 * picked but not uploaded yet. Nothing leaves the device until Save: `commit()` encrypts and uploads the new ones.
 */
import { ApiError } from '$lib/api';
import { onLock } from '$lib/session.svelte';
import { MAX_ATTACHMENTS, type AttachmentRef } from '$lib/records/types';
import { deleteAttachment, attachmentIds, uploadPhoto } from './client';
import { PhotoError, processPhoto, type PhotoErrorCode, type ProcessedPhoto } from './process';

export type Draft =
	| { kind: 'saved'; key: string; ref: AttachmentRef }
	| { kind: 'new'; key: string; photo: ProcessedPhoto; preview: string };

export type PhotoProblem = PhotoErrorCode | 'limit' | 'upload';

export class PhotoDrafts {
	items = $state<Draft[]>([]);
	/** Number of files still being prepared. */
	preparing = $state(0);
	/** Upload progress while saving. */
	progress = $state<{ done: number; total: number } | null>(null);
	problem = $state<PhotoProblem | null>(null);

	#original: AttachmentRef[] = [];
	#serial = 0;
	#unlisten: () => void;

	constructor() {
		// Previews are decrypted-image object URLs of this device: revoke them when the diary locks.
		this.#unlisten = onLock(() => this.dispose());
	}

	get full(): boolean {
		return this.items.length + this.preparing >= MAX_ATTACHMENTS;
	}

	/** Start from the photos the entry already has (none for a new entry). */
	reset(refs: AttachmentRef[] = []): void {
		void this.discardUnsaved();
		this.#revokePreviews();
		this.#original = refs;
		this.items = refs.map((ref) => ({ kind: 'saved', key: `s${this.#serial++}`, ref }));
		this.preparing = 0;
		this.progress = null;
		this.problem = null;
	}

	/** Prepares picked files (decode, resize, strip metadata) and adds them, up to the limit per entry. */
	async add(files: Iterable<File>): Promise<void> {
		this.problem = null;
		for (const file of files) {
			if (this.full) {
				this.problem = 'limit';
				break;
			}
			this.preparing++;
			try {
				const photo = await processPhoto(file);
				const preview = URL.createObjectURL(new Blob([photo.thumb as BlobPart], { type: 'image/jpeg' }));
				this.items = [...this.items, { kind: 'new', key: `n${this.#serial++}`, photo, preview }];
			} catch (err) {
				this.problem = err instanceof PhotoError ? err.code : 'decode';
			} finally {
				this.preparing--;
			}
		}
	}

	remove(key: string): void {
		const gone = this.items.find((d) => d.key === key);
		if (gone?.kind === 'new') URL.revokeObjectURL(gone.preview);
		this.items = this.items.filter((d) => d.key !== key);
		this.problem = null;
	}

	/**
	 * Uploads the new photos and returns the final reference list. A photo that is uploaded stays uploaded when a
	 * later one fails, so trying Save again does not repeat it. Throws when an upload fails.
	 */
	async commit(): Promise<AttachmentRef[]> {
		const total = this.items.filter((d) => d.kind === 'new').length;
		let done = 0;
		this.problem = null;
		try {
			if (total > 0) this.progress = { done, total };
			for (const draft of [...this.items]) {
				if (draft.kind !== 'new') continue;
				const ref = await uploadPhoto(draft.photo);
				URL.revokeObjectURL(draft.preview);
				this.items = this.items.map((d) => (d.key === draft.key ? { kind: 'saved', key: d.key, ref } : d));
				this.progress = { done: ++done, total };
			}
		} catch (err) {
			this.problem = 'upload';
			throw err instanceof ApiError ? err : new Error('upload failed');
		} finally {
			this.progress = null;
		}
		return this.items.flatMap((d) => (d.kind === 'saved' ? [d.ref] : []));
	}

	/** Photos the entry had when the sheet opened that are no longer in the list (to delete after a successful save). */
	removed(): AttachmentRef[] {
		const kept = this.items.flatMap((d) => (d.kind === 'saved' ? [d.ref.id] : []));
		return this.#original.filter((r) => !kept.includes(r.id));
	}

	/** After a successful save: delete the removed photos on the server (best effort, no Undo for edits). */
	async settle(): Promise<void> {
		const gone = this.removed();
		this.#original = this.items.flatMap((d) => (d.kind === 'saved' ? [d.ref] : []));
		await Promise.all(attachmentIds(gone).map(deleteAttachment));
	}

	/** Photos uploaded in this sheet but not part of what was saved (the save failed and the sheet was closed). */
	async discardUnsaved(): Promise<void> {
		const original = this.#original.map((r) => r.id);
		const stray = this.items.flatMap((d) =>
			d.kind === 'saved' && !original.includes(d.ref.id) ? [d.ref] : []
		);
		await Promise.all(attachmentIds(stray).map(deleteAttachment));
	}

	/** Revokes previews and forgets everything; also called on lock. Uploaded-but-unsaved photos are cleaned up. */
	dispose(): void {
		void this.discardUnsaved();
		this.#revokePreviews();
		this.items = [];
	}

	/** For when the component goes away. */
	destroy(): void {
		this.dispose();
		this.#unlisten();
	}

	#revokePreviews(): void {
		for (const d of this.items) if (d.kind === 'new') URL.revokeObjectURL(d.preview);
	}
}
