<script lang="ts">
	import Chip from './Chip.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import Icon from './Icon.svelte';
	import { iconNames, type IconName } from './icon-names';
	import LogSheet from './LogSheet.svelte';
	import MealDrinkSheet from './MealDrinkSheet.svelte';
	import Toggle from './Toggle.svelte';
	import WatchListSheet from './WatchListSheet.svelte';
	import { t, tn } from '$lib/i18n/index.svelte';
	import { PhotoDrafts } from '$lib/photos/drafts.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { drinkPillText, mlToCl } from '$lib/records/drinks';
	import { drinkName, sensitivityName } from '$lib/records/format';
	import { allRecords, save } from '$lib/records/store.svelte';
	import { fromLocalInput } from '$lib/records/time';
	import {
		EXPOSURE_STATES,
		MEALS,
		WHERE,
		type Exposure,
		type ExposureState,
		type DrinkPayload,
		type FoodPayload,
		type Meal,
		type Payload,
		type SavedMealPayload
	} from '$lib/records/types';
	import { mealByHour, savedMealName, watchedItems } from '$lib/records/watch';

	const photos = new PhotoDrafts();
	let time = $state('');
	let mealChoice = $state<Meal | undefined>();
	let text = $state('');
	let tags = $state<string[]>([]);
	let newTag = $state('');
	let where = $state<(typeof WHERE)[number] | undefined>();
	let exposures = $state<Record<string, ExposureState>>({});
	let savedId = $state<string | null>(null);
	let saveAsMeal = $state(false);
	/** Drinks added to a new meal; each is saved as its own drink entry with the meal's time. */
	let drinks = $state<{ key: string; payload: DrinkPayload }[]>([]);
	let drinkOpen = $state(false);
	/** The drink being changed, else null for a new one. */
	let drinkEditKey = $state<string | null>(null);
	let editing = $state(false);

	// New meals start with the type that fits the hour on the time chip, until the person picks one.
	const meal = $derived<Meal>(
		mealChoice ?? mealByHour(time.length >= 13 ? Number(time.slice(11, 13)) : new Date().getHours())
	);
	const watched = $derived(watchedItems(allRecords()));
	const saved = $derived.by(() => {
		const out: { id: string; payload: SavedMealPayload }[] = [];
		for (const r of allRecords())
			if (r.payload.type === 'saved_meal') out.push({ id: r.id, payload: r.payload });
		return out.sort((a, b) => a.payload.name.localeCompare(b.payload.name));
	});

	function onopen(existing: Payload | null) {
		const f = existing?.type === 'food' ? existing : null;
		mealChoice = f?.meal;
		text = f?.text ?? '';
		tags = f?.tags ?? [];
		newTag = '';
		where = f?.where;
		exposures = Object.fromEntries((f?.exposures ?? []).map((e) => [e.id, e.state]));
		savedId = null;
		saveAsMeal = false;
		drinks = [];
		drinkOpen = false;
		editing = f !== null;
	}

	/** One tap on a saved meal fills in everything. */
	function useSaved(s: { id: string; payload: SavedMealPayload }) {
		mealChoice = s.payload.meal;
		text = s.payload.text;
		tags = [...s.payload.tags];
		exposures = Object.fromEntries(s.payload.exposures.map((e) => [e.id, e.state]));
		savedId = s.id;
		saveAsMeal = false;
	}

	function setExposure(id: string, state: ExposureState) {
		const next = { ...exposures };
		if (next[id] === state) delete next[id];
		else next[id] = state;
		exposures = next;
	}

	function addTag() {
		const tag = newTag.trim().slice(0, 40);
		if (tag && !tags.includes(tag)) tags = [...tags, tag];
		newTag = '';
	}

	/** Only items on the watch list are stored, in the order of the list. */
	const exposureList = (): Exposure[] =>
		watched.flatMap((w) => (exposures[w.id] ? [{ id: w.id, state: exposures[w.id]! }] : []));

	const valid = $derived(text.trim() !== '' && fromLocalInput(time) !== null);

	function payload(): Payload | null {
		const at = fromLocalInput(time);
		if (!at || !valid) return null;
		const p: FoodPayload = { v: 1, type: 'food', at, meal, text: text.trim(), tags };
		if (where) p.where = where;
		const list = exposureList();
		if (list.length > 0) p.exposures = list;
		return p;
	}

	/** "Save as a meal I eat often": update the saved meal that was used (or has the same name), else add one. */
	async function saveMealToo() {
		if (!saveAsMeal || !valid) return;
		const name = savedMealName(text);
		const same = saved.find((s) => s.id === savedId || s.payload.name.toLowerCase() === name.toLowerCase());
		await save(
			{ v: 1, type: 'saved_meal', name, meal, text: text.trim(), tags, exposures: exposureList() },
			same?.id
		);
	}

	const cl = (ml: number) => t('fmt.cl', { n: mlToCl(ml) });
	const pillText = (p: DrinkPayload) => drinkPillText(p, drinkName, cl);
	const drinkBeingChanged = $derived(drinks.find((d) => d.key === drinkEditKey)?.payload ?? null);

	function addDrink(p: DrinkPayload) {
		if (drinkEditKey && drinks.some((d) => d.key === drinkEditKey))
			drinks = drinks.map((d) => (d.key === drinkEditKey ? { ...d, payload: p } : d));
		else drinks = [...drinks, { key: crypto.randomUUID(), payload: p }];
	}

	function openDrink(key: string | null) {
		drinkEditKey = key;
		drinkOpen = true;
	}

	/** The drinks as their own records, at the meal's time. */
	function drinkRecords(meal: Payload): Payload[] {
		const at = meal.type === 'food' ? meal.at : null;
		return at ? drinks.map((d) => ({ ...d.payload, at })) : [];
	}

	const iconFor = (icon: string): IconName =>
		((iconNames as readonly string[]).includes(icon) ? icon : 'utensils') as IconName;
	const stateLabel = (s: ExposureState) => t(`exposure.state.${s}` as MessageKey);

	/** The watch list opens on top of the meal, so nothing typed is lost. */
	let watchOpen = $state(false);
