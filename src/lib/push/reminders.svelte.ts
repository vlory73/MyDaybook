/**
 * Reminders on this device (D7): opt-in, per device. Subscribes the browser to Web Push and uploads the schedule of
 * fire times (schedule.ts). The push itself is empty; the service worker shows a fixed neutral notification.
 */
import { ApiError, apiGet, apiPut } from '$lib/api';
import type { MessageKey } from '$lib/i18n/en';
import {
	UPLOADED_KEY,
	currentSubscription,
	forgetUploaded,
	isIos,
	keyToBytes,
	pushSupported,
	removeThisDevice
} from './device';
import { scheduleKey, type ReminderSchedule } from './schedule';

export type ReminderStatus =
	| 'checking'
	/** No VAPID keys on this server. */
	| 'server-off'
	/** The browser cannot do push at all (an iPhone page that is not on the Home Screen looks like this). */
	| 'unsupported'
	| 'ios-install'
	| 'denied'
	| 'idle'
	| 'on';

export const reminders = $state<{
	status: ReminderStatus;
	busy: boolean;
	error: MessageKey | null;
	slots: number | null;
}>({ status: 'checking', busy: false, error: null, slots: null });

let serverKey: string | null = null;
/** The newest schedule the app computed, kept so that switching on uploads it at once. */
let latest: ReminderSchedule | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function fetchKey(): Promise<string | null> {
	try {
		serverKey = (await apiGet<{ publicKey: string }>('/api/push/key')).publicKey;
		return serverKey;
	} catch (err) {
		if (err instanceof ApiError && (err.status === 503 || err.status === 404)) return null;
		throw err;
	}
}

/** Works out what the Me screen should say. Call when it opens and after unlock. */
export async function refreshReminders(): Promise<void> {
	if (!pushSupported()) {
		reminders.status = isIos() ? 'ios-install' : 'unsupported';
		return;
	}
	try {
		if (!(await fetchKey())) {
			reminders.status = 'server-off';
			return;
		}
	} catch {
		// Offline: the rest can still be judged from the browser.
	}
	const sub = await currentSubscription();
	if (Notification.permission === 'denied') reminders.status = 'denied';
	else reminders.status = sub && Notification.permission === 'granted' ? 'on' : 'idle';
}

async function sha(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))));
}

async function upload(sub: PushSubscription, schedule: ReminderSchedule, force: boolean): Promise<void> {
	// Remember a digest, not the times, of what the server has. It also covers the endpoint, so a new subscription uploads.
	const digest = await sha(`${sub.endpoint}\n${scheduleKey(schedule)}`);
	try {
		if (!force && localStorage.getItem(UPLOADED_KEY) === digest) return;
	} catch {
		// No storage: upload every time.
	}
	const json = sub.toJSON();
	await apiPut('/api/push/subscription', {
		endpoint: sub.endpoint,
		keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
		schedule
	});
	try {
		localStorage.setItem(UPLOADED_KEY, digest);
	} catch {
		// Not remembered.
	}
}

/**
 * Called whenever the medications (or the day) change. Uploads only when the schedule differs from the last upload,
 * and only on a device that has switched reminders on.
 */
export function syncReminderSchedule(schedule: ReminderSchedule): Promise<void> {
	latest = schedule;
	reminders.slots = schedule.slots.length;
	if (reminders.status !== 'on') return Promise.resolve();
	const run = chain.then(async () => {
		const sub = await currentSubscription();
		if (!sub) return;
		try {
			await upload(sub, schedule, false);
		} catch {
			// Retried on the next change or launch.
		}
	});
	chain = run.catch(() => undefined);
	return run;
}

/** The connection is back: try the newest schedule again (an upload that failed offline is not remembered as done). */
export function retryReminderSchedule(): void {
	if (latest) void syncReminderSchedule(latest);
}

/** Must be called from the tap itself: iOS only shows the permission prompt for a user gesture. */
export async function enableReminders(): Promise<void> {
	if (reminders.busy) return;
	reminders.busy = true;
	reminders.error = null;
	try {
		if (!pushSupported()) return await refreshReminders();
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			reminders.status = permission === 'denied' ? 'denied' : 'idle';
			return;
		}
		const key = serverKey ?? (await fetchKey());
		if (!key) {
			reminders.status = 'server-off';
			return;
		}
		const reg = await navigator.serviceWorker.ready;
		let sub = await reg.pushManager.getSubscription();
		if (sub && !sameKey(sub, key)) {
			await sub.unsubscribe(); // made for another server key
			sub = null;
		}
		sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
		try {
			await upload(sub, latest ?? { tz: timeZone(), slots: [] }, true);
		} catch (err) {
			await sub.unsubscribe().catch(() => undefined);
			throw err;
		}
		reminders.status = 'on';
	} catch (err) {
		reminders.error =
			err instanceof ApiError && err.code === 'network' ? 'auth.error.network' : 'me.reminders.error';
	} finally {
		reminders.busy = false;
	}
}

export async function disableReminders(): Promise<void> {
	if (reminders.busy) return;
	reminders.busy = true;
	reminders.error = null;
	try {
		await removeThisDevice();
		forgetUploaded();
		reminders.status = 'idle';
	} finally {
		reminders.busy = false;
	}
}

export const timeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function sameKey(sub: PushSubscription, key: string): boolean {
	const have = sub.options.applicationServerKey;
	if (!have) return false;
	const a = new Uint8Array(have);
	const b = keyToBytes(key);
	return a.length === b.length && a.every((v, i) => v === b[i]);
}
