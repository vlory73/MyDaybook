import type { MessageKey } from '$lib/i18n/en';
import type { IconName } from './icon-names';

/** Record categories shown in the UI. Tints identify what an entry is; they never judge a value. */
export const categories = {
	food: { icon: 'utensils', label: 'cat.food', tint: 'food' },
	drink: { icon: 'glass', label: 'cat.drink', tint: 'drink' },
	feel: { icon: 'smile', label: 'cat.feel', tint: 'feel' },
	sleep: { icon: 'bed', label: 'cat.sleep', tint: 'sleep' },
	pain: { icon: 'activity', label: 'cat.pain', tint: 'pain' },
	meds: { icon: 'pill', label: 'cat.meds', tint: 'meds' },
	gut: { icon: 'toilet', label: 'cat.gut', tint: 'gut' },
	stomach: { icon: 'stomach', label: 'cat.stomach', tint: 'gut' },
	weight: { icon: 'scale', label: 'cat.weight', tint: 'measure' },
	measure: { icon: 'ruler', label: 'cat.measure', tint: 'measure' },
	note: { icon: 'notebook-pen', label: 'cat.note', tint: 'note' }
} as const satisfies Record<string, { icon: IconName; label: MessageKey; tint: string }>;

export type Category = keyof typeof categories;