</script>

<LogSheet
	kind="food"
	title={t('cat.food')}
	{valid}
	{payload}
	{onopen}
	onbeforesave={saveMealToo}
	alsoSave={drinkRecords}
	alsoSavedText={(n) => tn('meal.drinks.saved', n)}
	{photos}
	bind:time
>
	<div class="chip-row" role="group" aria-label={t('meal.type')}>
		{#each MEALS as m (m)}
			<Chip selected={meal === m} onclick={() => (mealChoice = m)}>{t(`meal.${m}` as MessageKey)}</Chip>
		{/each}
	</div>

	{#if saved.length > 0}
		<p class="label">{t('meal.often')}<span class="hint">{t('meal.often.hint')}</span></p>
		<div class="chip-row">
			{#each saved as s (s.id)}
				<Chip selected={savedId === s.id} onclick={() => useSaved(s)}
					><Icon name="bookmark" size={16} />{s.payload.name}</Chip
				>
			{/each}
		</div>
	{/if}

	<p class="label">{t('meal.what')}</p>
	<textarea
		rows="2"
		aria-label={t('meal.what')}
		placeholder={t('meal.placeholder')}
		maxlength="2000"
		bind:value={text}
	></textarea>

	<div class="chip-row" aria-label={t('meal.tags')} role="group">
		{#each tags as tag (tag)}
			<Chip selected onclick={() => (tags = tags.filter((x) => x !== tag))}
				>{tag}<Icon name="x" size={14} /></Chip
			>
		{/each}
	</div>
	<form
		class="inline"
		onsubmit={(e) => {
			e.preventDefault();
			addTag();
		}}
	>
		<input
			aria-label={t('meal.tags.add')}
			placeholder={t('meal.tags.add')}
			maxlength="40"
			bind:value={newTag}
		/>
		<button type="submit" class="go"><Icon name="tag" size={18} />{t('common.add')}</button>
	</form>

	{#if !editing}
		<p class="label">{t('meal.drinks')}<span class="hint">{t('meal.drinks.hint')}</span></p>
		<div class="chip-row" role="group" aria-label={t('meal.drinks')}>
			{#each drinks as d (d.key)}
				{@const text = pillText(d.payload)}
				<span class="dpill">
					<button
						type="button"
						class="what-btn"
						aria-label={t('meal.drinks.change', { drink: text })}
						onclick={() => openDrink(d.key)}><Icon name="droplets" size={16} /><span>{text}</span></button
					>
					<button
						type="button"
						class="x"
						aria-label={t('meal.drinks.remove', { drink: text })}
						onclick={() => (drinks = drinks.filter((x) => x.key !== d.key))}
						><Icon name="x" size={14} /></button
					>
				</span>
			{/each}
			<Chip onclick={() => openDrink(null)}><Icon name="plus" size={16} />{t('meal.drinks.add')}</Chip>
		</div>
	{/if}

	<p class="label">{t('meal.watch')}<span class="hint">{t('meal.watch.hint')}</span></p>
	{#if watched.length === 0}
		<p class="muted small">
			{t('meal.watch.none')}
			<button type="button" class="link" onclick={() => (watchOpen = true)}>{t('meal.watch.setup')}</button>
		</p>
	{:else}
		{#each watched as w (w.id)}
			{@const name = sensitivityName(w.payload.label)}
			<div class="tri">
				<span class="what"><Icon name={iconFor(w.payload.icon)} size={20} />{name}</span>
				<div class="seg" role="radiogroup" aria-label={name}>
					{#each EXPOSURE_STATES as s (s)}
						<button
							type="button"
							role="radio"
							aria-checked={exposures[w.id] === s}
							class:on={exposures[w.id] === s}
							class:yes={exposures[w.id] === s && s === 'yes'}
							onclick={() => setExposure(w.id, s)}>{stateLabel(s)}</button
						>
					{/each}
				</div>
			</div>
		{/each}
	{/if}

	<p class="label">{t('meal.where')}<span class="hint">{t('common.optional')}</span></p>
	<div class="chip-row" role="group" aria-label={t('meal.where')}>
		{#each WHERE as w (w)}
			<Chip selected={where === w} onclick={() => (where = where === w ? undefined : w)}
				>{t(`meal.where.${w}` as MessageKey)}</Chip
			>
		{/each}
	</div>

	<PhotoPicker drafts={photos} />

	<div class="often">
		<span>{t('meal.saveAs')}</span>
		<Toggle bind:checked={saveAsMeal} label={t('meal.saveAs')} />
	</div>
</LogSheet>

<WatchListSheet bind:open={watchOpen} />
<MealDrinkSheet bind:open={drinkOpen} drink={drinkBeingChanged} onadd={addDrink} />

<style>
	.dpill {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		border-radius: var(--r-full);
		background: var(--drink-tint);
		color: var(--drink-ink);
		font-weight: var(--fw-medium);
	}
	.dpill button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		color: inherit;
	}
	.dpill .what-btn {
		padding: 0 4px 0 var(--sp-3);
		text-align: left;
	}
	.dpill .x {
		min-width: 40px;
		justify-content: center;
		border-radius: var(--r-full);
	}
	.inline {
		display: flex;
		gap: var(--sp-2);
	}
	.inline input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: var(--r-md);
		border: 1.5px solid transparent;
		background: var(--surface-2);
	}
	.inline input:focus-visible {
		outline: none;
		border-color: var(--focus);
	}
	.go {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 var(--sp-3);
		border-radius: var(--r-md);
		background: var(--primary-soft);
		color: var(--primary-press);
		font-weight: var(--fw-semibold);
	}
	.tri {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: var(--fw-semibold);
		color: var(--food-ink);
	}
	.seg {
		display: flex;
		flex: none;
		background: var(--surface-2);
		border-radius: var(--r-full);
		padding: 3px;
	}
	.seg button {
		min-height: 34px;
		padding: 0 10px;
		border-radius: var(--r-full);
		font-size: var(--fs-footnote);
		font-weight: var(--fw-medium);
		color: var(--text-2);
		white-space: nowrap;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-1);
		font-weight: var(--fw-semibold);
	}
	.seg button.yes {
		background: var(--food-tint);
		color: var(--food-ink);
		box-shadow: none;
		font-weight: var(--fw-bold);
	}
	.link {
		color: var(--primary);
		font-weight: var(--fw-semibold);
		text-decoration: underline;
	}
	.often {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		font-weight: var(--fw-medium);
		padding: var(--sp-2) 0;
	}
</style>
