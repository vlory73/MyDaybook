/** Client for the admin API (ARCHITECTURE §7). Everything here is account metadata; never diary content. */
import { apiGet, apiPost } from '$lib/api';
import type { Role } from '$lib/api';

export type AdminUser = {
	id: string;
	username: string | null;
	role: Role;
	kind: 'adult' | 'dependent';
	status: 'active' | 'disabled';
	createdAt: number;
	storageBytes: number;
	/** `YYYY-MM-DD` (UTC), or null when the person has no session. */
	lastActiveDay: string | null;
	totpEnabled: boolean;
};

export type AdminInvite = { id: string; role: Role; createdAt: number; expiresAt: number };

export const listUsers = async () => (await apiGet<{ users: AdminUser[] }>('/api/admin/users')).users;
export const listInvites = async () =>
	(await apiGet<{ invites: AdminInvite[] }>('/api/admin/invites')).invites;
export const setDisabled = (id: string, off: boolean) =>
	apiPost(`/api/admin/users/${id}/${off ? 'disable' : 'enable'}`);
export const revokeInvite = (id: string) => apiPost(`/api/admin/invites/${id}/revoke`);

/** Creates an invite and returns the one-time join link (the token lives only in the URL fragment). */
export async function createInviteLink(role: Role): Promise<{ link: string; expiresAt: number }> {
	const res = await apiPost<{ token: string; expiresAt: number }>('/api/invites', { role });
	return { link: `${location.origin}/join#t=${res.token}`, expiresAt: res.expiresAt };
}
