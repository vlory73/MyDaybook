// English messages. Keys are the source of truth: da.ts must provide every key (enforced by its type).
// Placeholders use {name}. Plural forms use the suffixes _one / _other (see core.ts).
export const en = {
	'app.tagline': 'Your private daybook',

	'nav.main': 'Main',
	'nav.today': 'Today',
	'nav.trends': 'Trends',
	'nav.log': 'Log something',
	'nav.meds': 'Meds',
	'nav.me': 'Me',
	'nav.skip': 'Skip to content',

	'common.save': 'Save',
	'common.cancel': 'Cancel',
	'common.close': 'Close',
	'common.back': 'Back',
	'common.undo': 'Undo',
	'common.comingSoon': 'Coming soon',

	'greeting.morning': 'Good morning',
	'greeting.afternoon': 'Good afternoon',
	'greeting.evening': 'Good evening',

	'today.empty.title': 'A fresh page',
	'today.empty.body': 'Nothing logged yet today. Tap + to note a meal, how you feel or your medication.',

	'trends.title': 'Trends',
	'trends.empty.body': 'Your charts appear here once you have logged a few days.',

	'meds.title': 'Medication',
	'meds.empty.body': 'Add the medication you take, and it will show up here at the right times.',

	'me.title': 'Me',
	'me.about.heading': 'About',
	'me.about.purpose':
		'{app} is a personal diary for keeping your own records of food, well-being, health measurements, pain and medication.',
	'me.about.notMedical':
		'It is not a medical device. It gives no advice, no diagnosis, no dose calculations and no alerts based on your values. Talk to a doctor or pharmacist about anything that worries you.',
	'me.about.privacy':
		'Everything you write is encrypted on your device before it is saved. Nobody else can read it, including the person who runs the server.',
	'me.about.licence': 'Licensed under the PolyForm Noncommercial License 1.0.0.',
	'me.theme.heading': 'Appearance',
	'me.theme.system': 'Automatic',
	'me.theme.light': 'Light',
	'me.theme.dark': 'Dark',
	'me.language.heading': 'Language',

	'quicklog.title': 'Log something',
	'quicklog.now': 'Now, {time}',
	'quicklog.footnote': "Encrypted on this phone before it's saved",
	'quicklog.notYet': 'Logging arrives in the next version.',

	'cat.food': 'Meal',
	'cat.feel': 'Feeling',
	'cat.sleep': 'Sleep',
	'cat.pain': 'Pain',
	'cat.meds': 'Medicine',
	'cat.gut': 'Bowel',
	'cat.weight': 'Weight',
	'cat.measure': 'Measure',
	'cat.note': 'Note',

	'entries.count_one': '{count} entry',
	'entries.count_other': '{count} entries'
} as const;

export type MessageKey = keyof typeof en;
