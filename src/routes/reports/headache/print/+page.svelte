<script lang="ts">
	import '$lib/reports/report.css';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Icon } from '$lib/components';
	import { t } from '$lib/i18n/index.svelte';
	import { allRecords } from '$lib/records/store.svelte';
	import { buildHeadacheReport } from '$lib/reports/headache';
	import ReportPages from '$lib/reports/ReportPages.svelte';
	import { getReportRequest } from '$lib/reports/state';
	import { dayRange } from '$lib/trends/range';

	// The choices live in memory only (the name must not end up in a URL). After a reload there are none: go back.
	const request = getReportRequest();
	const report = $derived(
		request ? buildHeadacheReport(allRecords(), dayRange(request.from, request.to), request.layout) : null
	);

	const SHEET = {
		table: { w: 1122, h: 793 },
		form: { w: 793, h: 1122 }
	} as const;
	const GAP = 16;
	const size = $derived(SHEET[request?.layout ?? 'table']);
	let available = $state(0);
	const scale = $derived(available > 0 ? Math.min(1, available / size.w) : 1);
	const totalHeight = $derived(report ? report.pageCount * size.h + (report.pageCount - 1) * GAP : size.h);

	let paperSheet: CSSStyleSheet | null = null;
	onMount(() => {
		if (!request) {
			void goto(resolve('/reports/headache'), { replaceState: true });
			return;
		}
		document.documentElement.dataset.print = 'report';
		// Browsers without named pages still get the right paper from a plain @page rule.
		try {
			paperSheet = new CSSStyleSheet();
			paperSheet.replaceSync(
				`@page { size: A4 ${request.layout === 'form' ? 'portrait' : 'landscape'}; margin: 0 }`
			);
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, paperSheet];
		} catch {
			paperSheet = null;
		}
	});
	onDestroy(() => {
		if (typeof document === 'undefined') return;
		delete document.documentElement.dataset.print;
		if (paperSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== paperSheet);
	});
</script>

{#if request && report}
	<div class="report-toolbar">
		<Button variant="quiet" onclick={() => goto(resolve('/reports/headache'))}
			><Icon name="chevron-left" size={20} />{t('reports.preview.back')}</Button
		>
		<Button onclick={() => window.print()}
			><Icon name="printer" size={20} />{t('reports.preview.print')}</Button
		>
	</div>
	<div class="preview" bind:clientWidth={available}>
		<div class="frame" style:--s={scale} style:--w={size.w} style:--h={totalHeight} data-testid="report">
			<div class="zoom" style:--w={size.w}>
				<ReportPages {report} locale={request.locale} name={request.name} />
			</div>
		</div>
	</div>
{/if}

<style>
	.report-toolbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		background: var(--bg);
	}
	.preview {
		width: 100%;
	}
	.frame {
		width: calc(var(--w) * var(--s) * 1px);
		height: calc(var(--h) * var(--s) * 1px);
		overflow: hidden;
		margin: var(--sp-2) 0;
	}
	.zoom {
		width: calc(var(--w) * 1px);
		transform: scale(var(--s));
		transform-origin: top left;
	}

	@media print {
		.frame {
			width: auto;
			height: auto;
			overflow: visible;
			margin: 0;
		}
		.zoom {
			width: auto;
			transform: none;
		}
	}
</style>
