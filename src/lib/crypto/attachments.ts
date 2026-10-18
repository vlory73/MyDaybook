/**
 * Attachment encryption (ARCHITECTURE §3, §5.2). Every attachment gets a fresh random key, which is stored only inside
 * the encrypted record that references it. The blob is a libsodium secretstream:
 *   blob = header(24) || chunk_1 || ... || chunk_n,  chunk = AEAD(64 KiB of plaintext) = 64 KiB + 17 bytes
 * The plaintext is `length (u32, little endian) || data || zero padding`, padded to a multiple of 64 KiB, so the
 * size on the server only shows the size bucket. The last chunk carries the FINAL tag, so a stream cut short at a
 * chunk boundary fails, as do reordered, altered or extended chunks.
 */
import { KEY_BYTES, randomBytes } from './keys';
import { concat } from './encoding';
import { sodium } from './sodium';

export const CHUNK = 64 * 1024;
const HEADER = 24;
const ABYTES = 17;
const ENC_CHUNK = CHUNK + ABYTES;
/** The largest blob the server accepts (4 MiB); the biggest payload that fits is a little under that. */
export const MAX_BLOB_BYTES = 1.25 * 1024 * 1024;
export const MAX_ATTACHMENT_PLAIN = Math.floor((MAX_BLOB_BYTES - HEADER) / ENC_CHUNK) * CHUNK - 4;

export type EncryptedAttachment = { key: Uint8Array; blob: Uint8Array };

const chunkCount = (length: number) => Math.max(1, Math.ceil((length + 4) / CHUNK));

/** Size of the encrypted blob for `length` bytes of data (a function of the 64 KiB bucket only). */
export function encryptedSize(length: number): number {
	return HEADER + chunkCount(length) * ENC_CHUNK;
}

export function encryptAttachment(data: Uint8Array): EncryptedAttachment {
	if (data.length > MAX_ATTACHMENT_PLAIN) throw new Error('attachment too large');
	const s = sodium();
	const key = randomBytes(KEY_BYTES);
	const chunks = chunkCount(data.length);
	const plain = new Uint8Array(chunks * CHUNK);
	new DataView(plain.buffer).setUint32(0, data.length, true);
	plain.set(data, 4);
	const { state, header } = s.crypto_secretstream_xchacha20poly1305_init_push(key);
	const parts: Uint8Array[] = [header];
	for (let i = 0; i < chunks; i++) {
		const tag =
			i === chunks - 1
				? s.crypto_secretstream_xchacha20poly1305_TAG_FINAL
				: s.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
		parts.push(
			s.crypto_secretstream_xchacha20poly1305_push(
				state,
				plain.subarray(i * CHUNK, (i + 1) * CHUNK),
				null,
				tag
			)
		);
	}
	s.memzero(plain);
	return { key, blob: concat(...parts) };
}

/** Throws on a wrong key, any alteration, reordering, truncation or extension. */
export function decryptAttachment(key: Uint8Array, blob: Uint8Array): Uint8Array {
	const s = sodium();
	const body = blob.length - HEADER;
	if (body < ENC_CHUNK || body % ENC_CHUNK !== 0) throw new Error('bad attachment');
	const chunks = body / ENC_CHUNK;
	const state = s.crypto_secretstream_xchacha20poly1305_init_pull(blob.subarray(0, HEADER), key);
	const plain = new Uint8Array(chunks * CHUNK);
	for (let i = 0; i < chunks; i++) {
		const start = HEADER + i * ENC_CHUNK;
		const res = s.crypto_secretstream_xchacha20poly1305_pull(
			state,
			blob.subarray(start, start + ENC_CHUNK),
			null
		);
		if (!res) throw new Error('bad attachment');
		const isFinal = res.tag === s.crypto_secretstream_xchacha20poly1305_TAG_FINAL;
		if (isFinal !== (i === chunks - 1)) throw new Error('bad attachment');
		plain.set(res.message, i * CHUNK);
	}
	const length = new DataView(plain.buffer).getUint32(0, true);
	if (length > plain.length - 4) throw new Error('bad attachment');
	return plain.slice(4, 4 + length);
}
