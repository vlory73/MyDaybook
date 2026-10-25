/**
 * In-memory token buckets (ARCHITECTURE §8). One bucket per key; each attempt takes one token and the bucket
 * refills evenly over `windowMs`. Optionally, consecutive failures on a key add an exponential lock-out.
 * State is per process and lost on restart, which is acceptable for a single-container deployment.
 */
export type LimiterOptions = {
	burst: number;
	windowMs: number;
	/** Exponential lock-out after this many consecutive failures; 0 disables it. */
	backoffAfter?: number;
	backoffBaseMs?: number;
	backoffMaxMs?: number;
	now?: () => number;
	/** Most buckets kept at once; when full, idle buckets go first, then the least recently used. */
	maxKeys?: number;
};

type Bucket = { tokens: number; updated: number; fails: number; lockedUntil: number; notified: number };

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number; firstBlock: boolean };

export class RateLimiter {
	private readonly buckets = new Map<string, Bucket>();
	private readonly o: Required<LimiterOptions>;

	constructor(options: LimiterOptions) {
		this.o = {
			backoffAfter: 0,
			backoffBaseMs: 1000,
			backoffMaxMs: 15 * 60_000,
			now: Date.now,
			maxKeys: 10_000,
			...options
		};
	}

	private bucket(key: string, now: number): Bucket {
		let b = this.buckets.get(key);
		if (!b) {
			if (this.buckets.size >= this.o.maxKeys) this.makeRoom();
			b = { tokens: this.o.burst, updated: now, fails: 0, lockedUntil: 0, notified: 0 };
		} else {
			this.buckets.delete(key); // re-insert below: the Map's order then runs from least to most recently used
		}
		this.buckets.set(key, b);
		const refill = ((now - b.updated) / this.o.windowMs) * this.o.burst;
		b.tokens = Math.min(this.o.burst, b.tokens + refill);
		b.updated = now;
		return b;
	}

	/** Frees space for a new key: first the idle buckets, then (if still full) the least recently used one. */
	private makeRoom(): void {
		this.sweep();
		if (this.buckets.size < this.o.maxKeys) return;
		const oldest = this.buckets.keys().next();
		if (!oldest.done) this.buckets.delete(oldest.value);
	}

	/** Takes one token. */
	take(key: string): LimitResult {
		const now = this.o.now();
		const b = this.bucket(key, now);
		let waitMs = 0;
		if (b.lockedUntil > now) waitMs = b.lockedUntil - now;
		if (b.tokens < 1) waitMs = Math.max(waitMs, ((1 - b.tokens) / this.o.burst) * this.o.windowMs);
		if (waitMs > 0) {
			const firstBlock = b.notified <= now;
			if (firstBlock) b.notified = now + this.o.windowMs;
			return { ok: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)), firstBlock };
		}
		b.tokens -= 1;
		return { ok: true };
	}

	/** Records a failed attempt; may start or lengthen a lock-out. */
	fail(key: string): void {
		if (!this.o.backoffAfter) return;
		const now = this.o.now();
		const b = this.bucket(key, now);
		b.fails += 1;
		if (b.fails >= this.o.backoffAfter) {
			const exp = Math.min(b.fails - this.o.backoffAfter, 20);
			b.lockedUntil = now + Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** exp);
		}
	}

	/** A success clears the failure streak. */
	succeed(key: string): void {
		const b = this.buckets.get(key);
		if (b) {
			b.fails = 0;
			b.lockedUntil = 0;
		}
	}

	/** Drops buckets that are full and unlocked, so the map cannot grow without bound. */
	sweep(): void {
		const now = this.o.now();
		for (const [key, b] of this.buckets) {
			const full = b.tokens + ((now - b.updated) / this.o.windowMs) * this.o.burst >= this.o.burst;
			if (full && b.lockedUntil <= now && b.notified <= now) this.buckets.delete(key);
		}
	}

	size(): number {
		return this.buckets.size;
	}
}

function intEnv(name: string, fallback: number): number {
	const n = Number.parseInt(process.env[name] ?? '', 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Limits (env, so tests can tighten them): per user name AUTH_RATE_USER_BURST (default 10 per AUTH_RATE_WINDOW_S = 60 s,
 * plus an exponential lock-out after 5 consecutive failures); per IP AUTH_RATE_IP_BURST (default 30: a shared VPN
 * address serves several people, so it is looser). The IP bucket has no failure lock-out.
 */
export const limiters = {
	user: new RateLimiter({
		burst: intEnv('AUTH_RATE_USER_BURST', 10),
		windowMs: intEnv('AUTH_RATE_WINDOW_S', 60) * 1000,
		backoffAfter: 5
	}),
	ip: new RateLimiter({
		burst: intEnv('AUTH_RATE_IP_BURST', 30),
		windowMs: intEnv('AUTH_RATE_WINDOW_S', 60) * 1000
	})
};
