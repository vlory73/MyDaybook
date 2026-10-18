<script lang="ts">
	import { onDestroy } from 'svelte';
	import Button from './Button.svelte';
	import Hero from './Hero.svelte';
	import Icon from './Icon.svelte';
	import { showToast } from './toast.svelte';
	import { focusOnMount, toBody } from '$lib/actions';
	import { brand } from '$lib/brand';
	import { i18n, t } from '$lib/i18n/index.svelte';

	/**
	 * Shows the recovery key once, with Print and Copy. This is the one place key material is rendered, because the
	 * person must be able to keep it (D10). Printing shows only a plain sheet: the key, short instructions and the date.
	 */
	let {
		recoveryKey,
		username,
		lead,
		onnext
	}: { recoveryKey: string; username: string; lead?: string; onnext: () => void } = $props();

	const groups = $derived(recoveryKey.split('-'));
	const date = $derived(new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'long' }).format(new Date()));

	function print() {
		const root = document.documentElement;
		root.dataset.print = 'recovery';
		const done = () => {
			delete root.dataset.print;
			window.removeEventListener('afterprint', done);
		};
		window.addEventListener('afterprint', done);
		window.print();
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(recoveryKey);
			showToast(t('recoveryKey.copied'));
		} catch {
			showToast(t('recoveryKey.copyFailed'));
		}
	}

	onDestroy(() => {
		delete document.documentElement.dataset.print;
	});
</script>

<Hero icon="key-round" />
<h1 class="large-title center" tabindex="-1" use:focusOnMount>{t('recoveryKey.title')}</h1>
<p class="muted center lead">{lead ?? t('recoveryKey.lead')}</p>

<div class="key" role="group" aria-label={t('recoveryKey.label')} data-testid="recovery-key">
	{#each groups as group, i (i)}<span>{group}</span>{/each}
</div>

<div class="actions">
	<Button variant="quiet" onclick={print}><Icon name="printer" size={18} />{t('recoveryKey.print')}</Button>
	<Button variant="quiet" onclick={copy}><Icon name="copy" size={18} />{t('recoveryKey.copy')}</Button>
</div>

<div class="warn">
	<Icon name="info" size={22} />
	<p><b>{t('recoveryKey.warning.title')}</b> {t('recoveryKey.warning.body')}</p>
</div>

<div class="next">
	<Button block size="lg" onclick={onnext}>{t('recoveryKey.next')}</Button>
	<p class="small muted center">{t('recoveryKey.nextHint')}</p>
</div>

<!-- Hidden on screen; the print stylesheet (base.css) shows only this element when "Print" is used. -->
<div class="print-sheet" use:toBody>
	<h1>{t('recoveryKey.print.title', { app: brand.displayName })}</h1>
	<p>{t('recoveryKey.print.account', { username })}</p>
	<p class="print-key">{recoveryKey}</p>
	<p>{t('recoveryKey.print.how', { app: brand.displayName })}</p>
	<p>{t('recoveryKey.print.keep')}</p>
	<p>{t('recoveryKey.print.date', { date })}</p>
</div>

<style>
	.center {
		text-align: center;
	}
	.lead {
		margin-top: var(--sp-3);
	}
	.key {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin: var(--sp-5) 0 var(--sp-3);
	}
	.key span {
		font-family: var(--font-mono);
		font-size: 1.0625rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.08em;
		text-align: center;
		padding: 10px 0;
		border-radius: var(--r-sm);
		background: var(--surface);
		box-shadow: var(--shadow-1);
	}
	.actions {
		display: flex;
		gap: var(--sp-3);
	}
	.actions :global(.btn) {
		flex: 1;
	}
	.warn {
		display: flex;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border-radius: var(--r-lg);
		background: var(--note-tint);
		color: var(--note-ink);
		font-size: var(--fs-callout);
		margin-top: var(--sp-4);
	}
	.warn b {
		color: var(--text);
	}
	.next {
		margin-top: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.print-sheet {
		display: none;
	}
	@media print {
		.print-sheet {
			font-family: var(--font-sans);
			color: #000;
			background: #fff;
			padding: 24mm 20mm;
		}
		.print-sheet h1 {
			font-size: 1.6rem;
			margin-bottom: 1rem;
		}
		.print-sheet p {
			margin: 0 0 1rem;
			font-size: 1rem;
			line-height: 1.5;
		}
		.print-key {
			font-family: var(--font-mono);
			font-size: 1.6rem;
			font-weight: 700;
			letter-spacing: 0.1em;
			padding: 1rem 0;
			border-top: 2px solid #000;
			border-bottom: 2px solid #000;
		}
	}
</style>
