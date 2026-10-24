/**
 * Operator settings that the Privacy page shows to everyone. Every value is parsed defensively: a bad value falls
 * back to its default instead of failing a request. Nothing here is secret.
 */
import { ipRetentionDays } from '$lib/server/auth/events';

export const DEFAULT_BACKUP_RETENTION_DAYS = 14;
const MAX_TEXT = 120;

/** BACKUP_RETENTION_DAYS: whole days (2 or more) that encrypted backup copies are kept (the operator's NAS/off-site retention). */
export function backupRetentionDays(raw: string | undefined = process.env.BACKUP_RETENTION_DAYS): number {
	if (raw === undefined) return DEFAULT_BACKUP_RETENTION_DAYS;
	const text = raw.trim();
	if (!/^\d{1,4}$/.test(text)) return DEFAULT_BACKUP_RETENTION_DAYS;
	const n = Number.parseInt(text, 10);
	return n >= 2 ? n : DEFAULT_BACKUP_RETENTION_DAYS;
}

/** Optional free text: trimmed, single line, cut to a sensible length; empty means "not set". */
export function optionalText(raw: string | undefined): string {
	if (raw === undefined) return '';
	return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

export type PrivacySettings = {
	ipRetentionDays: number;
	backupRetentionDays: number;
	operatorName: string;
	operatorContact: string;
};

export function privacySettings(env: NodeJS.ProcessEnv = process.env): PrivacySettings {
	return {
		ipRetentionDays: ipRetentionDays(),
		backupRetentionDays: backupRetentionDays(env.BACKUP_RETENTION_DAYS),
		operatorName: optionalText(env.OPERATOR_NAME),
		operatorContact: optionalText(env.OPERATOR_CONTACT)
	};
}
