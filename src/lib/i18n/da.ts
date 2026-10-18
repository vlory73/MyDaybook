import type { MessageKey } from './en';

// Danish messages. The type makes the compiler reject a missing or misspelled key.
// Copy is a first draft; a native review is planned for M7.
export const da: Record<MessageKey, string> = {
	'app.tagline': 'Din private dagbog',

	'nav.main': 'Hovedmenu',
	'nav.today': 'I dag',
	'nav.trends': 'Udvikling',
	'nav.log': 'Registrér noget',
	'nav.meds': 'Medicin',
	'nav.me': 'Mig',
	'nav.skip': 'Gå til indhold',

	'common.save': 'Gem',
	'common.cancel': 'Annullér',
	'common.close': 'Luk',
	'common.back': 'Tilbage',
	'common.undo': 'Fortryd',
	'common.comingSoon': 'Kommer snart',

	'greeting.morning': 'Godmorgen',
	'greeting.afternoon': 'God eftermiddag',
	'greeting.evening': 'Godaften',

	'today.empty.title': 'En frisk side',
	'today.empty.body':
		'Intet registreret i dag endnu. Tryk på + for at notere et måltid, hvordan du har det, eller din medicin.',

	'trends.title': 'Udvikling',
	'trends.empty.body': 'Dine grafer vises her, når du har registreret nogle dage.',

	'meds.title': 'Medicin',
	'meds.empty.body': 'Tilføj den medicin, du tager, så vises den her på de rigtige tidspunkter.',

	'me.title': 'Mig',
	'me.about.heading': 'Om',
	'me.about.purpose':
		'{app} er en personlig dagbog, hvor du selv kan føre optegnelser over mad, trivsel, helbredsmålinger, smerter og medicin.',
	'me.about.notMedical':
		'Den er ikke medicinsk udstyr. Den giver ingen råd, ingen diagnoser, ingen dosisberegninger og ingen advarsler ud fra dine værdier. Tal med en læge eller et apotek om alt, der bekymrer dig.',
	'me.about.privacy':
		'Alt, hvad du skriver, krypteres på din enhed, før det gemmes. Ingen andre kan læse det, heller ikke den, der driver serveren.',
	'me.about.licence': 'Licenseret under PolyForm Noncommercial License 1.0.0.',
	'me.theme.heading': 'Udseende',
	'me.theme.system': 'Automatisk',
	'me.theme.light': 'Lyst',
	'me.theme.dark': 'Mørkt',
	'me.language.heading': 'Sprog',

	'quicklog.title': 'Registrér noget',
	'quicklog.now': 'Nu, {time}',
	'quicklog.footnote': 'Krypteres på denne telefon, før det gemmes',
	'quicklog.notYet': 'Registrering kommer i næste version.',

	'cat.food': 'Måltid',
	'cat.feel': 'Humør',
	'cat.sleep': 'Søvn',
	'cat.pain': 'Smerte',
	'cat.meds': 'Medicin',
	'cat.gut': 'Toilet',
	'cat.weight': 'Vægt',
	'cat.measure': 'Måling',
	'cat.note': 'Note',

	'entries.count_one': '{count} registrering',
	'entries.count_other': '{count} registreringer'
};
