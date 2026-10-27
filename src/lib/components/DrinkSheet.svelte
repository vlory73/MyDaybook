<script lang="ts">
	import DrinkForm from './DrinkForm.svelte';
	import DrinkPresetsSheet from './DrinkPresetsSheet.svelte';
	import LogSheet from './LogSheet.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { Payload } from '$lib/records/types';
	import { fromLocalInput } from '$lib/records/time';

	let time = $state('');
	let editOpen = $state(false);
	let form = $state<DrinkForm>();

	const valid = $derived((form?.isValid() ?? false) && fromLocalInput(time) !== null);

	function payload(): Payload | null {
		const at = fromLocalInput(time);
		return at ? (form?.payload(at) ?? null) : null;
	}
</script>

<LogSheet
	kind="drink"
	title={t('cat.drink')}
	{valid}
	{payload}
	onopen={(existing) => form?.open(existing)}
	onbeforesave={() => form?.rememberOther() ?? Promise.resolve()}
	bind:time
>
	<DrinkForm bind:this={form} onEditPresets={() => (editOpen = true)} />
</LogSheet>

<DrinkPresetsSheet bind:open={editOpen} />
