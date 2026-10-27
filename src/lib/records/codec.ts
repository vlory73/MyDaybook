/**
 * Pure helpers between the store and the crypto core: seal a payload for the server, open what came back.
 * The associated data binds every record to its user and id (see $lib/crypto/records), so the server cannot
 * swap one record for another without the decryption failing.
 */
import { fromB64, toB64 } from '$lib/crypto/encoding';
import { decryptRecord, encryptRecord } from '$lib/crypto/records';
import { dayKey, instant } from './time';
import { parsePayload, hasAt, type Payload, type TimedPayload } from './types';

export type Wire = {
	id: string;
	wrappedKey: string | null;
	ciphertext: string | null;
	rev: number;
	updatedAt: number;
	deletedAt: number | null;
};

/** A record as kept in the IndexedDB cache: ciphertext only. */
export type CachedRecord = {
	id: string;
	wrappedKey: Uint8Array | null;
	ciphertext: Uint8Array | null;
	rev: number;
	updatedAt: number;
	deletedAt: number | null;
};

/** A decrypted record held in memory. */
export type StoredRecord<P extends Payload = Payload> = {
	id: string;
	rev: number;
	updatedAt: number;
	payload: P;
};

export function seal(kek: Uint8Array, userId: string, id: string, payload: Payload) {
	const enc = encryptRecord(kek, userId, id, payload);
	return { wrappedKey: toB64(enc.wrappedKey), ciphertext: toB64(enc.ciphertext) };
}

export function wireToCached(w: Wire): CachedRecord {
	return {
		id: w.id,
		wrappedKey: w.wrappedKey ? fromB64(w.wrappedKey) : null,
		ciphertext: w.ciphertext ? fromB64(w.ciphertext) : null,
		rev: w.rev,
		updatedAt: w.updatedAt,
		deletedAt: w.deletedAt
	};
}

export type Opened =
	{ ok: true; payload: Payload } | { ok: false; reason: 'tombstone' | 'undecryptable' | 'invalid' };

/** Decrypts and validates. Never throws: a record that fails is reported so the caller can skip and count it. */
export function open(kek: Uint8Array, userId: string, rec: CachedRecord): Opened {
	if (rec.deletedAt !== null || !rec.wrappedKey || !rec.ciphertext) return { ok: false, reason: 'tombstone' };
	let raw: unknown;
	try {
		raw = decryptRecord(kek, userId, rec.id, { wrappedKey: rec.wrappedKey, ciphertext: rec.ciphertext });
	} catch {
		return { ok: false, reason: 'undecryptable' };
	}
	const payload = parsePayload(raw);
	return payload ? { ok: true, payload } : { ok: false, reason: 'invalid' };
}

// ---- Selectors over decrypted records ----

type Timed = StoredRecord<TimedPayload>;

const isTimed = (r: StoredRecord): r is Timed => hasAt(r.payload);

/** At the same time, a meal comes before the drinks logged with it. */
const sameTimeRank = (r: Timed) => (r.payload.type === 'food' ? 0 : 1);

/** Records of one local day, earliest first. */
export function recordsForDay(all: Iterable<StoredRecord>, day: string): Timed[] {
	const out: Timed[] = [];
	for (const r of all) if (isTimed(r) && dayKey(r.payload.at) === day) out.push(r);
	return out.sort(
		(a, b) =>
			instant(a.payload.at) - instant(b.payload.at) ||
			sameTimeRank(a) - sameTimeRank(b) ||
			a.id.localeCompare(b.id)
	);
}

/** Day keys in [from, to] (inclusive, as "YYYY-MM-DD") that have at least one entry. */
export function daysWithEntries(all: Iterable<StoredRecord>, from: string, to: string): Set<string> {
	const days = new Set<string>();
	for (const r of all) {
		if (!isTimed(r)) continue;
		const d = dayKey(r.payload.at);
		if (d >= from && d <= to) days.add(d);
	}
	return days;
}
