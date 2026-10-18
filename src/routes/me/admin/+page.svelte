<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		Button,
		Card,
		Icon,
		Notice,
		Segmented,
		Sheet,
		Spinner,
		TextField,
		showToast
	} from '$lib/components';
	import {
		createInviteLink,
		listInvites,
		listUsers,
		revokeInvite,
		setDisabled,
		type AdminInvite,
		type AdminUser
	} from '$lib/admin';
	import { formatBytes, formatDay } from '$lib/admin-format';
	import { ApiError } from '$lib/api';
	import type { Role } from '$lib/api';
	import { commonErrorKey, deleteUserAsAdmin } from '$lib/auth';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { session } from '$lib/session.svelte';

	let users = $state<AdminUser[] | null>(null);
	let invites = $state<AdminInvite[] | null>(null);
	let loadFailed = $state(false);

	const isAdmin = $derived(session.identity?.role === 'admin');
	const myId = $derived(session.identity?.userId);
	const nameOf = (u: AdminUser) => u.username ?? t('admin.dependent');
	const whenFormat = $derived(
		new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' })
	);
	const roleLabel = (r: Role) => t(r === 'admin' ? 'admin.role.admin' : 'admin.role.member');

	async function load() {
		loadFailed = false;
		try {
			[users, invites] = await Promise.all([listUsers(), listInvites()]);
		} catch {
			loadFailed = true;
		}
	}

	onMount(() => {
		// Members have no business here; the API refuses them anyway (403).
		if (!isAdmin) void goto(resolve('/me'), { replaceState: true });
		else void load();
	});

	function errorKey(err: unknown): MessageKey {
		if (err instanceof ApiError) {
			if (err.code === 'last_admin') return 'admin.error.lastAdmin';
			if (err.status === 404) return 'admin.error.notFound';
		}
		return commonErrorKey(err);
	}

	// ---- Disable / enable (reversible, so an Undo toast instead of a dialog) ----
	async function toggle(u: AdminUser, off: boolean) {
		try {
			await setDisabled(u.id, off);
		} catch (err) {
			showToast(t(errorKey(err)));
			return;
		}
		await load();
		showToast(
			t(off ? 'admin.disabledToast' : 'admin.enabledToast', { name: nameOf(u) }),
			() => void toggle(u, !off)
		);
	}

	// ---- Delete (irreversible: a confirmation sheet and the admin's passphrase) ----
	let deleting = $state<AdminUser | null>(null);
	let deleteOpen = $state(false);
	let deletePassphrase = $state('');
	let deleteBusy = $state(false);
	let deleteError = $state<MessageKey | null>(null);

	$effect(() => {
		if (!deleteOpen) {
			deletePassphrase = '';
			deleteError = null;
		}
	});

	function askDelete(u: AdminUser) {
		deleting = u;
		deleteOpen = true;
	}

	async function confirmDelete(event: SubmitEvent) {
		event.preventDefault();
		if (deleteBusy || !deleting) return;
		if (deletePassphrase === '') return (deleteError = 'auth.error.fillIn');
		deleteBusy = true;
		deleteError = null;
		const target = deleting;
		try {
			await deleteUserAsAdmin(target.id, deletePassphrase);
			deleteOpen = false;
			await load();
			showToast(t('admin.delete.done', { name: nameOf(target) }));
		} catch (err) {
			deleteError =
				err instanceof ApiError && err.code === 'invalid_credentials'
					? 'admin.delete.wrong'
					: err instanceof ApiError && err.code === 'last_guardian'
						? 'admin.delete.lastGuardian'
						: errorKey(err);
		} finally {
			deleteBusy = false;
		}
	}

	// ---- Invites ----
	let inviteRole = $state<Role>('member');
	let inviteBusy = $state(false);
	let inviteError = $state<MessageKey | null>(null);
	let created = $state<{ link: string; expiresAt: number } | null>(null);
	const roleOptions = $derived<{ value: Role; label: string }[]>([
		{ value: 'member', label: t('admin.role.member') },
		{ value: 'admin', label: t('admin.role.admin') }
	]);

	async function createInvite() {
		if (inviteBusy) return;
		inviteBusy = true;
		inviteError = null;
		try {
			created = await createInviteLink(inviteRole);
			invites = await listInvites();
		} catch (err) {
			inviteError = errorKey(err);
		} finally {
			inviteBusy = false;
		}
	}

	async function copyLink() {
		if (!created) return;
		try {
			await navigator.clipboard.writeText(created.link);
			showToast(t('admin.invite.copied'));
		} catch {
			showToast(t('admin.invite.copyFailed'));
		}
	}

	async function revoke(invite: AdminInvite) {
		try {
			await revokeInvite(invite.id);
			invites = await listInvites();
			showToast(t('admin.invites.revoked'));
		} catch (err) {
			showToast(t(errorKey(err)));
		}
	}
</script>

<header class="page-head">
	<a class="link-button back" href={resolve('/me')}><Icon name="chevron-left" size={18} />{t('admin.back')}</a
	>
	<h1 class="large-title">{t('admin.title')}</h1>
</header>

