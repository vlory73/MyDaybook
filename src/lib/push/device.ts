/**
 * Browser-side helpers for Web Push on this device. No state and no keys: the subscription belongs to the browser,
 * and what is uploaded is described in schedule.ts. Every function degrades to "nothing" when push is unavailable.
 */
import { apiDelete } from '$lib/api';

export const UPLOADED_KEY = 'reminders-uploaded';

export function pushSupported(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		'serviceWorker' in navigator &&
		typeof window !== 'undefined' &&
		'PushManager' in window &&
		'Notification' in window
	);
}

/** iPhone, iPad (also when it reports itself as a Mac). Push there needs the Home Screen app and iOS 16.4+. */
export function isIos(): boolean {
	if (typeof navigator === 'undefined') return false;
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

export function keyToBytes(key: string): Uint8Array<ArrayBuffer> {
	const bin = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
	if (!pushSupported()) return null;
	try {
		// getRegistration, not `ready`: that one never settles when no worker is registered, and sign-out waits for this.
		const reg = await navigator.serviceWorker.getRegistration();
		return (await reg?.pushManager.getSubscription()) ?? null;
	} catch {
		return null;
	}
}

export function forgetUploaded(): void {
	try {
		localStorage.removeItem(UPLOADED_KEY);
	} catch {
		// Nothing stored.
	}
}

/**
 * Sign-out and account deletion: remove this device's subscription from the server (best effort) and from the browser,
 * so a later sign-in by someone else on this phone does not inherit it.
 */
export async function removeThisDevice(tellServer = true): Promise<void> {
	forgetUploaded();
	const sub = await currentSubscription();
	if (!sub) return;
	if (tellServer) {
		try {
			await apiDelete('/api/push/subscription', { endpoint: sub.endpoint });
		} catch {
			// The server drops it by itself when the push service reports the subscription gone.
		}
	}
	try {
		await sub.unsubscribe();
	} catch {
		// Already gone.
	}
}
