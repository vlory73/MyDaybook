/**
 * The photo pipeline (ARCHITECTURE §5.2). A picked file is decoded with its EXIF orientation applied, drawn onto a
 * canvas at a limited size and re-encoded as JPEG. Re-encoding through a canvas drops every EXIF/GPS field, and the
 * original file is never kept or uploaded. A small thumbnail is produced as well, so the timeline never has to
 * decrypt a full image.
 */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const FULL_MAX_SIDE = 1600;
export const FULL_QUALITY = 0.8;
export const THUMB_MAX_SIDE = 320;
export const THUMB_QUALITY = 0.7;

export type PhotoErrorCode = 'notImage' | 'tooBig' | 'decode' | 'encode';

export class PhotoError extends Error {
	constructor(readonly code: PhotoErrorCode) {
		super(code);
		this.name = 'PhotoError';
	}
}

/** The size to draw at: the longest side at most `maxSide`, the aspect ratio kept, never upscaled. */
export function fitWithin(width: number, height: number, maxSide: number): { w: number; h: number } {
	const longest = Math.max(width, height);
	if (longest <= maxSide) return { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
	const scale = maxSide / longest;
	return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export type ProcessedPhoto = {
	full: Uint8Array;
	thumb: Uint8Array;
	/** Size of the full image. */
	w: number;
	h: number;
};

function render(
	bitmap: ImageBitmap,
	maxSide: number,
	quality: number
): Promise<{ bytes: Uint8Array; w: number; h: number }> {
	const { w, h } = fitWithin(bitmap.width, bitmap.height, maxSide);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new PhotoError('encode');
	// JPEG has no alpha: paint white first so transparent PNGs do not turn black.
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, w, h);
	ctx.drawImage(bitmap, 0, 0, w, h);
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob || blob.type !== 'image/jpeg') return reject(new PhotoError('encode'));
				blob.arrayBuffer().then(
					(buf) => resolve({ bytes: new Uint8Array(buf), w, h }),
					() => reject(new PhotoError('encode'))
				);
			},
			'image/jpeg',
			quality
		);
	});
}

/** Throws PhotoError (with a code the UI turns into a friendly message) for non-images, huge files and undecodable files. */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
	if (!file.type.startsWith('image/')) throw new PhotoError('notImage');
	if (file.size > MAX_INPUT_BYTES) throw new PhotoError('tooBig');
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		throw new PhotoError('decode');
	}
	try {
		const full = await render(bitmap, FULL_MAX_SIDE, FULL_QUALITY);
		const thumb = await render(bitmap, THUMB_MAX_SIDE, THUMB_QUALITY);
		return { full: full.bytes, thumb: thumb.bytes, w: full.w, h: full.h };
	} finally {
		bitmap.close();
	}
}
