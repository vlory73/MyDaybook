<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import type { Snippet } from 'svelte';
	import { brand } from '$lib/brand';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { applyTheme, theme } from '$lib/theme.svelte';
	import { categories, type Category } from '$lib/components/categories';
	import { CategoryBadge, Sheet, TabBar, ToastHost, Icon, showToast } from '$lib/components';

	let { children }: { children: Snippet } = $props();
	let quickLogOpen = $state(false);

	$effect(() => {
		document.documentElement.lang = i18n.locale;
	});
	$effect(() => {
		applyTheme(theme.current);
	});

	const timeFormat = $derived(
		new Intl.DateTimeFormat(i18n.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
	);
	const tiles = Object.keys(categories) as Category[];

	function pick() {
		quickLogOpen = false;
		showToast(t('quicklog.notYet'));
	}
</script>

<svelte:head><title>{brand.displayName}</title></svelte:head>

<a class="skip-link" href="#main">{t('nav.skip')}</a>
<main id="main" class="page">
	{@render children()}
</main>

<TabBar onquicklog={() => (quickLogOpen = true)} />

<Sheet bind:open={quickLogOpen} title={t('quicklog.title')}>
	{#snippet header()}
		<span class="time-chip"
			><Icon name="clock" size={18} />{t('quicklog.now', { time: timeFormat.format(new Date()) })}</span
		>
	{/snippet}
	<div class="tiles">
		{#each tiles as key (key)}
			<button type="button" class="tile tint-{categories[key].tint}" onclick={pick}>
				<CategoryBadge category={key} size={36} />
				{t(categories[key].label)}
			</button>
		{/each}
	</div>
	<p class="foot"><Icon name="lock" size={18} />{t('quicklog.footnote')}</p>
</Sheet>

<ToastHost />

<style>
	.time-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-3);
	}
	.tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 88px;
		border-radius: var(--r-lg);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.tile :global(.badge) {
		background: transparent;
	}
	.tint-food {
		background: var(--food-tint);
		color: var(--food-ink);
	}
	.tint-feel {
		background: var(--feel-tint);
		color: var(--feel-ink);
	}
	.tint-sleep {
		background: var(--sleep-tint);
		color: var(--sleep-ink);
	}
	.tint-pain {
		background: var(--pain-tint);
		color: var(--pain-ink);
	}
	.tint-meds {
		background: var(--meds-tint);
		color: var(--meds-ink);
	}
	.tint-gut {
		background: var(--gut-tint);
		color: var(--gut-ink);
	}
	.tint-measure {
		background: var(--measure-tint);
		color: var(--measure-ink);
	}
	.tint-note {
		background: var(--note-tint);
		color: var(--note-ink);
	}
	.foot {
		display: flex;
		gap: 6px;
		align-items: center;
		justify-content: center;
		color: var(--text-2);
		font-size: var(--fs-footnote);
		margin-top: var(--sp-4);
	}
</style>