{#if isAdmin}
	<Notice>{t('admin.lead')}</Notice>

	{#if loadFailed}
		<Notice tone="error">{t('admin.loadFailed')}</Notice>
		<Button variant="soft" onclick={load}>{t('common.retry')}</Button>
	{:else if users === null}
		<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>
	{:else}
		<Card title={t('admin.people.heading')}>
			<ul class="people" data-testid="admin-users">
				{#each users as u (u.id)}
					<li class="person" data-username={u.username ?? ''}>
						<div class="who">
							<span class="name">{nameOf(u)}</span>
							{#if u.id === myId}<span class="badge">{t('admin.you')}</span>{/if}
							<span class="badge" class:admin={u.role === 'admin'}>{roleLabel(u.role)}</span>
							{#if u.status === 'disabled'}<span class="badge off">{t('admin.status.disabled')}</span>{/if}
						</div>
						<p class="meta small muted">
							{t('admin.storage', { size: formatBytes(u.storageBytes, i18n.locale) })} ·
							{u.lastActiveDay
								? t('admin.lastActive', { day: formatDay(u.lastActiveDay, i18n.locale) })
								: t('admin.neverActive')} ·
							{u.totpEnabled ? t('admin.totp.on') : t('admin.totp.off')}
						</p>
						{#if u.id !== myId}
							<div class="actions">
								{#if u.status === 'active'}
									<Button
										variant="soft"
										size="sm"
										aria-label={t('admin.disable.for', { name: nameOf(u) })}
										onclick={() => toggle(u, true)}>{t('admin.disable')}</Button
									>
								{:else}
									<Button
										variant="soft"
										size="sm"
										aria-label={t('admin.enable.for', { name: nameOf(u) })}
										onclick={() => toggle(u, false)}>{t('admin.enable')}</Button
									>
								{/if}
								<Button
									variant="quiet"
									size="sm"
									aria-label={t('admin.delete.for', { name: nameOf(u) })}
									onclick={() => askDelete(u)}>{t('common.delete')}</Button
								>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</Card>

		<Card title={t('admin.invites.heading')}>
			{#if invites && invites.length > 0}
				<ul class="people" data-testid="admin-invites">
					{#each invites as invite (invite.id)}
						{@const when = whenFormat.format(invite.expiresAt)}
						<li class="invite">
							<span>{t('admin.invites.row', { role: roleLabel(invite.role), when })}</span>
							<Button
								variant="quiet"
								size="sm"
								aria-label={t('admin.invites.revokeFor', { role: roleLabel(invite.role), when })}
								onclick={() => revoke(invite)}>{t('admin.invites.revoke')}</Button
							>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="small muted">{t('admin.invites.empty')}</p>
			{/if}
		</Card>

		<Card title={t('admin.invite.heading')}>
			<div class="form">
				<Segmented label={t('admin.invite.role')} options={roleOptions} bind:value={inviteRole} />
				{#if inviteError}<Notice tone="error">{t(inviteError)}</Notice>{/if}
				<Button variant="soft" onclick={createInvite} disabled={inviteBusy}>
					<Icon name="plus" size={18} />{t('admin.invite.create')}
				</Button>
				{#if created}
					<div class="link-box">
						<label for="invite-link">{t('admin.invite.linkLabel')}</label>
						<input id="invite-link" readonly value={created.link} data-testid="invite-link" />
						<Button variant="quiet" onclick={copyLink}
							><Icon name="copy" size={18} />{t('admin.invite.copy')}</Button
						>
						<p class="small muted">
							{t('admin.invite.once', { when: whenFormat.format(created.expiresAt) })}
						</p>
					</div>
				{/if}
			</div>
		</Card>
	{/if}
{/if}

<Sheet bind:open={deleteOpen} title={t('admin.delete.title', { name: deleting ? nameOf(deleting) : '' })}>
	{#if deleting}
		<form onsubmit={confirmDelete} class="form" novalidate>
			<p>{t('admin.delete.lead', { name: nameOf(deleting) })}</p>
			<p class="small muted">{t('admin.delete.backups')}</p>
			<TextField
				label={t('admin.delete.passphrase')}
				name="admin-delete-passphrase"
				type="password"
				autocomplete="current-password"
				autocapitalize="off"
				spellcheck="false"
				disabled={deleteBusy}
				bind:value={deletePassphrase}
			/>
			{#if deleteError}<Notice tone="error">{t(deleteError)}</Notice>{/if}
			{#if deleteBusy}<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>{/if}
			<Button type="submit" variant="danger" block size="lg" disabled={deleteBusy}>
				{t('admin.delete.confirm')}
			</Button>
			<Button variant="quiet" block onclick={() => (deleteOpen = false)}>{t('common.cancel')}</Button>
		</form>
	{/if}
</Sheet>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-bottom: var(--sp-2);
	}
	:global(.notice) + :global(.card) {
		margin-top: var(--sp-4);
	}
	.people {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.person,
	.invite {
		padding: var(--sp-3) 0;
		border-top: 1px solid var(--surface-3);
	}
	.person:first-child,
	.invite:first-child {
		border-top: none;
		padding-top: 0;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}
	.name {
		font-weight: var(--fw-semibold);
		overflow-wrap: anywhere;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 0 var(--sp-2);
		border-radius: var(--r-full);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-medium);
	}
	.badge.admin {
		background: var(--primary-soft);
		color: var(--primary-press);
	}
	.badge.off {
		box-shadow: inset 0 0 0 1.5px var(--pain-ink);
		color: var(--pain-ink);
		background: transparent;
	}
	.meta {
		margin: var(--sp-1) 0 var(--sp-2);
	}
	.actions {
		display: flex;
		gap: var(--sp-2);
	}
	.invite {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
	.link-box {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.link-box label {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
	}
	.link-box input {
		min-height: 48px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--fs-footnote);
		width: 100%;
	}
	.busy {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text-2);
	}
</style>
