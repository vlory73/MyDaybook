<!-- i18n-ignore-file: developer-only showcase, not shown to users (gated by STYLEGUIDE=1). -->
<script lang="ts">
	import {
		Button,
		Card,
		CategoryBadge,
		Chip,
		EmptyState,
		Icon,
		ScalePicker,
		Segmented,
		Sheet,
		TextField,
		Toggle,
		showToast,
		categories,
		type Category
	} from '$lib/components';

	let period = $state<'week' | 'month' | 'year'>('week');
	let mood = $state(4);
	let quality = $state(3);
	let reminders = $state(true);
	let note = $state('');
	let sheetOpen = $state(false);
	let qualities = $state<Record<string, boolean>>({ Aching: true });
	const cats = Object.keys(categories) as Category[];
</script>

<header class="page-head"><h1 class="large-title">Components</h1></header>

<Card title="Buttons">
	<div class="row">
		<Button>Save</Button><Button variant="soft"><Icon name="check" size={18} />Taken</Button>
		<Button variant="quiet">Skip</Button><Button size="sm" variant="quiet">Small</Button>
		<Button disabled>Disabled</Button>
	</div>
	<div class="row">
		<Button block size="lg" onclick={() => showToast('Mood logged', () => {})}>Show undo toast</Button>
	</div>
</Card>

<Card title="Chips and segmented control">
	<div class="row">
		{#each ['Sharp', 'Dull', 'Aching', 'Tingling'] as q (q)}
			<Chip selected={qualities[q] ?? false} onclick={() => (qualities[q] = !qualities[q])}>{q}</Chip>
		{/each}
	</div>
	<Segmented
		label="Period"
		bind:value={period}
		options={[
			{ value: 'week', label: 'Week' },
			{ value: 'month', label: 'Month' },
			{ value: 'year', label: 'Year' }
		]}
	/>
</Card>

<Card title="Scales">
	<ScalePicker label="Mood" faces bind:value={mood} />
	<div class="gap"></div>
	<ScalePicker label="Sleep quality" tint="sleep" low="Restless" high="Rested" bind:value={quality} />
</Card>

<Card title="Fields and toggles">
	<TextField label="Note" hint="optional" placeholder="Anything to add?" bind:value={note} />
	<div class="row between">
		<span>Remind me on this phone</span><Toggle label="Reminders" bind:checked={reminders} />
	</div>
</Card>

<Card title="Categories">
	<div class="row">
		{#each cats as c (c)}<CategoryBadge category={c} />{/each}
	</div>
</Card>

<Card title="Sheet">
	<Button variant="quiet" block onclick={() => (sheetOpen = true)}>Open sheet</Button>
</Card>

<Card title="Empty state">
	<EmptyState icon="sunrise" title="A fresh page" body="Nothing logged yet today." />
</Card>

<Sheet bind:open={sheetOpen} title="Example sheet">
	<p class="muted">Sheets rise from the bottom, trap focus and close with Escape or a tap outside.</p>
	<div class="gap"></div>
	<Button block onclick={() => (sheetOpen = false)}>Done</Button>
</Sheet>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin-bottom: var(--sp-3);
	}
	.between {
		justify-content: space-between;
		margin: var(--sp-4) 0 0;
	}
	.gap {
		height: var(--sp-4);
	}
</style>
