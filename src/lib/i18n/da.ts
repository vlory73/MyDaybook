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
	'entries.count_other': '{count} registreringer',

	'common.retry': 'Prøv igen',
	'common.loading': 'Indlæser…',

	'layout.unreachable.title': 'Kan ikke nå serveren',

	'auth.steps': 'Trin {current} af {total}',
	'auth.username': 'Brugernavn',
	'auth.username.hint': 'a–z, 0–9, . _ -',
	'auth.passphrase': 'Adgangssætning',
	'auth.passphrase.repeat': 'Gentag adgangssætning',
	'auth.passphrase.show': 'Vis, hvad jeg skriver',
	'auth.passphrase.help':
		'Brug 4 eller flere tilfældige ord, eller mindst 16 tegn. Du skriver den, hver gang dagbogen låser.',
	'auth.strength': 'Styrke: {level}',
	'auth.strength.weak': 'svag',
	'auth.strength.okay': 'okay',
	'auth.strength.strong': 'stærk',
	'auth.error.fillIn': 'Udfyld alle felter.',
	'auth.error.usernameInvalid':
		'Brugernavne har 3 til 32 tegn: bogstaverne a–z, tal, punktum, understreg eller bindestreg.',
	'auth.error.passphraseWeak':
		'Den adgangssætning er for nem at gætte. Prøv fire tilfældige ord eller mindst 16 tegn.',
	'auth.error.passphraseMismatch': 'De to adgangssætninger er ikke ens.',
	'auth.error.network': 'Kan ikke nå serveren. Tjek din forbindelse, og prøv igen.',
	'auth.error.rateLimited': 'For mange forsøg. Vent et øjeblik, og prøv igen.',
	'auth.error.generic': 'Noget gik galt. Prøv igen.',

	'join.checking': 'Tjekker din invitation…',
	'join.unreachable.title': 'Kan ikke tjekke din invitation',
	'join.invalid.title': 'Invitationslinket virker ikke',
	'join.invalid.body':
		'Det kan være udløbet, allerede brugt eller kopieret ufuldstændigt. Bed den, der inviterede dig, om et nyt link.',
	'join.invalid.signIn': 'Gå til log ind',
	'join.welcome.title': 'Velkommen til {app}',
	'join.welcome.lead':
		'En privat dagbog til dine måltider, dit velbefindende, dine sundhedsmålinger og din medicin.',
	'join.welcome.private': 'Kun du kan læse din dagbog. Ikke engang den, der driver serveren, kan det.',
	'join.welcome.key':
		'Du får en gendannelsesnøgle, som er den eneste ekstranøgle til din dagbog. Vi hjælper dig med at passe på den.',
	'join.welcome.notMedical': '{app} er ikke medicinsk udstyr. Den giver ingen råd eller diagnoser.',
	'join.welcome.start': 'Kom i gang',
	'join.welcome.haveAccount': 'Jeg har allerede en konto',
	'join.account.title': 'Vælg, hvordan du logger ind',
	'join.account.lead':
		'Vælg et brugernavn og en adgangssætning. Din adgangssætning forlader aldrig denne enhed.',
	'join.account.continue': 'Fortsæt',
	'join.account.taken': 'Det brugernavn er optaget. Vælg et andet.',
	'join.creating.title': 'Opretter dine nøgler…',
	'join.creating.body': 'Din telefon klarer det tunge arbejde. Der er ikke sendt noget endnu.',
	'join.consent.create': 'Opret min dagbog',
	'join.consent.required': 'Sæt kryds i feltet for at fortsætte.',
	'join.sending.title': 'Gør din dagbog klar…',
	'join.error.keys': 'Kunne ikke oprette dine nøgler på denne enhed. Prøv igen.',

	'consent.v1.title': 'Før du går i gang',
	'consent.v1.p1':
		'{app} gemmer dine dagbogsnotater, som kan indeholde oplysninger om din helbredstilstand. Alt, hvad du skriver, bliver krypteret på din enhed, før det gemmes, så kun du kan læse det. Serveren og den, der driver den, ser kun uforståelige data.',
	'consent.v1.p2':
		'Ud over dine krypterede notater gemmer serveren kun det, der skal til for at drive din konto: dit brugernavn, hvornår du blev oprettet og sidst loggede ind, og en registrering af dette samtykke.',
	'consent.v1.p3':
		'Du kan til enhver tid trække dit samtykke tilbage ved at slette din konto under Mig. Din dagbog og din konto bliver så slettet. Krypterede sikkerhedskopier forsvinder inden for 14 dage.',
	'consent.v1.checkbox': 'Jeg forstår det og samtykker til, at min dagbog gemmes på denne måde.',

	'recoveryKey.title': 'Din gendannelsesnøgle',
	'recoveryKey.lead':
		'Det er den eneste ekstranøgle til din dagbog. Opbevar den et sikkert sted uden for telefonen, for eksempel udskrevet i en skuffe eller i en adgangskodeadministrator.',
	'recoveryKey.label': 'Gendannelsesnøgle',
	'recoveryKey.group': 'Gruppe {n}',
	'recoveryKey.print': 'Udskriv',
	'recoveryKey.copy': 'Kopiér',
	'recoveryKey.copied': 'Gendannelsesnøglen er kopieret',
	'recoveryKey.copyFailed': 'Kunne ikke kopiere. Skriv nøglen ned i stedet.',
	'recoveryKey.warning.title': 'Ingen andre kan låse din dagbog op.',
	'recoveryKey.warning.body':
		'Hvis du mister både din adgangssætning og denne nøgle, er dine notater væk for altid, og den, der driver serveren, kan heller ikke få dem tilbage.',
	'recoveryKey.next': 'Jeg har gemt den. Tjek mig',
	'recoveryKey.nextHint': 'Derefter skal du skrive to grupper fra nøglen for at bekræfte.',
	'recoveryKey.print.title': 'Gendannelsesnøgle til {app}',
	'recoveryKey.print.account': 'Konto: {username}',
	'recoveryKey.print.date': 'Udskrevet den {date}',
	'recoveryKey.print.how':
		'Sådan bruger du den: Åbn {app}, vælg "Glemt din adgangssætning?" på log ind-skærmen, og skriv denne nøgle.',
	'recoveryKey.print.keep':
		'Opbevar siden et sikkert sted uden for telefonen. Alle, der har den og kender dit brugernavn, kan åbne din dagbog.',

	'recoveryConfirm.title': 'Lad os tjekke den',
	'recoveryConfirm.lead': 'Skriv gruppe {first} og gruppe {second} fra din gendannelsesnøgle.',
	'recoveryConfirm.group': 'Gruppe {n} (4 tegn)',
	'recoveryConfirm.confirm': 'Bekræft',
	'recoveryConfirm.showAgain': 'Vis nøglen igen',
	'recoveryConfirm.mismatch': 'Det passer ikke med nøglen. Tjek det, du har gemt, og prøv igen.',

	'login.title': 'Velkommen tilbage',
	'login.lead': 'Log ind for at åbne din dagbog.',
	'login.submit': 'Log ind',
	'login.forgot': 'Glemt din adgangssætning?',
	'login.invalid': 'Brugernavnet og adgangssætningen passer ikke sammen.',
	'login.noAccount': 'Ny her? Bed den, der driver serveren, om et invitationslink.',
	'login.working': 'Åbner din dagbog…',
	'login.flash.deleted':
		'Din konto er slettet, og din dagbog er fjernet fra serveren. Tak, fordi du brugte {app}. Pas på dig selv.',
	'login.flash.signedOut': 'Du er logget ud.',
	'login.flash.sessionEnded':
		'Din log ind er udløbet, for eksempel fordi adgangssætningen blev ændret. Log ind igen.',

	'unlock.title': 'Din dagbog er låst',
	'unlock.lead': 'Logget ind som {username}. Skriv din adgangssætning for at åbne den.',
	'unlock.submit': 'Lås op',
	'unlock.working': 'Låser op…',
	'unlock.wrong': 'Adgangssætningen passer ikke.',
	'unlock.notYou': 'Er det ikke dig? Log ud',
	'unlock.forgot': 'Glemt din adgangssætning?',

	'recover.title': 'Kom ind i din dagbog igen',
	'recover.lead': 'Skriv dit brugernavn og den gendannelsesnøgle, du gemte, da du blev oprettet.',
	'recover.key': 'Gendannelsesnøgle',
	'recover.key.hint': 'mellemrum og bindestreger er ligegyldige',
	'recover.keyInvalid': 'Det ligner ikke en gendannelsesnøgle. Den har 32 bogstaver og tal i 8 grupper à 4.',
	'recover.wrong': 'Brugernavnet og gendannelsesnøglen passer ikke sammen.',
	'recover.oldKeyNote':
		'Når du er færdig, holder denne gendannelsesnøgle op med at virke. Du får en ny, som du skal gemme.',
	'recover.continue': 'Fortsæt',
	'recover.backToSignIn': 'Tilbage til log ind',
	'recover.checking': 'Tjekker din nøgle…',
	'recover.passphrase.title': 'Vælg en ny adgangssætning',
	'recover.passphrase.lead': 'Din dagbog er åben. Vælg en ny adgangssætning til at beskytte den.',
	'recover.passphrase.continue': 'Fortsæt',
	'recover.newKey.lead':
		'Det er din nye gendannelsesnøgle, og den gamle virker ikke længere. Opbevar den nye et sikkert sted uden for telefonen.',
	'recover.finishing': 'Gør klar…',
	'recover.expired':
		'Det tog mere end fem minutter, så af hensyn til din sikkerhed må vi starte forfra. Din dagbog og din gamle nøgle er uændrede.',

	'me.account.heading': 'Konto',
	'me.account.signedInAs': 'Logget ind som {username}',
	'me.account.lockNow': 'Lås nu',
	'me.account.signOut': 'Log ud',
	'me.autolock.heading': 'Automatisk lås',
	'me.autolock.label': 'Lås efter',
	'me.autolock.option': '{minutes} min.',
	'me.autolock.hint':
		'Dagbogen låser, når den ikke har været brugt så længe, og efter ét minut, hvis du forlader siden eller appen.',
	'me.passphrase.heading': 'Adgangssætning',
	'me.passphrase.lead': 'Dine notater forbliver, som de er. Dine andre enheder bliver logget ud.',
	'me.passphrase.open': 'Skift adgangssætning',
	'me.passphrase.current': 'Nuværende adgangssætning',
	'me.passphrase.new': 'Ny adgangssætning',
	'me.passphrase.wrong': 'Den nuværende adgangssætning passer ikke.',
	'me.passphrase.done': 'Adgangssætningen er ændret. Andre enheder blev logget ud.',
	'me.danger.heading': 'Slet konto',
	'me.danger.lead': 'Det sletter din dagbog og din konto fra serveren. Det kan ikke fortrydes.',
	'me.danger.backups': 'Krypterede sikkerhedskopier gemmes i op til 14 dage og forsvinder derefter.',
	'me.danger.export': 'Du kan endnu ikke eksportere din dagbog først. Det kommer i en senere version.',
	'me.danger.withdraw':
		'Når du sletter din konto, trækker du også det samtykke tilbage, du gav ved oprettelsen.',
	'me.danger.open': 'Slet min konto…',
	'me.danger.confirmTitle': 'Slet din konto?',
	'me.danger.passphrase': 'Skriv din adgangssætning for at bekræfte',
	'me.danger.confirm': 'Slet alt',
	'me.danger.wrong': 'Adgangssætningen passer ikke.',
	'me.danger.lastGuardian':
		'Du er den eneste værge for en afhængig profil. Tilføj en anden værge eller fjern profilen først.'
};
