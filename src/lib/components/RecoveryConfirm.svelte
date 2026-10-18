<script lang="ts">
	import { untrack } from 'svelte';
	import Button from './Button.svelte';
	import Hero from './Hero.svelte';
	import Notice from './Notice.svelte';
	import TextField from './TextField.svelte';
	import { focusOnMount } from '$lib/actions';
	import { t } from '$lib/i18n/index.svelte';

	/** "Type groups 3 and 7": proves the key was really saved, not just ticked off. */
	let { groups, onconfirmed, onback }: { groups: string[]; onconfirmed: () => void; onback: () => void } =
		$props();

	/** Two different group positions (0-based), ascending, chosen with the browser's CSPRNG. */
	function pickTwo(count: number): [number, number] {
		const pick = (max: number) => {
			const limit = Math.floor(0x100000000 / max) * max;
			const buf = new Uint32Array(1);
			do crypto.getRandomValues(buf);
			while (buf[0]! >= limit);
			return buf[0]! % max;
		};
		const first = pick(count);
		let second = pick(count - 1);
		if (second >= first) second += 1;
		return first < second ? [first, second] : [second, first];
	}

	const [first, second] = untrack(() => pickTwo(groups.length));
	let answerFirst = $state('');
	let answerSecond = $state('');
	let wrong = $state(false);

	/** Case-insensitive, and reads I/L as 1 and O as 0, like the recovery screen does. */
	const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (norm(answerFirst) === norm(groups[first]!) && norm(answerSecond) === norm(groups[second]!)) {
			wrong = false;
			onconfirmed();
		} else {
			wrong = true;
		}
	}
</script>

<Hero icon="key-round" />
<h1 class="large-title center" tabindex="-1" use:focusOnMount>{t('recoveryConfirm.title')}</h1>
<p class="muted center lead">
	{t('recoveryConfirm.lead', { first: first + 1, second: second + 1 })}
</p>

<form onsubmit={submit} class="form" novalidate>
	<TextField
		label={t('recoveryConfirm.group', { n: first + 1 })}
		name="group-a"
		autocomplete="off"
		autocapitalize="characters"
		spellcheck="false"
		maxlength={6}
		bind:value={answerFirst}
	/>
	<TextField
		label={t('recoveryConfirm.group', { n: second + 1 })}
		name="group-b"
		autocomplete="off"
		autocapitalize="characters"
		spellcheck="false"
		maxlength={6}
		bind:value={answerSecond}
	/>
	{#if wrong}<Notice tone="error">{t('recoveryConfirm.mismatch')}</Notice>{/if}
	<Button type="submit" block size="lg">{t('recoveryConfirm.confirm')}</Button>
	<Button variant="quiet" block onclick={onback}>{t('recoveryConfirm.showAgain')}</Button>
</form>

<style>
	.center {
		text-align: center;
	}
	.lead {
		margin: var(--sp-3) 0 var(--sp-5);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
</style>
