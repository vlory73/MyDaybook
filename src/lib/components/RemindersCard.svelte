<script lang="ts">
	import { onMount } from 'svelte';
	import { t, tn } from '$lib/i18n/index.svelte';
	import { disableReminders, enableReminders, refreshReminders, reminders } from '$lib/push/reminders.svelte';
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Spinner from './Spinner.svelte';
	import Toggle from './Toggle.svelte';

	/** Me → "Reminders on this device": opt-in per device (D7). The schedule itself is uploaded by the layout. */
	let on = $derived(reminders.status === 'on');

	onMount(() => {
		void refreshReminders();
	});

	const blocked = $derived(
		reminders.status === 'unsupported' ||
			reminders.status === 'ios-install' ||
			reminders.status === 'server-off' ||
			reminders.status === 'denied'
	);
	const blockedText = $derived(
		reminders.status === 'server-off'
			? t('me.reminders.serverOff')
			: reminders.status === 'ios-install'
				? t('me.reminders.iosInstall')
				: reminders.status === 'denied'
					? t('me.reminders.denied')
					: t('me.reminders.unsupported')
	);

	async function change(checked: boolean) {
		// Called from the tap itself: the permission prompt needs a user gesture.
		if (checked) await enableReminders();
		else await disableReminders();
		on = reminders.status === 'on';
	}
</script>

<Card title={t('me.reminders.heading')}>
	<div class="stack" data-testid="reminders-card" data-status={reminders.status}>
		<p class="small muted">{t('me.reminders.lead')}</p>
		{#if reminders.status === 'checking'}
			<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>
		{:else if blocked}
			<Notice tone={reminders.status === 'denied' ? 'warn' : 'info'}>{blockedText}</Notice>
		{:else}
			<div class="setrow">
				<span class="grow">{t('me.reminders.toggle')}</span>
				<Toggle
					bind:checked={on}
					label={t('me.reminders.toggle')}
					disabled={reminders.busy}
					onchange={change}
				/>
			</div>
			{#if reminders.status === 'on' && reminders.slots !== null}
				<p class="small muted" data-testid="reminders-count">
					{reminders.slots > 0 ? tn('me.reminders.times', reminders.slots) : t('me.reminders.noneYet')}
				</p>
			{/if}
		{/if}
		{#if reminders.error}<Notice tone="error">{t(reminders.error)}</Notice>{/if}
		<p class="small muted privacy"><Icon name="lock" size={16} />{t('me.reminders.privacy')}</p>
	</div>
</Card>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.setrow {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 44px;
	}
	.grow {
		flex: 1;
		font-weight: var(--fw-medium);
	}
	.busy {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text-2);
	}
	.privacy {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
	}
	.privacy :global(.icon) {
		flex: none;
		margin-top: 2px;
	}
</style>
