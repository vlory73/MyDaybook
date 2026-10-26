/**
 * Talking to /api/attachments: encrypt and upload a processed photo, fetch and decrypt one for display, delete.
 *
 * Decrypted images exist only as Blob object URLs held in memory. They are never written to IndexedDB or any
 * cache (the service worker ignores /api/), and every URL is revoked on lock, sign-out and when the last view that
 * uses it goes away. The only attachment bytes kept on the device are the ciphertext of photos not yet uploaded
 * (queue.svelte.ts); everything else is downloaded again for each view.
 */
import { ApiError, apiDelete, apiGetBytes, apiPutBytes } from '$lib/api';
import { decryptAttachment, encryptAttachment } from '$lib/crypto/attachments';
import { fromB64, toB64 } from '$lib/crypto/encoding';
import { initCrypto } from '$lib/crypto/sodium';
import { onLock, onSignOut } from '$lib/session.svelte';
import type { AttachmentRef } from '$lib/records/types';
import type { ProcessedPhoto } from './process';
import { dropQueued, queuedBlob, type EncryptedBlob } from './queue.svelte';

const path = (id: string) => `/api/attachments/${id}`;

export type EncryptedPhoto = { ref: AttachmentRef; blobs: [EncryptedBlob, EncryptedBlob] };

/** Encrypts the full image and its thumbnail with fresh keys and ids. Nothing is sent. */
export async function encryptPhoto(photo: ProcessedPhoto): Promise<EncryptedPhoto> {
	await initCrypto();
	const full = encryptAttachment(photo.full);
	const thumb = encryptAttachment(photo.thumb);
	const id = crypto.randomUUID();
	const thumbId = crypto.randomUUID();
	return {
		ref: {
			id,
			key: toB64(full.key),
			thumbId,
			thumbKey: toB64(thumb.key),
			w: photo.w,
			h: photo.h,
			mime: 'image/jpeg'
		},
		blobs: [
			{ id, blob: full.blob },
			{ id: thumbId, blob: thumb.blob }
		]
	};
}

/** Uploads the two blobs of an encrypted photo. Throws ApiError; a refusal removes what was already uploaded. */
export async function sendPhoto(enc: EncryptedPhoto): Promise<void> {
	const [full, thumb] = enc.blobs;
	await apiPutBytes(path(full.id), full.blob);
	try {
		await apiPutBytes(path(thumb.id), thumb.blob);
	} catch (err) {
		if (!(err instanceof ApiError && err.status === 0)) await deleteAttachment(full.id);
		throw err;
	}
}

/** Encrypts and uploads a processed photo. Throws ApiError. */
export async function uploadPhoto(photo: ProcessedPhoto): Promise<AttachmentRef> {
	const enc = await encryptPhoto(photo);
	await sendPhoto(enc);
	return enc.ref;
}

/**
 * Deletes one attachment on the server. Already gone (404) counts as done. A photo that is still only queued on this
 * device is dropped from the queue instead. Returns false when the server could not be reached.
 */
export async function deleteAttachment(id: string): Promise<boolean> {
	if (await dropQueued(id)) return true;
	try {
		await apiDelete(path(id));
		return true;
	} catch (err) {
		return err instanceof ApiError && err.status === 404;
	}
}

export const attachmentIds = (refs: AttachmentRef[]): string[] => refs.flatMap((r) => [r.id, r.thumbId]);

/**
 * Downloads and decrypts the full-size photo, for the data export. The bytes stay in memory only (no object URL, no
 * cache). Throws when it cannot be fetched or does not decrypt.
 */
export async function downloadPhoto(ref: AttachmentRef): Promise<Uint8Array> {
	await initCrypto();
	return decryptAttachment(fromB64(ref.key), await apiGetBytes(path(ref.id)));
}

// ---- Viewing ----

export type PhotoKind = 'thumb' | 'full';
type Entry = { count: number; url: Promise<string> };

let entries = new Map<string, Entry>();
let generation = 0;

async function fetchUrl(id: string, keyB64: string, gen: number): Promise<string> {
	await initCrypto();
	// A photo that was made offline and is not uploaded yet is decrypted from the local ciphertext.
	const blob = (await queuedBlob(id)) ?? (await apiGetBytes(path(id)));
	const bytes = decryptAttachment(fromB64(keyB64), blob);
	// A lock while this was downloading: never create a URL the lock hook could not have revoked.
	if (gen !== generation) throw new Error('locked');
	return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
}

/**
 * Decrypts a photo for display. The returned `release` must be called when the view goes away; the object URL is
 * revoked when the last view that acquired it has released it.
 */
export function acquirePhoto(
	ref: AttachmentRef,
	kind: PhotoKind
): { url: Promise<string>; release: () => void } {
	const id = kind === 'thumb' ? ref.thumbId : ref.id;
	const keyB64 = kind === 'thumb' ? ref.thumbKey : ref.key;
	let entry = entries.get(id);
	if (!entry) {
		const created: Entry = { count: 0, url: fetchUrl(id, keyB64, generation) };
		created.url.catch(() => {
			if (entries.get(id) === created) entries.delete(id);
		});
		entries.set(id, created);
		entry = created;
	}
	entry.count++;
	const mine = entry;
	let released = false;
	return {
		url: mine.url,
		release() {
			if (released) return;
			released = true;
			mine.count--;
			if (mine.count <= 0) {
				if (entries.get(id) === mine) entries.delete(id);
				mine.url.then(
					(u) => URL.revokeObjectURL(u),
					() => {}
				);
			}
		}
	};
}

/** Revokes every object URL (lock, sign-out). Views that still hold a URL promise get nothing usable afterwards. */
export function revokeAllPhotos(): void {
	generation++;
	for (const entry of entries.values()) {
		entry.url.then(
			(u) => URL.revokeObjectURL(u),
			() => {}
		);
	}
	entries = new Map();
}

onLock(revokeAllPhotos);
onSignOut(revokeAllPhotos);
