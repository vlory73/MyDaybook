import { sodium } from './sodium';

/** URL-safe base64 without padding: how binary values travel in JSON. */
export function toB64(bytes: Uint8Array): string {
	const s = sodium();
	return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING);
}

export function fromB64(text: string): Uint8Array {
	const s = sodium();
	return s.from_base64(text, s.base64_variants.URLSAFE_NO_PADDING);
}

export const utf8 = {
	encode: (text: string): Uint8Array => new TextEncoder().encode(text),
	decode: (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
};

export function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

// Crockford base32: no I, L, O or U, so the recovery key is easy to read aloud and retype.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function toCrockford(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += CROCKFORD[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
	return out;
}

/** Lenient decode: case-insensitive, ignores spaces and dashes, reads I/L as 1 and O as 0. */
export function fromCrockford(text: string, byteLength: number): Uint8Array | null {
	const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
	if (clean.length !== Math.ceil((byteLength * 8) / 5)) return null;
	const out = new Uint8Array(byteLength);
	let bits = 0;
	let value = 0;
	let index = 0;
	for (const ch of clean) {
		const digit = CROCKFORD.indexOf(ch);
		if (digit < 0) return null;
		value = ((value << 5) | digit) & 0xffff;
		bits += 5;
		if (bits >= 8) {
			if (index < byteLength) out[index++] = (value >>> (bits - 8)) & 0xff;
			bits -= 8;
		}
	}
	return index === byteLength ? out : null;
}
