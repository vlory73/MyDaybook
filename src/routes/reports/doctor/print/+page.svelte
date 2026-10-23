<script lang="ts">
	import '$lib/reports/report.css';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Icon } from '$lib/components';
	import { t } from '$lib/i18n/index.svelte';
	import { allRecords } from '$lib/records/store.svelte';
	import { todayKey } from '$lib/records/time';
	import { buildDoctorReport } from '$lib/reports/doctor';
	import DoctorPages from '$lib/reports/DoctorPages.svelte';
	import { buildHeadacheReport } from '$lib/reports/headache';
	import ReportPages from '$lib/reports/ReportPages.svelte';
	import { getDoctorRequest, loadLayout } from '$lib/reports/state';
	import { dayRange } from '$lib/trends/range';

	// The choices live in memory only (the name and the questions must not end up in a URL). After a reload there are
	// none: go back to the options.
	const request = getDoctorRequest();
	const today = todayKey();
	const days = request ? dayRange(request.from, request.to) : [];
	const report = $derived(
		request
			? buildDoctorReport(
					allRecords(),
					days,
					{ questions: request.questions, include: request.include },
					request.locale,
					today
				)
			: null
	);
	const headache = $derived(
		request && request.include.headachePages ? buildHeadacheReport(allRecords(), days, loadLayout()) : null
	);

	// The doctor's sheets are A4 portrait; appended headache pages may be landscape (the table layout).
	const WIDTH = $derived(headache && headache.layout === 'table' ? 1122 : 794);
	let available = $state(0);
	let contentHeight = $state(0);
	const scale = $derived(available > 0 ? Math.min(1, available / WIDTH) : 1);

	let paperSheet: CSSStyleSheet | null = null;
	onMount(() => {
		if (!request) {
			void goto(resolve('/reports/doctor'), { replaceState: true });
			return;
		}
		document.documentElement.dataset.print = 'report';
		// Browsers without named pages still get portrait paper from a plain @page rule.
		try {
			paperSheet = new CSSStyleSheet();
			paperSheet.replaceSync('@page { size: A4 portrait; margin: 0 }');
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
		<Button variant="quiet" onclick={() => goto(resolve('/reports/doctor'))}
			><Icon name="chevron-left" size={20} />{t('reports.preview.back')}</Button
		>
		<Button onclick={() => window.print()}
			><Icon name="printer" size={20} />{t('reports.preview.print')}</Button
		>
	</div>
	<div class="preview" bind:clientWidth={available}>
		<div class="frame" style:--s={scale} style:--w={WIDTH} style:--h={contentHeight} data-testid="report">
			<div class="zoom" style:--w={WIDTH} bind:clientHeight={contentHeight}>
				<div class="all">
					<DoctorPages
						{report}
						locale={request.locale}
						name={request.name}
						{today}
						last={!headache || headache.empty}
					/>
					{#if headache && !headache.empty}
						<ReportPages report={headache} locale={request.locale} name={request.name} />
					{/if}
				</div>
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
	.all {
		display: flex;
		flex-direction: column;
		gap: 16px;
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
		.all {
			gap: 0;
		}
	}
</style>
