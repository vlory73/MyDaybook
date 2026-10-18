import { createHmac } from 'node:crypto';

// A tiny test-side copy of RFC 6238 (SHA-1, 6 digits, 30 s) so the e2e tests do not depend on the server module.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of text.replace(/[\s=-]/g, '').toUpperCase()) {
		value = (value << 5) | B32.indexOf(ch);
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
			value &= (1 << bits) - 1;
		}
	}
	return Buffer.from(out);
}

/** The code for the 30 s step that contains `now + offsetSteps * 30 s`. */
export function codeFor(secret: string, offsetSteps = 0, now = Date.now()): string {
	const counter = Math.floor(now / 30_000) + offsetSteps;
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(counter));
	const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
	const off = h[h.length - 1]! & 15;
	const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
	return String(bin % 1_000_000).padStart(6, '0');
}

/** A six-digit code that none of the accepted steps (now -1, 0, +1) produces. */
export function wrongCode(secret: string): string {
	const valid = new Set([-1, 0, 1].map((o) => codeFor(secret, o)));
	for (let n = 0; n < 1_000_000; n += 7919) {
		const c = String(n).padStart(6, '0');
		if (!valid.has(c)) return c;
	}
	return '000001';
}
