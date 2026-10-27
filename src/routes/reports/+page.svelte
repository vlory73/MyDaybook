<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon } from '$lib/components';
	import { t } from '$lib/i18n/index.svelte';
	import { trackerOn } from '$lib/records/trackers.svelte';
</script>

<div class="nav-head">
	<a class="back" href={resolve('/trends')} aria-label={t('reports.back')}
		><Icon name="chevron-left" size={24} /><span>{t('reports.landing.back')}</span></a
	>
</div>
<header class="page-head">
	<h1 class="large-title">{t('reports.title')}</h1>
</header>

<ul class="list">
	{#if trackerOn('pain')}
		<li>
			<a class="rcard" href={resolve('/reports/headache')} data-testid="report-headache">
				<span class="badge note"><Icon name="thermometer" size={22} /></span>
				<span class="grow">
					<b>{t('reports.headache.title')}</b>
					<small>{t('reports.headache.sub')}</small>
				</span>
				<span class="chev"><Icon name="chevron-right" size={22} /></span>
			</a>
		</li>
	{/if}
	<li>
		<a class="rcard" href={resolve('/reports/doctor')} data-testid="report-doctor">
			<span class="badge meds"><Icon name="file-down" size={22} /></span>
			<span class="grow">
				<b>{t('reports.doctor.title')}</b>
				<small>{t('reports.doctor.sub')}</small>
			</span>
			<span class="chev"><Icon name="chevron-right" size={22} /></span>
		</a>
	</li>
</ul>

<p class="hint-note"><Icon name="lock" size={18} /><span>{t('reports.privacy')}</span></p>

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
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
	}
	.rcard {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-4);
		border-radius: var(--r-lg);
		background: var(--surface);
		box-shadow: var(--shadow-1);
		color: var(--text);
		text-decoration: none;
	}
	.rcard:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.badge {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 32%;
	}
	.badge.note {
		background: var(--note-tint);
		color: var(--note-ink);
	}
	.badge.meds {
		background: var(--meds-tint);
		color: var(--meds-ink);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.grow b {
		display: block;
		font-size: var(--fs-body);
	}
	.grow small {
		display: block;
		margin-top: 2px;
		color: var(--text-2);
		font-size: var(--fs-footnote);
		line-height: 1.3;
	}
	.chev {
		color: var(--text-3);
		display: inline-flex;
	}
	.hint-note {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
		color: var(--text-2);
		font-size: var(--fs-footnote);
		margin: var(--sp-5) 0 0;
	}
</style>
