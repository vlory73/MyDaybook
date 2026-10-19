<!-- i18n-ignore-file: developer-only showcase, not shown to users (gated by STYLEGUIDE=1). -->
<script lang="ts">
	import {
		BodyMap,
		Button,
		Card,
		CategoryBadge,
		Chip,
		EmptyState,
		Icon,
		RegionFinder,
		ScalePicker,
		Segmented,
		Sheet,
		TextField,
		Toggle,
		showToast,
		categories,
		type Category
	} from '$lib/components';
	import { i18n } from '$lib/i18n/index.svelte';
	import { regionName, type BodyPlace, type View } from '$lib/bodymap/catalogue';

	let period = $state<'week' | 'month' | 'year'>('week');
	let mood = $state(4);
	let quality = $state(3);
	let reminders = $state(true);
	let note = $state('');
	let sheetOpen = $state(false);
	let qualities = $state<Record<string, boolean>>({ Aching: true });
	const cats = Object.keys(categories) as Category[];

	let mapView = $state<View>('front');
	let tapped = $state<BodyPlace | null>(null);
	let picked = $state('');
	// Synthetic points, only to show the dots.
	const demoPoints: {
		region: 'knee' | 'shoulder';
		side: 'left' | 'right';
		space: '2d-front-v1';
		u: number;
		v: number;
		intensity: number;
	}[] = [
		{ region: 'knee', side: 'right', space: '2d-front-v1', u: 0.5, v: 0.5, intensity: 6 },
		{ region: 'shoulder', side: 'left', space: '2d-front-v1', u: 0.6, v: 0.4, intensity: 2 }
	];

	let cryptoResult = $state('running…');
	$effect(() => {
		void runCryptoSelfTest();
	});

	/** Proves libsodium's WASM loads under the strict CSP. Synthetic data only; key bytes are never rendered. */
	async function runCryptoSelfTest() {
		try {
			const c = await import('$lib/crypto');
			await c.initCrypto();
			const userId = 'selftest-user';
			const account = c.createAccount(userId, 'synthetic self-test passphrase', c.DEFAULT_KDF);
			const keys = c.unlockWithPassphrase(userId, 'synthetic self-test passphrase', account.bundle);
			const sample = { v: 1, type: 'food', text: 'Oatmeal' };
			const enc = c.encryptRecord(keys.kek, userId, 'selftest-record', sample);
			const back = c.decryptRecord<typeof sample>(keys.kek, userId, 'selftest-record', enc);
			if (back.text !== sample.text) throw new Error('round trip mismatch');
			c.wipe(keys);
			c.wipe(account.keys);
			const t0 = performance.now();
			c.deriveFromPassphrase('synthetic self-test passphrase', account.bundle.kdfSalt, c.DEFAULT_KDF);
			cryptoResult = `ok · Argon2id 64 MiB: ${Math.round(performance.now() - t0)} ms`;
		} catch (err) {
			cryptoResult = `failed: ${err instanceof Error ? err.message : String(err)}`;
		}
	}
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

<Card title="Body map">
	<BodyMap bind:view={mapView} points={demoPoints} selected={tapped} ontap={(place) => (tapped = place)} />
	<p class="muted" data-testid="bodymap-tap">
		{#if tapped}{regionName(i18n.locale, tapped.region, tapped.side)} · {tapped.space} · u {tapped.u.toFixed(
				2
			)}, v {tapped.v.toFixed(2)}{:else}Nothing chosen{/if}
	</p>
</Card>

<Card title="Find a body part">
	<RegionFinder
		view={mapView}
		onpick={(place, name) => {
			tapped = place;
			picked = `${name} · ${place.space} · u ${place.u}, v ${place.v}`;
		}}
	/>
	<p class="muted" data-testid="bodymap-pick">{picked || 'Nothing chosen'}</p>
</Card>

<Card title="Crypto self-test">
	<p data-testid="crypto-selftest">{cryptoResult}</p>
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
