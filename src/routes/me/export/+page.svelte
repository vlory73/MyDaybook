<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Button,
		Card,
		Icon,
		NeedsConnection,
		Notice,
		Sheet,
		Spinner,
		TextField,
		Toggle
	} from '$lib/components';
	import { formatBytes } from '$lib/admin-format';
	import { connection } from '$lib/connection.svelte';
	import { verifyPassphrase } from '$lib/auth';
	import {
		ExportCancelled,
		PHOTO_ESTIMATE_BYTES,
		buildExport,
		countPhotos,
		roughly
	} from '$lib/export/build';
	import type { BuiltExport } from '$lib/export/build';
	import type { ExportRecord } from '$lib/export/tables';
	import { i18n, t, tn } from '$lib/i18n/index.svelte';
	import type { MessageKey } from '$lib/i18n/en';
	import { downloadPhoto } from '$lib/photos/client';
	import { allRecords, store } from '$lib/records/store.svelte';
	import { onLock } from '$lib/session.svelte';
	import { version } from '../../../../package.json';

	type Phase = 'form' | 'preparing' | 'ready';
	let phase = $state<Phase>('form');
	let includePhotos = $state(true);
	let done = $state(0);
	let total = $state(0);
	let result = $state<BuiltExport | null>(null);
	let failed = $state(false);
	/** Each run has a number; cancelling, dropping or starting again makes an older run stop. */
	let run = 0;

	const ready = $derived(store.status === 'ready');
	const photoCount = $derived(countPhotos(allRecords()));
	const withPhotos = $derived(photoCount > 0 && includePhotos);
	const percent = $derived(total > 0 ? Math.round((done / total) * 100) : 0);

	// ---- Passphrase check ----
	let askOpen = $state(false);
	let passphrase = $state('');
	let askBusy = $state(false);
	let askError = $state<MessageKey | null>(null);
	$effect(() => {
		if (!askOpen) {
			passphrase = '';
			askError = null;
		}
	});

	async function submitPassphrase(event: SubmitEvent) {
		event.preventDefault();
		if (askBusy) return;
		if (passphrase === '') return (askError = 'auth.error.fillIn');
		askBusy = true;
		askError = null;
		try {
			if (!(await verifyPassphrase(passphrase))) return (askError = 'export.pass.wrong');
			askOpen = false;
			void prepare();
		} catch {
			askError = 'export.error';
		} finally {
			askBusy = false;
		}
	}

	// ---- Building ----
	async function prepare() {
		const mine = ++run;
		failed = false;
		done = 0;
		total = 0;
		result = null;
		phase = 'preparing';
		const records: ExportRecord[] = allRecords().map((r) => ({
			id: r.id,
			updatedAt: r.updatedAt,
			payload: r.payload
		}));
		try {
			const built = await buildExport({
				records,
				includePhotos: withPhotos,
				locale: i18n.locale,
				meta: { exportedAt: new Date(), appVersion: version },
				fetchPhoto: downloadPhoto,
				onProgress: (d, n) => {
					done = d;
					total = n;
				},
				isCancelled: () => mine !== run
			});
			if (mine !== run) return;
			result = built;
			phase = 'ready';
		} catch (err) {
			if (mine !== run) return;
			if (!(err instanceof ExportCancelled)) failed = true;
			phase = 'form';
		}
	}

	function cancel() {
		run++;
		phase = 'form';
	}

	function drop() {
		run++;
		result = null;
		phase = 'form';
	}

	// ---- Saving ----
	async function save() {
		if (!result) return;
		const file = new File([result.bytes as BlobPart], result.name, { type: 'application/zip' });
		if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
			try {
				await navigator.share({ files: [file], title: result.name });
				return;
			} catch (err) {
				// The person closed the share sheet: nothing more to do. Anything else falls back to a download.
				if (err instanceof DOMException && err.name === 'AbortError') return;
			}
		}
		const url = URL.createObjectURL(file);
		const link = document.createElement('a');
		link.href = url;
		link.download = result.name;
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}

	// The file is only ever held in memory: leaving the page or locking drops it.
	const unsubscribe = onLock(drop);
	onDestroy(() => {
		unsubscribe();
		run++;
		result = null;
	});
