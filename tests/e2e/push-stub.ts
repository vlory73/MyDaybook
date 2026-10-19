import { randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

// Headless browsers cannot subscribe to a real push service, so `pushManager` is stubbed in the page; the app, the
// API and the database stay real. Synthetic data only.

export type Stub = { permission?: 'granted' | 'denied' | 'default'; ios?: boolean };

/** Pretends the browser supports push. `window.__push` records what the app asked for. */
export async function stubPush(page: Page, endpoint: string, options: Stub = {}) {
	await page.addInitScript(
		({ endpoint, permission, ios }) => {
			const w = window as unknown as Record<string, unknown>;
			if (ios) {
				// An iPhone tab that is not on the Home Screen: no PushManager, no Notification.
				delete w.PushManager;
				delete w.Notification;
				Object.defineProperty(navigator, 'userAgent', {
					get: () =>
						'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
				});
				return;
			}
			const log: { subscribe: unknown[]; unsubscribed: number } = { subscribe: [], unsubscribed: 0 };
			w.__push = log;
			let key: ArrayBuffer | null = null;
			let current: unknown = null;
			const subscription = () => ({
				endpoint,
				get options() {
					return { applicationServerKey: key };
				},
				toJSON: () => ({ endpoint, keys: { p256dh: 'e2e_synthetic_p256dh', auth: 'e2e_synthetic_auth' } }),
				unsubscribe: async () => {
					current = null;
					log.unsubscribed++;
					return true;
				}
			});
			const registration = {
				pushManager: {
					getSubscription: async () => current,
					subscribe: async (opts: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
						log.subscribe.push({
							userVisibleOnly: opts.userVisibleOnly,
							keyLength: opts.applicationServerKey.length
						});
						key = opts.applicationServerKey.slice().buffer;
						current = subscription();
						return current;
					}
				}
			};
			w.PushManager = function PushManager() {};
			let state = permission;
			Object.defineProperty(window, 'Notification', {
				configurable: true,
				value: {
					get permission() {
						return state;
					},
					requestPermission: async () => {
						if (state === 'default') state = 'granted';
						return state;
					}
				}
			});
			Object.defineProperty(navigator.serviceWorker, 'ready', {
				configurable: true,
				get: () => Promise.resolve(registration)
			});
			Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
				configurable: true,
				value: async () => registration
			});
		},
		{ endpoint, permission: options.permission ?? 'default', ios: options.ios ?? false }
	);
}

export const endpointOf = () => `https://fcm.googleapis.com/fcm/send/e2e-${randomBytes(6).toString('hex')}`;

export async function addMedWithReminder(page: Page, name: string, time: string, weekdays?: string[]) {
	const sheet = page.getByRole('dialog', { name: /medication/i });
	await page.getByRole('button', { name: 'Add medication' }).click();
	await sheet.getByLabel('Name', { exact: true }).fill(name);
	await sheet.getByLabel('Time 1', { exact: true }).fill(time);
	if (weekdays) {
		await sheet.getByRole('radio', { name: 'Some weekdays' }).click();
		for (const d of weekdays) await sheet.getByRole('button', { name: d, exact: true }).click();
	}
	await sheet.getByRole('switch', { name: 'Remind me on this phone' }).click();
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();
}
