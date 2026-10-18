/**
 * Trusted reverse proxy (TRUSTED_PROXY, ARCHITECTURE §9). adapter-node's ADDRESS_HEADER would believe
 * X-Forwarded-For from anyone, so we do not set it. Instead the socket peer is used, and X-Forwarded-For is
 * believed only when the peer is one of the addresses in TRUSTED_PROXY (comma-separated exact IPs).
 * The proxy appends the address it saw, so the last entry is the client.
 */
function normalize(address: string): string {
	const a = address.trim().toLowerCase();
	return a.startsWith('::ffff:') ? a.slice(7) : a;
}

export function trustedProxies(raw: string | undefined = process.env.TRUSTED_PROXY): Set<string> {
	return new Set(
		(raw ?? '')
			.split(',')
			.map(normalize)
			.filter((a) => a.length > 0)
	);
}

export function resolveClientAddress(
	peer: string,
	forwardedFor: string | null,
	trusted: Set<string> = trustedProxies()
): string {
	if (!trusted.has(normalize(peer)) || !forwardedFor) return peer;
	const last = forwardedFor.split(',').pop()?.trim();
	return last ? last : peer;
}
