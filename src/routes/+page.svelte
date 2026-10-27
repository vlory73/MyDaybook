<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Button,
		CategoryBadge,
		Chip,
		DueDoses,
		PhotoThumb,
		PainThumb,
		EmptyState,
		Icon,
		Notice,
		Spinner,
		SyncPill,
		WeekStrip,
		type IconName
	} from '$lib/components';
	import { i18n, t, tn, type MessageKey } from '$lib/i18n/index.svelte';
	import { connection } from '$lib/connection.svelte';
	import { photoQueue } from '$lib/photos/queue.svelte';
	import { openPhoto } from '$lib/photos/viewer.svelte';
	import { openEpisode, openLog } from '$lib/records/editor.svelte';
	import { openEntry } from '$lib/records/openEntry';
	import { goneForEntry, markGone } from '$lib/records/episodeActions';
	import { findProfile, greetingName } from '$lib/records/profile';
	import { session } from '$lib/session.svelte';
	import { dayNumber, episodeViews, formatDay, type EpisodeView } from '$lib/records/episodes';
	import { showToast } from '$lib/components';
	import { describe, lookups } from '$lib/records/format';
	import { quickSave } from '$lib/records/quick';
	import { dayTotalMl, mlToCl } from '$lib/records/drinks';
	import { allRecords, daysInRange, recordsOnDay, store } from '$lib/records/store.svelte';
	import { hasPendingTrackers, introCardShown, markIntroSeen, trackerOn } from '$lib/records/trackers.svelte';
	import { regionName } from '$lib/bodymap/catalogue';
	import { noteStillThere, stopHeadache } from '$lib/records/headacheActions';
	import {
		headacheCard,
		minuteOf,
		type StopChoice,
		readNotNow,
		stopChoices,
		stopOk,
		writeNotNow,
		type NotNow,
		type OpenHeadache
	} from '$lib/records/headacheStill';
	import { readDismissed, stillThere, writeDismissed, type StillThere } from '$lib/records/painEntry';
	import {
		dayDate,
		formatAt,
		fromLocalInput,
		timeOf,
		todayKey,
		toLocalInput,
		weekDays
	} from '$lib/records/time';

	const now = new Date();
	const hour = now.getHours();
	const greeting = hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening';
	const greetName = $derived(
		greetingName(findProfile(allRecords())?.payload, session.identity?.username ?? '')
	);
	const dateLabel = $derived(
		new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
	);

	let selected = $state(todayKey());
	const isToday = $derived(selected === todayKey());
	const week = $derived(weekDays(selected));
	const marked = $derived(daysInRange(week[0]!, week[6]!));
	const entries = $derived(recordsOnDay(selected));
	const heading = $derived(
		isToday
			? t('today.heading.today')
			: new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
					dayDate(selected)
				)
	);

	// A plain sum of the day's drinks; shown only when there is one, never compared with anything.
	const drinkMl = $derived(trackerOn('drink') ? dayTotalMl(allRecords(), selected) : 0);

	const open = openEntry;

	// "Still there?": a quiet convenience when a body map entry is from the last two days. Dismissing it remembers
	// only the id of that entry on this device; a newer entry brings the card back.
	let dismissed = $state<string | null>(browser ? readDismissed(localStorage) : null);
	const still = $derived(
		isToday && trackerOn('pain') ? stillThere(allRecords(), new Date(), dismissed) : null
	);
	function stillText(s: StillThere): string {
		const text = t('pain.still.text', {
			name: regionName(i18n.locale, s.point.region, s.point.side),
			n: s.point.intensity,
			when: t(`pain.still.day.${Math.min(s.daysAgo, 2)}` as MessageKey)
		});
		return s.more > 0 ? `${text} · ${t('fmt.pain.more', { n: s.more })}` : text;
	}
	// Pain episodes: the chip on timeline entries and the line on the "Still there?" card.
	const episodes = $derived(episodeViews(allRecords(), i18n.locale, todayKey()));
	const episodeById = $derived(new Map(episodes.map((v) => [v.id, v])));
	function episodeOf(id: string): EpisodeView | undefined {
		const p = store.items[id]?.payload;
		return p?.type === 'pain' && p.episode ? episodeById.get(p.episode) : undefined;
	}
	const stillEpisode = $derived(still ? episodeOf(still.id) : undefined);
	function stillLast(s: StillThere): string {
		const text = t('pain.still.last', {
			when: t(`pain.still.day.${Math.min(s.daysAgo, 2)}` as MessageKey),
			n: s.point.intensity
		});
		return s.more > 0 ? `${text} · ${t('fmt.pain.more', { n: s.more })}` : text;
	}
	async function stillGone(s: StillThere) {
		try {
			if (stillEpisode) await markGone(stillEpisode.id);
			else await goneForEntry(s.id);
			dismissStill(s.id);
			showToast(t('episode.toast.gone'));
		} catch {
			showToast(t('entry.error.save'));
		}
	}
	function dismissStill(id: string) {
		dismissed = id;
		writeDismissed(browser ? localStorage : undefined, id);
	}

	// The headache card: an open headache (no stop time) from the last two days. "Still there" notes the hour on the
	// entry, "It's gone" asks when it stopped and writes it on the same entry, "Not now" hides the card until tomorrow
	// (this device remembers only an entry id and a day).
	let notNow = $state<NotNow | null>(browser ? readNotNow(localStorage) : null);
	const hCard = $derived(
		isToday && trackerOn('pain') ? headacheCard(allRecords(), new Date(), notNow) : null
	);
	const hEpisode = $derived(hCard ? episodeOf(hCard.id) : undefined);
	/** The clock time in the phone's 12 or 24 hour style ("6 PM", "6:30 PM"; the minutes only when there are some). */
	function clock(at: string): string {
		const d = new Date(2000, 0, 1, Number(at.slice(11, 13)), Number(at.slice(14, 16)));
		return d.toLocaleTimeString(i18n.locale, {
			hour: 'numeric',
			...(at.slice(14, 16) === '00' ? {} : { minute: '2-digit' })
		});
	}
	function hSince(h: OpenHeadache): string {
		const when = t('headache.card.when', {
			time: clock(h.start),
			day: t(`pain.still.day.${Math.min(h.daysAgo, 2)}` as MessageKey)
		});
		return h.strongest === null
			? t('headache.card.lineNoN', { when })
			: t('headache.card.line', { when, n: h.strongest });
	}
	async function hStill(h: OpenHeadache) {
		try {
			await noteStillThere(h.id);
			showToast(t('headache.card.noted'));
		} catch {
			showToast(t('entry.error.save'));
		}
	}
	function hNotNow(h: OpenHeadache) {
		notNow = { id: h.id, day: todayKey() };
		writeNotNow(browser ? localStorage : undefined, notNow);
	}
	let stopping = $state(false);
	let stopChips = $state<StopChoice[]>([]);
	let stopPick = $state('');
	let earlier = $state(false);
	/** The "Earlier…" field, as the date-time input writes it. */
	let eAt = $state('');
	function hOpen(h: OpenHeadache) {
		const now = new Date();
		stopChips = stopChoices(h.start, now);
		stopPick = stopChips[0]!.at;
		earlier = false;
		eAt = toLocalInput(minuteOf(now));
		stopping = true;
	}
	const stopValue = (): string => (earlier ? (fromLocalInput(eAt) ?? '') : stopPick);
	const stopValid = (h: OpenHeadache) => {
		const v = stopValue();
		return v !== '' && stopOk(h.start, v, new Date());
	};
	async function hGone(h: OpenHeadache) {
		try {
			await stopHeadache(h.id, stopValue(), hEpisode?.ongoing ? hEpisode.id : undefined);
			stopping = false;
			showToast(t('episode.toast.gone'));
		} catch {
			showToast(t('entry.error.save'));
		}
	}

	// One-time card: "New: choose what you track". Both buttons set `introSeen` in the synced record, so it never
	// comes back on any device. New accounts make the choice during sign-up and never see it.
	const showIntro = $derived(store.status === 'ready' && !hasPendingTrackers() && introCardShown());
	async function introChoose() {
		try {
			await markIntroSeen();
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- the app's own route plus a fragment
			await goto(resolve('/me') + '#what-you-track');
		} catch {
			showToast(t('entry.error.save'));
		}
	}
	async function introNotNow() {
		try {
			await markIntroSeen();
		} catch {
			showToast(t('entry.error.save'));
		}
	}

	// One-tap mood: saves a feeling with just the mood and offers Undo.
	const moodLabels = ['mood.1', 'mood.2', 'mood.3', 'mood.4', 'mood.5'] as const;
	const latestMood = $derived(
		[...entries].reverse().find((r) => r.payload.type === 'feeling' && r.payload.mood !== undefined)?.payload
	);
	function logMood(mood: number) {
		void quickSave(
			{ v: 1, type: 'feeling', at: formatAt(new Date()), mood, symptoms: [] },
			'today.mood.saved'
		);
	}
