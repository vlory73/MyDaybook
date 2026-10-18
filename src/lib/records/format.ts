/**
 * Timeline wording for every timed record type: category (badge), a title and a one-line summary. Descriptive only:
 * it repeats what the person entered and never rates, scores or advises (not a medical device).
 */
import type { Category } from '$lib/components/categories';
import { t, tn } from '$lib/i18n/index.svelte';
import type { MessageKey } from '$lib/i18n/en';
import { categories } from '$lib/components/categories';
import { instant } from './time';
import type { StoredRecord } from './codec';
import type { TimedPayload } from './types';

export type Described = { category: Category; title: string; summary: string };

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

export function minutesBetween(from: string, to: string): number {
	return Math.max(0, Math.round((instant(to) - instant(from)) / 60_000));
}

const clock = (at: string) => at.slice(11, 16);

/** `typeName` resolves a custom measurement type id to its name. */
export function describe(
	record: StoredRecord<TimedPayload>,
	typeName: (id: string) => string | undefined = () => undefined
): Described {
	const p = record.payload;
	switch (p.type) {
		case 'food':
			return { category: 'food', title: t(`meal.${p.meal}` as MessageKey), summary: firstLine(p.text) };
		case 'feeling': {
			const symptoms = p.symptoms.map((s) => `${s.tag} ${s.severity}/5`).join(', ');
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
			return {
				category: 'sleep',
				title: t('fmt.sleep.title', { duration: formatDuration(minutesBetween(p.asleepAt, p.at)) }),
				summary: join([
					t('fmt.sleep.range', { from: clock(p.asleepAt), to: clock(p.at) }),
					p.quality !== undefined && t('fmt.quality', { n: p.quality }),
					p.awakenings ? tn('fmt.awakenings', p.awakenings) : undefined,
					p.note && firstLine(p.note)
				])
			};
		case 'measurement': {
			const isWeight = p.typeId === 'weight';
			const name = isWeight ? t('cat.weight') : (typeName(p.typeId) ?? t('cat.measure'));
			const values = p.values.map((v) => new Intl.NumberFormat().format(v)).join('/');
			return {
				category: isWeight ? 'weight' : 'measure',
				title: `${name} ${values} ${p.unit}`.trim(),
				summary: join([p.context.join(', '), p.note && firstLine(p.note)])
			};
		}
		case 'bowel':
			return {
				category: 'gut',
				title: t('fmt.bowel.title'),
				summary: join([
					t('fmt.bowel.type', { n: p.bristol }),
					...p.flags.map((f) => t(`bowel.flag.${f}` as MessageKey)),
					p.note && firstLine(p.note)
				])
			};
		case 'note':
			return { category: 'note', title: t(categories.note.label), summary: firstLine(p.text) };
	}
}
