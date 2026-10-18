/**
 * Auto-lock (decision D9). While the diary is unlocked:
 *  - it locks after `minutes` without a pointer, key, touch or scroll event, and
 *  - it locks after HIDDEN_LOCK_SECONDS with the page hidden (tab switched, phone locked, app in background).
 * Activity only stamps a timestamp (cheap); one timer checks it and re-arms for the time that is left. Browsers
 * throttle timers in background tabs, so coming back to the page re-checks the clock before anything is shown.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

export type AutoLockOptions = {
	/** Read on every check, so a changed preference applies immediately. */
	minutes: () => number;
	hiddenSeconds: number;
	onLock: () => void;
};

/** Starts watching. Returns a function that stops everything (call it when the diary locks). */
export function startAutoLock(options: AutoLockOptions): () => void {
	let lastActivity = Date.now();
	let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let done = false;

	const fire = () => {
		if (done) return;
		done = true;
		stop();
		options.onLock();
	};

	/** Locks if a limit has passed; otherwise re-arms the timer for the nearest limit. */
	const check = () => {
		clearTimeout(timer);
		if (done) return;
		const now = Date.now();
		const idleLeft = lastActivity + options.minutes() * 60_000 - now;
		const hiddenLeft = hiddenAt === null ? Infinity : hiddenAt + options.hiddenSeconds * 1000 - now;
		const left = Math.min(idleLeft, hiddenLeft);
		if (left <= 0) fire();
		else timer = setTimeout(check, Math.min(left, 60_000));
	};

	const onActivity = () => {
		lastActivity = Date.now();
	};
	const onVisibility = () => {
		if (document.visibilityState === 'hidden') {
			hiddenAt = Date.now();
		} else {
			// Check before returning to the page: a long absence locks even if the timer was throttled.
			check();
			hiddenAt = null;
			lastActivity = Date.now();
		}
		check();
	};

	for (const name of ACTIVITY_EVENTS) {
		document.addEventListener(name, onActivity, { capture: true, passive: true });
	}
	document.addEventListener('visibilitychange', onVisibility);
	check();

	function stop() {
		clearTimeout(timer);
		for (const name of ACTIVITY_EVENTS) document.removeEventListener(name, onActivity, { capture: true });
		document.removeEventListener('visibilitychange', onVisibility);
	}
	return () => {
		done = true;
		stop();
	};
}