</script>

<header class="page-head">
	<div>
		<p class="eyebrow">{dateLabel}</p>
		<h1 class="large-title">
			{greetName ? t('greeting.named', { greeting: t(greeting), name: greetName }) : t(greeting)}
		</h1>
	</div>
</header>

<WeekStrip bind:selected {marked} />

<SyncPill />

{#if store.skipped > 0}
	<Notice tone="warn">{tn('today.skipped', store.skipped)}</Notice>
{/if}

{#if showIntro}
	<section class="card intro" aria-labelledby="intro" data-testid="trackers-intro">
		<h2 class="card-title" id="intro">{t('trackers.card.title')}</h2>
		<p class="card-sub">{t('trackers.card.body')}</p>
		<div class="hc-actions">
			<Button size="sm" style="min-height:44px" onclick={introChoose}>{t('trackers.card.choose')}</Button>
			<Button size="sm" variant="quiet" style="min-height:44px" onclick={introNotNow}
				>{t('trackers.card.notNow')}</Button
			>
		</div>
	</section>
{/if}

{#if isToday && trackerOn('feel')}
	<section class="card" aria-labelledby="feel">
		<h2 class="card-title" id="feel">{t('today.mood.title')}</h2>
		<p class="card-sub">{t('today.mood.sub')}</p>
		<div class="moods">
			{#each moodLabels as label, i (label)}
				{@const n = i + 1}
				<button
					type="button"
					class="mood"
					class:on={latestMood?.type === 'feeling' && latestMood.mood === n}
					aria-label={t(label)}
					aria-pressed={latestMood?.type === 'feeling' && latestMood.mood === n}
					onclick={() => logMood(n)}><Icon name={`face-${n}` as IconName} size={30} /></button
				>
			{/each}
		</div>
		<button type="button" class="more" onclick={() => openLog('feeling')}>{t('today.mood.more')}</button>
	</section>
{/if}

{#if hCard}
	{@const h = hCard}
	<section class="card still" aria-labelledby="hcard">
		<h2 class="card-title hc-title" id="hcard">
			<CategoryBadge category="pain" size={32} />{t('headache.card.title')}
		</h2>
		{#if hEpisode}
			<p class="ep-line">
				{t('pain.still.episode', {
					n: dayNumber(hEpisode.startDay, formatAt(now)),
					name: hEpisode.name,
					date: formatDay(i18n.locale, hEpisode.startDay)
				})}
			</p>
		{/if}
		<p class="card-sub still-text hc-line">{hSince(h)}</p>
		{#if stopping}
			<p class="stop-q" id="stopq">{t('headache.card.stopQ')}</p>
			<div class="chips" role="group" aria-labelledby="stopq">
				{#each stopChips as c (c.at)}
					<Chip
						selected={!earlier && stopPick === c.at}
						onclick={() => {
							stopPick = c.at;
							earlier = false;
						}}
						>{c.hoursAgo === 0
							? t('headache.card.now', { time: clock(c.at) })
							: t(`headache.card.ago.${c.hoursAgo}` as MessageKey, { time: clock(c.at) })}</Chip
					>
				{/each}
				<Chip selected={earlier} onclick={() => (earlier = !earlier)}>{t('headache.card.earlier')}</Chip>
			</div>
			{#if earlier}
				<input
					type="datetime-local"
					class="field"
					aria-label={t('headache.card.stopAt')}
					min={toLocalInput(h.start)}
					max={toLocalInput(minuteOf(new Date()))}
					bind:value={eAt}
				/>
			{/if}
			{#if !stopValid(h)}<p class="warn" role="alert">{t('headache.order')}</p>{/if}
			<div class="hc-actions">
				<Button size="sm" style="min-height:44px" disabled={!stopValid(h)} onclick={() => hGone(h)}
					>{t('common.save')}</Button
				>
				<Button size="sm" variant="quiet" style="min-height:44px" onclick={() => (stopping = false)}
					>{t('common.cancel')}</Button
				>
			</div>
		{:else}
			<div class="hc-actions">
				<Button size="sm" style="min-height:44px" onclick={() => hStill(h)}>{t('headache.card.still')}</Button
				>
				<Button size="sm" variant="soft" style="min-height:44px" onclick={() => hOpen(h)}
					>{t('pain.still.gone')}</Button
				>
				<Button size="sm" variant="quiet" style="min-height:44px" onclick={() => hNotNow(h)}
					>{t('headache.card.notNow')}</Button
				>
			</div>
		{/if}
	</section>
{/if}

{#if still}
	<section class="card still" aria-labelledby="still">
		<h2 class="card-title" id="still">{t('pain.still.title')}</h2>
		{#if stillEpisode}
			<p class="ep-line">
				{t('pain.still.episode', {
					n: dayNumber(stillEpisode.startDay, formatAt(now)),
					name: stillEpisode.name,
					date: formatDay(i18n.locale, stillEpisode.startDay)
				})}
			</p>
			<p class="card-sub still-text">{stillLast(still)}</p>
		{:else}
			<p class="card-sub still-text">{stillText(still)}</p>
		{/if}
		<div class="still-actions">
			<button type="button" class="more" onclick={() => openLog('pain', { same: true, sameFrom: still!.id })}
				>{t('pain.still.log')}</button
			>
			<button type="button" class="more" onclick={() => stillGone(still!)}>{t('pain.still.gone')}</button>
			<button type="button" class="more quiet" onclick={() => dismissStill(still.id)}
				>{t('pain.still.dismiss')}</button
			>
		</div>
	</section>
{/if}

{#if trackerOn('meds')}
	<DueDoses day={selected} title={isToday ? t('dose.card.today') : t('dose.card.day')} />
{/if}

<h2 class="section-title">{heading}</h2>

{#if drinkMl > 0}
	<p class="day-total">
		<CategoryBadge category="drink" size={28} />
		{t(isToday ? 'drink.day.today' : 'drink.day.other', { total: t('fmt.cl', { n: mlToCl(drinkMl) }) })}
	</p>
{/if}

{#snippet lines(d: ReturnType<typeof describe>, id: string)}
	<span class="t">{d.title}</span>
	{#if d.summary}<span class="s">{d.summary}</span>{/if}
	{#if d.tags?.length}
		<span class="tags"
			>{#each d.tags as tag, i (i)}<span class="tag">{tag}</span>{/each}</span
		>
	{/if}
	{#if store.pending[id]}
		<span class="unsynced" class:refused={store.pending[id] === 'refused'} data-testid="unsynced"
			><Icon name={store.pending[id] === 'refused' ? 'clock-alert' : 'cloud-off'} size={14} />{t(
				store.pending[id] === 'refused' ? 'outbox.marker.refused' : 'outbox.marker.waiting'
			)}</span
		>
	{/if}
{/snippet}

{#if entries.length > 0}
	<ol class="tl">
		{#each entries as record (record.id)}
			{@const d = describe(record, lookups)}
			<li>
				<button type="button" class="entry" onclick={() => open(record.id, record.payload.type)}>
					<time>{timeOf(record.payload.at)}</time>
					<CategoryBadge category={d.category} nap={d.nap} size={40} />
					{#if record.payload.type === 'pain'}
						<span class="text withfig">
							<PainThumb points={record.payload.points} />
							<span class="col">{@render lines(d, record.id)}</span>
						</span>
					{:else}
						<span class="text">{@render lines(d, record.id)}</span>
					{/if}
				</button>
				{#if record.payload.type === 'pain'}
					{@const ep = episodeOf(record.id)}
					{#if ep}
						{@const n = dayNumber(ep.startDay, record.payload.at)}
						<button
							type="button"
							class="epchip"
							aria-label={t('episode.chip.aria', { name: ep.name, n })}
							onclick={() => openEpisode(ep.id)}
						>
							<Icon name="repeat" size={14} /><span class="epl"
								>{t('episode.chip', { name: ep.name, n })}</span
							>
						</button>
					{/if}
				{/if}
				{#if record.payload.attachments?.length}
					<div class="photos">
						{#each record.payload.attachments as photo (photo.id)}
							<button type="button" class="pic" aria-label={t('photo.open')} onclick={() => openPhoto(photo)}>
								<PhotoThumb {photo} label={t('photo.alt')} size={56} />
							</button>
						{/each}
					</div>
					{#if !connection.online && record.payload.attachments.some((a) => !(a.thumbId in photoQueue.ids || a.id in photoQueue.ids))}
						<p class="photonote small muted">{t('photo.offlineNote')}</p>
					{/if}
				{/if}
			</li>
		{/each}
	</ol>
{:else if store.status !== 'ready'}
	<div class="loading" role="status">
		<Spinner size={28} /><span class="sr-only">{t('common.loading')}</span>
	</div>
{:else if isToday}
	<EmptyState icon="sunrise" title={t('today.empty.title')} body={t('today.empty.body')} />
{:else}
	<EmptyState icon="sunrise" body={t('today.emptyDay.body')} />
{/if}

<style>
	.photos {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		padding: 0 var(--sp-3) var(--sp-3) calc(var(--sp-3) + 3.2rem);
	}
	.photonote {
		padding: 0 var(--sp-3) var(--sp-3) calc(var(--sp-3) + 3.2rem);
		margin-top: calc(-1 * var(--sp-2));
	}
	.pic {
		padding: 0;
		border-radius: var(--r-sm);
		line-height: 0;
	}
	.pic:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.intro {
		box-shadow:
			inset 0 0 0 1.5px var(--primary),
			var(--shadow-1);
	}
	.card {
		background: var(--surface);
		border-radius: var(--r-lg);
		padding: var(--sp-4);
		box-shadow: var(--shadow-1);
		margin-top: var(--sp-3);
	}
	.card-title {
		font-size: var(--fs-body);
		font-weight: var(--fw-semibold);
	}
	.card-sub {
		font-size: var(--fs-callout);
		color: var(--text-2);
		margin: 2px 0 var(--sp-3);
	}
	.moods {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 6px;
	}
	.mood {
		height: 52px;
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--text-2);
		display: grid;
		place-items: center;
	}
	.mood.on {
		background: var(--feel-tint);
		color: var(--feel-ink);
		box-shadow: inset 0 0 0 2px var(--feel-ink);
	}
	.more {
		margin-top: var(--sp-2);
		min-height: 36px;
		color: var(--primary);
		font-size: var(--fs-callout);
		font-weight: var(--fw-semibold);
	}
	.ep-line {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-medium);
		color: var(--text-2);
		margin-top: 2px;
	}
	.epchip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		max-width: calc(100% - 46px - 40px - 2 * var(--sp-3));
		margin: -4px 0 var(--sp-2) calc(46px + 40px + 2 * var(--sp-3));
		min-height: 28px;
		padding: 0 10px;
		border-radius: var(--r-full);
		background: var(--surface-2);
		border: 1px solid var(--line);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-semibold);
	}
	.epl {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.epchip :global(svg) {
		flex: none;
	}
	.hc-title {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.hc-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.hc-line {
		margin-top: 6px;
	}
	.stop-q {
		font-size: var(--fs-footnote);
		font-weight: var(--fw-medium);
		color: var(--text-2);
		margin: var(--sp-3) 0 var(--sp-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}
	.field {
		width: 100%;
		margin-bottom: var(--sp-3);
		min-width: 0;
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
		font: inherit;
	}
	.warn {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-footnote);
		color: var(--text-2);
	}
	.more:disabled {
		opacity: 0.45;
	}
	.still-text {
		text-wrap: pretty;
	}
	.still-actions {
		display: flex;
		gap: var(--sp-5);
	}
	.still-actions .more {
		margin-top: 0;
	}
	.still-actions .quiet {
		color: var(--text-2);
	}
	.section-title {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
		margin: var(--sp-4) 0 var(--sp-1);
	}
	.day-total {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0 0 var(--sp-1);
		font-size: var(--fs-callout);
		font-weight: var(--fw-medium);
		color: var(--text-2);
	}
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.entry {
		display: grid;
		grid-template-columns: 46px 40px 1fr;
		gap: var(--sp-3);
		align-items: start;
		width: 100%;
		padding: 10px 0;
		text-align: left;
	}
	time {
		font-size: var(--fs-footnote);
		color: var(--text-2);
		padding-top: 10px;
		font-weight: var(--fw-medium);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.withfig {
		flex-direction: row;
		gap: var(--sp-3);
		align-items: flex-start;
	}
	.col {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	.t {
		font-weight: var(--fw-semibold);
	}
	.s {
		font-size: var(--fs-callout);
		color: var(--text-2);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.unsynced {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 4px;
		font-size: var(--fs-caption);
		font-weight: var(--fw-medium);
		color: var(--text-2);
	}
	.unsynced.refused {
		color: var(--pain-ink);
	}
	.unsynced :global(.icon) {
		flex: none;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}
	.tag {
		font-size: var(--fs-caption);
		font-weight: var(--fw-medium);
		padding: 2px 8px;
		border-radius: var(--r-full);
		background: var(--food-tint);
		color: var(--food-ink);
	}
	.loading {
		display: grid;
		place-items: center;
		padding: var(--sp-7) 0;
	}
</style>
