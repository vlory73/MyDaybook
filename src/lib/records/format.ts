/**
 * Timeline wording for every timed record type: category (badge), a title and a one-line summary. Descriptive only:
 * it repeats what the person entered and never rates, scores or advises (not a medical device).
 */
import type { Category } from '$lib/components/categories';
import { i18n, t, tn } from '$lib/i18n/index.svelte';
import type { MessageKey } from '$lib/i18n/en';
import { categories } from '$lib/components/categories';
import { mlToCl, storedLabel } from './drinks';
import { painSummary } from './painEntry';
import { BUILT_IN_CONTEXT, BUILT_IN_MEASURES } from './log';
import { minutesBetween } from './time';
import { exposureTags, inline, suggestionId } from './watch';
import { store } from './store.svelte';
import type { StoredRecord } from './codec';
import type { TimedPayload } from './types';

export type Described = {
	category: Category;
	title: string;
	summary: string;
	tags?: string[];
	/** A nap: shown with the nap icon on a lighter sleep tile. */
	nap?: boolean;
};

/** Resolves record ids to names: custom measurement types and watch-list items. */
export type Names = {
	type?: (id: string) => string | undefined;
	sensitivity?: (id: string) => string | undefined;
	/** Medication name by record id (for dose entries). */
	medication?: (id: string) => string | undefined;
};

/** The name of a built-in drink or size in the language in use. */
export const drinkName = (kind: 'drink' | 'size', id: string): string =>
	t(`drink.${kind === 'drink' ? 'name' : 'size'}.${id}` as MessageKey);

