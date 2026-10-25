/**
 * Client side of the Privacy page: the public settings (`GET /api/privacy`, no user data) and the signed-in
 * person's own consent record (`GET /api/account/consent`). The settings are fetched once per page load.
 */
import { apiGet } from '$lib/api';

export type PrivacySettings = {
	ipRetentionDays: number;
	backupRetentionDays: number;
	operatorName: string;
	operatorContact: string;
};
export type StoredConsent = { version: string; acceptedAt: number } | null;

/** What to assume until (or if) the server answers: the documented defaults. */
export const DEFAULT_SETTINGS: PrivacySettings = {
	ipRetentionDays: 7,
	backupRetentionDays: 14,
	operatorName: '',
	operatorContact: ''
};

export const privacy = $state<{ settings: PrivacySettings; loaded: boolean; failed: boolean }>({
	settings: DEFAULT_SETTINGS,
	loaded: false,
	failed: false
});

let pending: Promise<void> | null = null;

/** Loads the settings once; later calls share the result. A failure can be retried by calling again. */
export function loadPrivacySettings(): Promise<void> {
	if (privacy.loaded) return Promise.resolve();
	pending ??= apiGet<PrivacySettings>('/api/privacy')
		.then((s) => {
			privacy.settings = { ...DEFAULT_SETTINGS, ...s };
			privacy.loaded = true;
			privacy.failed = false;
		})
		.catch(() => {
			privacy.failed = true;
		})
		.finally(() => {
			pending = null;
		});
	return pending;
}

export async function loadOwnConsent(): Promise<StoredConsent> {
	const { consent } = await apiGet<{ consent: StoredConsent }>('/api/account/consent');
	return consent;
}

/** "consent-v2" becomes 2; anything unexpected is shown as typed. */
export function versionNumber(version: string): string {
	return /^consent-v(\d+)$/.exec(version)?.[1] ?? version;
}
