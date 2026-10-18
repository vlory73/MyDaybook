<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import type { IconName } from './icon-names';
	import type { MessageKey } from '$lib/i18n/en';
	import { t } from '$lib/i18n/index.svelte';

	let { onquicklog }: { onquicklog: () => void } = $props();

	type Tab = { href: '/' | '/trends' | '/meds' | '/me'; icon: IconName; label: MessageKey };
	const left: Tab[] = [
		{ href: '/', icon: 'house', label: 'nav.today' },
		{ href: '/trends', icon: 'chart-spline', label: 'nav.trends' }
	];
	const right: Tab[] = [
		{ href: '/meds', icon: 'pill', label: 'nav.meds' },
		{ href: '/me', icon: 'user-round', label: 'nav.me' }
	];
	const isCurrent = (href: Tab['href']) => page.url.pathname === resolve(href);
</script>

{#snippet tab(item: Tab)}
	<a href={resolve(item.href)} class="tab" aria-current={isCurrent(item.href) ? 'page' : undefined}>
		<Icon name={item.icon} size={25} />
		<span>{t(item.label)}</span>
	</a>
{/snippet}

<nav class="tabbar" aria-label={t('nav.main')}>
	{#each left as item (item.href)}{@render tab(item)}{/each}
	<button type="button" class="fab" aria-label={t('nav.log')} onclick={onquicklog}>
		<Icon name="plus" size={30} />
	</button>
	{#each right as item (item.href)}{@render tab(item)}{/each}
</nav>

<style>
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		align-items: start;
		padding: 6px max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom))
			max(8px, env(safe-area-inset-left));
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		border-top: 1px solid var(--line);
	}
	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-height: 48px;
		padding-top: 4px;
		font-size: var(--fs-caption);
		font-weight: var(--fw-medium);
		color: var(--text-3);
		text-decoration: none;
	}
	.tab[aria-current='page'] {
		color: var(--primary);
	}
	.fab {
		justify-self: center;
		margin-top: -22px;
		width: 62px;
		height: 62px;
		border-radius: var(--r-full);
		background: var(--primary);
		color: var(--on-primary);
		display: grid;
		place-items: center;
		box-shadow: var(--shadow-fab);
		border: 4px solid var(--bg);
		transition: transform var(--dur-1) var(--ease-out);
	}
	.fab :global(svg) {
		stroke-width: 2.4;
	}
	.fab:active {
		transform: scale(0.94);
	}
</style>