</script>

<div class="nav-head">
	<a class="back" href={resolve('/me')} aria-label={t('export.back')}>
		<Icon name="chevron-left" size={24} /><span>{t('export.backLabel')}</span>
	</a>
</div>
<header class="page-head"><h1 class="large-title">{t('export.title')}</h1></header>

<p class="lead">{t('export.lead')}</p>

<Card title={t('export.inside.heading')}>
	<ul class="inside">
		<li>
			<span class="bul"><Icon name="file-down" size={18} /></span>
			<span>{t('export.inside.json')}</span>
		</li>
		<li>
			<span class="bul"><Icon name="list-checks" size={18} /></span>
			<span>{t('export.inside.csv')}</span>
		</li>
		{#if photoCount > 0}
			<li>
				<span class="bul"><Icon name="camera" size={18} /></span>
				<span>
					{tn('export.inside.photos', photoCount, {
						size: formatBytes(roughly(photoCount * PHOTO_ESTIMATE_BYTES), i18n.locale)
					})}
				</span>
			</li>
		{/if}
		<li>
			<span class="bul"><Icon name="notebook-pen" size={18} /></span>
			<span>{t('export.inside.readme')}</span>
		</li>
	</ul>
</Card>

<div class="toggle-card" class:dim={photoCount === 0 || phase === 'preparing'}>
	<Card>
		<div class="trow">
			<div class="grow">
				<div class="t">{t('export.photos.label')}</div>
				{#if photoCount === 0}<div class="small muted">{t('export.photos.none')}</div>{/if}
			</div>
			<Toggle
				checked={withPhotos}
				onchange={(on) => (includePhotos = on)}
				label={t('export.photos.label')}
				disabled={photoCount === 0 || phase !== 'form'}
			/>
		</div>
	</Card>
</div>

<div class="warn" role="note">
	<Icon name="info" size={20} />
	<div><b>{t('export.warn.title')}</b> {t('export.warn.body')}</div>
</div>

{#if failed}
	<div class="gap"><Notice tone="error">{t('export.error')}</Notice></div>
{/if}

{#if phase === 'form'}
	<div class="gap">
		<Button block size="lg" disabled={!ready || !connection.online} onclick={() => (askOpen = true)}>
			{t('export.prepare')}
		</Button>
		{#if !connection.online}
			<div class="center"><NeedsConnection /></div>
		{:else if !ready}<p class="small muted center">{t('export.loading')}</p>{/if}
	</div>
{:else if phase === 'preparing'}
	<div class="gap">
		<Card>
			<div class="prep" role="status">
				<div class="prep-row">
					<b>
						{#if total > 0}
							{t('export.preparing.photos', { done, total })}
						{:else}
							{t('export.preparing')}
						{/if}
					</b>
					{#if total > 0}<span class="muted">{percent}%</span>{:else}<Spinner size={20} />{/if}
				</div>
				{#if total > 0}
					<div class="bar" aria-hidden="true"><i style:width="{percent}%"></i></div>
				{/if}
				<p class="small muted">{t('export.keepOpen')}</p>
				<div class="center">
					<button type="button" class="link" onclick={cancel}>{t('common.cancel')}</button>
				</div>
			</div>
		</Card>
	</div>
{:else if result}
	<div class="gap">
		<Card>
			<div class="ready" role="status">
				<span class="okmark"><Icon name="circle-check" size={26} /></span>
				<h2>{t('export.ready.title')}</h2>
				<p class="fname" data-testid="export-file">
					<span>{result.name}</span><span class="muted"
						>· {formatBytes(result.bytes.length, i18n.locale)}</span
					>
				</p>
				{#if result.missing > 0}
					<p class="small muted">{tn('export.ready.missing', result.missing)}</p>
				{/if}
				<div class="actions">
					<Button block size="lg" onclick={save}>
						<Icon name="file-down" size={18} />{t('export.ready.save')}
					</Button>
					<p class="small muted">{t('export.ready.help')}</p>
					<Button variant="quiet" block onclick={drop}>{t('export.ready.done')}</Button>
				</div>
			</div>
		</Card>
	</div>
{/if}

<Sheet bind:open={askOpen} title={t('export.pass.title')}>
	<form onsubmit={submitPassphrase} class="form" novalidate>
		<TextField
			label={t('export.pass.label')}
			name="export-passphrase"
			type="password"
			autocomplete="current-password"
			autocapitalize="off"
			spellcheck="false"
			disabled={askBusy}
			bind:value={passphrase}
		/>
		<p class="small muted">{t('export.pass.hint')}</p>
		{#if askError}<Notice tone="error">{t(askError)}</Notice>{/if}
		{#if askBusy}<p class="busy" role="status"><Spinner size={22} />{t('common.loading')}</p>{/if}
		<div class="form-row">
			<Button variant="quiet" block onclick={() => (askOpen = false)}>{t('common.cancel')}</Button>
			<Button type="submit" block disabled={askBusy}>{t('export.pass.continue')}</Button>
		</div>
	</form>
</Sheet>

<style>
	.nav-head {
		display: flex;
		margin-bottom: var(--sp-1);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-height: var(--tap);
		margin-left: calc(-1 * var(--sp-2));
		color: var(--primary);
		text-decoration: none;
		font-weight: var(--fw-semibold);
		font-size: var(--fs-callout);
	}
	.lead {
		color: var(--text-2);
		margin: 0 0 var(--sp-4);
	}
	.inside {
		list-style: none;
		margin: var(--sp-3) 0 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
		font-size: var(--fs-callout);
	}
	.inside li {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
	}
	.inside li > span:last-child {
		padding-top: 5px;
	}
	.bul {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--primary-soft);
		color: var(--primary-press);
		display: grid;
		place-items: center;
		flex: none;
	}
	.toggle-card {
		margin-top: var(--sp-3);
	}
	.toggle-card.dim :global(.card) {
		opacity: 0.6;
	}
	.trow {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.trow .t {
		font-weight: var(--fw-semibold);
	}
	.grow {
		flex: 1;
	}
	.warn {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
		margin-top: var(--sp-3);
		padding: var(--sp-4);
		border-radius: var(--r-lg);
		background: var(--note-tint);
		color: var(--note-ink);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--note-ink) 35%, transparent);
		font-size: var(--fs-callout);
	}
	.warn :global(.icon) {
		margin-top: 1px;
		flex: none;
	}
	.warn b {
		display: block;
	}
	.gap {
		margin-top: var(--sp-4);
	}
	.center {
		text-align: center;
		margin-top: var(--sp-2);
	}
	.prep-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		font-size: var(--fs-callout);
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
		margin-bottom: var(--sp-3);
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: 4px;
		background: var(--primary);
	}
	.link {
		color: var(--primary-press);
		font-weight: var(--fw-semibold);
		min-height: var(--tap);
		padding: 0 var(--sp-3);
	}
	.ready {
		text-align: center;
	}
	.ready h2 {
		font-size: var(--fs-title3);
		font-weight: var(--fw-bold);
	}
	.okmark {
		width: 48px;
		height: 48px;
		border-radius: 16px;
		background: var(--meds-tint);
		color: var(--meds-ink);
		display: grid;
		place-items: center;
		margin: 0 auto var(--sp-3);
	}
	.fname {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		flex-wrap: wrap;
		margin: var(--sp-2) 0 var(--sp-4);
		font-size: var(--fs-callout);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
	}
	.fname .muted {
		font-family: var(--font-sans);
	}
	.actions {
		display: grid;
		gap: var(--sp-3);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: 2px;
	}
	.form-row {
		display: flex;
		gap: var(--sp-2);
	}
	.busy {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text-2);
	}
</style>
