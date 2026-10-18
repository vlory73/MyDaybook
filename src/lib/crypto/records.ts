/**
 * Record envelope v1 (ARCHITECTURE §5):
 *   wrappedKey = nonce(24) || AEAD_KEK(EK)            AD = rec/v1/<userId>/<recordId>
 *   ciphertext = 0x01 || nonce(24) || AEAD_EK(pad(JSON))   same AD
 * Padding to size buckets keeps the record type from showing through its length.
 */
import { ad, KEY_BYTES, randomBytes, unwrap, wrap } from './keys';
import { concat, utf8 } from './encoding';
import { sodium } from './sodium';

export const RECORD_VERSION = 1;
const BUCKETS = [256, 512, 1024, 2048, 4096];
const LARGE_STEP = 4096;

/** The padded length for a plaintext of `length` bytes (padding always adds at least one byte). */
export function paddedLength(length: number): number {
	const needed = length + 1;
	for (const b of BUCKETS) if (needed <= b) return b;
	return Math.ceil(needed / LARGE_STEP) * LARGE_STEP;
}

export function pad(data: Uint8Array): Uint8Array {
	return sodium().pad(data, paddedLength(data.length));
}

export function unpad(data: Uint8Array): Uint8Array {
	return sodium().unpad(data, data.length);
}

export type EncryptedRecord = { wrappedKey: Uint8Array; ciphertext: Uint8Array };

export function encryptRecord(
	kek: Uint8Array,
	userId: string,
	recordId: string,
	value: unknown
): EncryptedRecord {
	const s = sodium();
	const recordKey = randomBytes(KEY_BYTES);
	const assoc = ad.recordKey(userId, recordId);
	const nonce = randomBytes(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
	const body = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
		pad(utf8.encode(JSON.stringify(value))),
		utf8.encode(assoc),
		null,
		nonce,
		recordKey
	);
	const wrappedKey = wrap(recordKey, kek, assoc);
	s.memzero(recordKey);
	return { wrappedKey, ciphertext: concat(Uint8Array.of(RECORD_VERSION), nonce, body) };
}

/** Throws if anything doesn't match: wrong key, wrong user/record id, tampering, unknown version. */
export function decryptRecord<T = unknown>(
	kek: Uint8Array,
	userId: string,
	recordId: string,
	record: EncryptedRecord
): T {
	const s = sodium();
	const n = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
	if (record.ciphertext[0] !== RECORD_VERSION) throw new Error('unsupported record version');
	const assoc = ad.recordKey(userId, recordId);
	const recordKey = unwrap(record.wrappedKey, kek, assoc);
	try {
		const plain = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
			null,
			record.ciphertext.subarray(1 + n),
			utf8.encode(assoc),
			record.ciphertext.subarray(1, 1 + n),
			recordKey
		);
		return JSON.parse(utf8.decode(unpad(plain))) as T;
	} finally {
		s.memzero(recordKey);
	}
}

/** Re-wraps a record key under a new KEK (MK rotation at handover): headers change, content doesn't. */
export function rewrapRecordKey(
	oldKek: Uint8Array,
	newKek: Uint8Array,
	userId: string,
	recordId: string,
	wrappedKey: Uint8Array
): Uint8Array {
	const assoc = ad.recordKey(userId, recordId);
	const recordKey = unwrap(wrappedKey, oldKek, assoc);
	try {
		return wrap(recordKey, newKek, assoc);
	} finally {
		sodium().memzero(recordKey);
	}
}