const join = (parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');
const firstLine = (text: string) =>
	text
		.split('\n')
		.find((l) => l.trim() !== '')
		?.trim() ?? '';

/** "7 h 20 min", "2 h", "45 min". */
export function formatDuration(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (h > 0 && m > 0) return t('fmt.duration', { h, m });
	if (h > 0) return t('fmt.duration.hours', { h });
	return t('fmt.duration.minutes', { m });
}

const clock = (at: string) => at.slice(11, 16);

/** Built-in measurement contexts are stored as keys and shown translated; free text is shown as typed. */
const contextLabel = (c: string) =>
	(BUILT_IN_CONTEXT as readonly string[]).includes(c) ? t(`measure.ctx.${c}` as MessageKey) : c;

export function describe(record: StoredRecord<TimedPayload>, names: Names = {}): Described {
	const typeName = names.type ?? (() => undefined);
	const p = record.payload;
	switch (p.type) {
		case 'food':
			return {
				category: 'food',
				title: t(`meal.${p.meal}` as MessageKey),
				summary: firstLine(p.text),
				tags: exposureTags(p.exposures, names.sensitivity ?? (() => undefined), {
					yes: (name) => t('exposure.yes', { name: inline(name) }),
					// "Gluten-free" opens with the name, so it keeps its capital; "Uden gluten" has it mid-sentence.
					no: (name) =>
						t('exposure.no', {
							name: t('exposure.no', { name: '\u0000' }).startsWith('\u0000') ? name : inline(name)
						}),
					unsure: (name) => t('exposure.unsure', { name: inline(name) })
				})
			};
		case 'feeling': {
			const symptoms = p.symptoms.map((s) => (s.severity ? `${s.tag} (${s.severity})` : s.tag)).join(', ');
			return {
				category: 'feel',
				title: t(categories.feel.label),
				summary: join([
					p.mood !== undefined && t('fmt.mood', { n: p.mood }),
					p.energy !== undefined && t('fmt.energy', { n: p.energy }),
					p.stress !== undefined && t('fmt.stress', { n: p.stress }),
					symptoms,
					p.note && firstLine(p.note)
				])
			};
		}
		case 'sleep':
			if (p.kind === 'nap')
				return {
					category: 'sleep',
					nap: true,
					title: t('fmt.nap.title', { duration: formatDuration(minutesBetween(p.asleepAt, p.at)) }),
					summary: join([
						t('fmt.sleep.range', { from: clock(p.asleepAt), to: clock(p.at) }),
						p.quality !== undefined && t('fmt.quality', { n: p.quality }),
						p.note && firstLine(p.note)
					])
				};
			return {
				category: 'sleep',
				title: t('fmt.sleep.title', { duration: formatDuration(minutesBetween(p.asleepAt, p.at)) }),
				summary: join([
					t('fmt.sleep.range', { from: clock(p.asleepAt), to: clock(p.at) }),
					p.quality !== undefined && t('fmt.quality', { n: p.quality }),
					p.awakenings ? tn('fmt.awakenings', p.awakenings) : undefined,
					p.naps?.length ? tn('fmt.naps', p.naps.length) : undefined,
					p.note && firstLine(p.note)
				])
			};
		case 'measurement': {
			const isWeight = p.typeId === 'weight';
			const builtIn = BUILT_IN_MEASURES.find((b) => b.id === p.typeId);
			const name = isWeight
				? t('cat.weight')
				: builtIn
					? t(builtIn.key)
					: (typeName(p.typeId) ?? t('cat.measure'));
			const values = p.values.map((v) => new Intl.NumberFormat().format(v)).join('/');
			return {
				category: isWeight ? 'weight' : 'measure',
				title: `${name} ${values} ${p.unit}`.trim(),
				summary: join([p.context.map(contextLabel).join(', '), p.note && firstLine(p.note)])
			};
		}
		case 'bowel':
			return {
				category: 'gut',
				title: t('fmt.bowel.title'),
				summary: join([
					t('fmt.bowel.type', { n: p.bristol, name: t(`bowel.type.${p.bristol}` as MessageKey) }),
					...p.flags.map((f) => t(`bowel.flag.${f}` as MessageKey)),
					p.note && firstLine(p.note)
				])
			};
		case 'gut':
			return {
				category: 'stomach',
				title: p.symptoms
					.map((s) => t('fmt.gut.symptom', { name: t(`gut.kind.${s.kind}` as MessageKey), n: s.intensity }))
					.join(' · '),
				summary: join([...p.flags.map((f) => t(`gut.flag.${f}` as MessageKey)), p.note && firstLine(p.note)])
			};
		case 'dose': {
			// Repeats what was logged: the name, the status, the time of a late dose and the amount as entered.
			const name = names.medication?.(p.medicationId) ?? t('cat.meds');
			return {
				category: 'meds',
				title:
					p.status === 'late'
						? t('fmt.dose.late', { name, time: clock(p.at) })
						: t(p.status === 'skipped' ? 'fmt.dose.skipped' : 'fmt.dose.taken', { name }),
				summary: join([p.amount, !p.slot && t('dose.asNeeded'), p.note && firstLine(p.note)])
			};
		}
		case 'drink': {
			// What was logged, as it was logged: the drink and size are the names saved with the entry.
			const total = t('fmt.cl', { n: mlToCl(p.totalMl) });
			const size = p.size ? storedLabel('size', p.size, drinkName) : '';
			return {
				category: 'drink',
				title: storedLabel('drink', p.drink, drinkName),
				summary: join([
					!size
						? t('fmt.drink.custom', { total })
						: t(p.count > 1 ? 'fmt.drink.many' : 'fmt.drink.one', { count: p.count, size, total }),
					p.note && firstLine(p.note)
				])
			};
		}
		case 'pain':
			// The places and numbers the person chose, as entered; nothing is rated or compared.
			return {
				category: 'pain',
				title: t(categories.pain.label),
				summary: painSummary(i18n.locale, p.points)
			};
		case 'note':
			return { category: 'note', title: t(categories.note.label), summary: firstLine(p.text) };
	}
}

/** A watch-list label in the language in use: suggestions are translated, free text is shown as typed. */
export function sensitivityName(label: string): string {
	const id = suggestionId(label);
	return id ? t(`sens.${id}` as MessageKey) : label;
}

/** Name lookups backed by the decrypted store (reactive when called inside effects or deriveds). */
export const lookups: Names = {
	type(id) {
		const p = store.items[id]?.payload;
		return p?.type === 'measurement_type' ? p.name : undefined;
	},
	medication(id) {
		const p = store.items[id]?.payload;
		return p?.type === 'medication' ? p.name : undefined;
	},
	sensitivity(id) {
		const p = store.items[id]?.payload;
		return p?.type === 'sensitivity' ? sensitivityName(p.label) : undefined;
	}
};
