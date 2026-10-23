<script lang="ts">
	import Button from './Button.svelte';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Sheet from './Sheet.svelte';
	import TextField from './TextField.svelte';
	import { showToast } from './toast.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { findProfile, fullName, profileFromInput } from '$lib/records/profile';
	import { allRecords, remove, save } from '$lib/records/store.svelte';
	import { MAX_NAME_LENGTH } from '$lib/records/types';

	/** "Your name": first and last name, stored as one encrypted record; used in the greeting and to prefill reports. */
	const profile = $derived(findProfile(allRecords()));
	const shown = $derived(fullName(profile?.payload));

	let open = $state(false);
	let first = $state('');
	let last = $state('');
	let busy = $state(false);
	let failed = $state(false);

	function edit() {
		first = profile?.payload.firstName ?? '';
		last = profile?.payload.lastName ?? '';
		failed = false;
		open = true;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		failed = false;
		try {
			const payload = profileFromInput(first, last);
			if (payload) await save(payload, profile?.id);
			else if (profile) await remove(profile.id);
			open = false;
			showToast(t('me.name.saved'));
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<Card title={t('me.name.heading')}>
	<p class="small muted lead">{t('me.name.lead')}</p>
	{#if shown}
		<p class="name" data-testid="profile-name"><Icon name="user-round" size={20} /><span>{shown}</span></p>
	{:else}
		<p class="muted name-empty">{t('me.name.empty')}</p>
	{/if}
	<Button variant="quiet" onclick={edit} data-testid="name-edit">
		{shown ? t('me.name.edit') : t('me.name.add')}
	</Button>
</Card>

<Sheet bind:open title={t('me.name.heading')}>
	<form onsubmit={submit} class="form" novalidate>
		<p class="small muted">{t('me.name.lead')}</p>
		<TextField
			label={t('me.name.first')}
			name="first-name"
			autocomplete="given-name"
			maxlength={MAX_NAME_LENGTH}
			disabled={busy}
			bind:value={first}
		/>
		<TextField
			label={t('me.name.last')}
			name="last-name"
			autocomplete="family-name"
			maxlength={MAX_NAME_LENGTH}
			disabled={busy}
			bind:value={last}
		/>
		{#if failed}<Notice tone="error">{t('me.name.error')}</Notice>{/if}
		<Button type="submit" block size="lg" disabled={busy}>{t('me.name.save')}</Button>
		<Button variant="quiet" block onclick={() => (open = false)}>{t('common.cancel')}</Button>
	</form>
</Sheet>

<style>
	.lead {
		margin-bottom: var(--sp-3);
	}
	.name {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		font-weight: var(--fw-medium);
	}
	.name-empty {
		margin-bottom: var(--sp-3);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: 2px;
	}
</style>
