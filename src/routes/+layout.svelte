<script lang="ts">
	import '$lib/styles/tokens.css';
	import '$lib/styles/base.css';
	import { onMount, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { startAutoLock } from '$lib/autolock';
	import { brand } from '$lib/brand';
	import { i18n, t } from '$lib/i18n/index.svelte';
	import { HIDDEN_LOCK_SECONDS, loadSession, lock, session } from '$lib/session.svelte';
	import { applyTheme, theme } from '$lib/theme.svelte';
	import { closeEditors, openLog, openNote } from '$lib/records/editor.svelte';
	import { againOptions, againPayload, lastUsedMeasureType, WEIGHT_ID, type Again } from '$lib/records/log';
	import { quickSave } from '$lib/records/quick';
	import { watchedItems } from '$lib/records/watch';
	import { allRecords, startRecords, syncIfStale } from '$lib/records/store.svelte';
	import { categories, type Category } from '$lib/components/categories';
	import {
		BowelSheet,
		Button,
		CategoryBadge,
		EntryDetailSheet,
		FeelingSheet,
		Hero,
		Icon,
		LanguageSwitch,
		MealSheet,
		MeasurementSheet,
		NoteSheet,
		Sheet,
		SleepSheet,
		Spinner,
		TabBar,
		ToastHost,
		UnlockView,
		dismissToast,
		showToast
	} from '$lib/components';

	let { children }: { children: Snippet } = $props();
	let quickLogOpen = $state(false);

	$effect(() => {
		document.documentElement.lang = i18n.locale;
	});
	$effect(() => {
		applyTheme(theme.current);
	});

	// ---- Gating (ARCHITECTURE §3.2) ----
	// Public routes work without a session. /styleguide is a developer page that the server hides unless STYLEGUIDE=1.
	// Signed out: public routes only. Signed in but locked (reload or auto-lock): the Unlock view replaces the page.
	const path = $derived(page.url.pathname.replace(/\/+$/, '') || '/');
	const isPublic = $derived(path === '/login' || path === '/join' || path === '/recover');
	const isOpen = $derived(path === '/styleguide');
	const signedIn = $derived(session.status === 'locked' || session.status === 'unlocked');

	type View = 'loading' | 'unreachable' | 'blank' | 'public' | 'open' | 'locked' | 'app';
	const view = $derived.by<View>(() => {
		if (session.status === 'loading') return session.loadFailed ? 'unreachable' : 'loading';
		if (isOpen) return 'open';
		if (isPublic) {
			// A signed-in person has no business on /login or /join; /recover stays reachable from the Unlock view.
			if (signedIn && (path !== '/recover' || session.status === 'unlocked')) return 'blank';
			return 'public';
		}
		if (session.status === 'signed-out') return 'blank';
		return session.status === 'locked' ? 'locked' : 'app';
	});
	const chrome = $derived(view === 'app');

	onMount(() => {
		void loadSession();
	});

	$effect(() => {
		if (view !== 'blank') return;
		goto(resolve(signedIn ? '/' : '/login'), { replaceState: true });
	});

	// ---- Auto-lock (D9) ----
	$effect(() => {
		if (session.status !== 'unlocked') return;
		const minutes = session.autoLockMinutes;
		return startAutoLock({ minutes: () => minutes, hiddenSeconds: HIDDEN_LOCK_SECONDS, onLock: lock });
	});
	$effect(() => {
		if (session.status !== 'unlocked') {
			quickLogOpen = false;
			closeEditors();
			dismissToast();
		}
	});

	// ---- Records: load the cache and fetch changes after unlock; refresh when the app comes back into view ----
	$effect(() => {
		if (session.status !== 'unlocked') return;
		void startRecords();
		const onVisible = () => {
			if (document.visibilityState === 'visible') syncIfStale();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	const timeFormat = $derived(
		new Intl.DateTimeFormat(i18n.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
	);
	const tiles = Object.keys(categories) as Category[];

	function pick(key: Category) {
		quickLogOpen = false;
		if (key === 'note') openNote();
		else if (key === 'food') openLog('food');
		else if (key === 'feel') openLog('feeling');
		else if (key === 'sleep') openLog('sleep');
		else if (key === 'gut') openLog('bowel');
		else if (key === 'weight') openLog('measurement', { typeId: WEIGHT_ID });
		else if (key === 'measure') openLog('measurement', { typeId: lastUsedMeasureType(allRecords()) });
		else showToast(t('quicklog.notYet'));
	}

	// "Again?": up to three one-tap repeats from recent records; each saves at once with an Undo toast.
	const again = $derived(quickLogOpen ? againOptions(allRecords(), new Date()) : []);
	const numberFormat = $derived(new Intl.NumberFormat(i18n.locale));

	function againLabel(option: Again): { name: string; detail: string; category: Category } {
		if (option.kind === 'sleep') {
			return {
				name: t('again.usualNight'),
				detail: t('fmt.sleep.range', { from: option.asleep, to: option.wake }),
				category: 'sleep'
			};
		}
		if (option.kind === 'meal') {
			return { name: option.saved.name, detail: t('again.savedMeal'), category: 'food' };
		}
		return {
			name: t('cat.weight'),
			detail: `${numberFormat.format(option.value)} ${option.unit}`,
			category: 'weight'
		};
	}

	function repeat(option: Again) {
		quickLogOpen = false;
		const watched = new Set(watchedItems(allRecords()).map((w) => w.id));
		const payload = againPayload(option, new Date(), watched);
		if (payload) void quickSave(payload, 'entry.saved');
	}
</script>

<svelte:head><title>{brand.displayName}</title></svelte:head>

<a class="skip-link" href="#main">{t('nav.skip')}</a>
<main id="main" class={['page', { bare: !chrome }]}>
	{#if view === 'loading'}
		<div class="splash" role="status">
			<Spinner size={36} /><span class="sr-only">{t('common.loading')}</span>
		</div>
	{:else if view === 'unreachable'}
		<section class="splash-text">
			<Hero icon="info" />
			<h1 class="large-title">{t('layout.unreachable.title')}</h1>
			<p class="muted">{t('auth.error.network')}</p>
			<Button onclick={() => loadSession()}>{t('common.retry')}</Button>
		</section>
	{:else if view === 'locked'}
		<UnlockView />
	{:else if view === 'public' || view === 'open' || view === 'app'}
		{@render children()}
	{/if}
	{#if view === 'public' || view === 'locked'}
		<footer class="public-foot"><LanguageSwitch /></footer>
	{/if}
</main>

{#if chrome}
	<TabBar onquicklog={() => (quickLogOpen = true)} />

	<Sheet bind:open={quickLogOpen} title={t('quicklog.title')}>
		{#snippet header()}
			<span class="time-chip"
				><Icon name="clock" size={18} />{t('quicklog.now', { time: timeFormat.format(new Date()) })}</span
			>
		{/snippet}
		<div class="tiles">
			{#each tiles as key (key)}
				<button type="button" class="tile tint-{categories[key].tint}" onclick={() => pick(key)}>
					<CategoryBadge category={key} size={36} />
					{t(categories[key].label)}
				</button>
			{/each}
		</div>
		{#if again.length > 0}
			<p class="again-label">{t('again.title')}<span>{t('again.hint')}</span></p>
			<div class="again">
				{#each again as option, i (i)}
					{@const l = againLabel(option)}
					<button type="button" class="recent" onclick={() => repeat(option)}>
						<CategoryBadge category={l.category} size={28} />
						<span><b>{l.name}</b> <span class="muted">{l.detail}</span></span>
					</button>
				{/each}
			</div>
		{/if}
		<p class="foot"><Icon name="lock" size={18} />{t('quicklog.footnote')}</p>
	</Sheet>

	<NoteSheet />
	<FeelingSheet />
	<SleepSheet />
	<MeasurementSheet />
	<BowelSheet />
	<MealSheet />
	<EntryDetailSheet />
{/if}

<ToastHost />

<style>
	/* Account screens have no tab bar, so they don't reserve room for it. */
	.bare {
		padding-bottom: calc(env(safe-area-inset-bottom) + var(--sp-7));
	}
	.splash {
		display: grid;
		place-items: center;
		min-height: 60dvh;
	}
	.splash-text {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		text-align: center;
		padding-top: var(--sp-8);
	}
	.public-foot {
		margin-top: var(--sp-7);
	}
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
	.again-label {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
		color: var(--text-2);
		margin: var(--sp-5) 0 var(--sp-2);
	}
	.again-label span {
		font-weight: var(--fw-regular);
		color: var(--text-3);
	}
	.again {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.recent {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 44px;
		padding: 4px var(--sp-3);
		border-radius: var(--r-full);
		background: var(--surface-2);
		font-size: var(--fs-callout);
		text-align: left;
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
