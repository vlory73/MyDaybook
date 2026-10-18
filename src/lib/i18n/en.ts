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
	'entries.count_other': '{count} entries',

	'common.retry': 'Try again',
	'common.loading': 'Loading…',

	'layout.unreachable.title': "Can't reach the server",

	'auth.steps': 'Step {current} of {total}',
	'auth.username': 'Username',
	'auth.username.hint': 'a–z, 0–9, . _ -',
	'auth.passphrase': 'Passphrase',
	'auth.passphrase.repeat': 'Repeat passphrase',
	'auth.passphrase.show': 'Show what I type',
	'auth.passphrase.help':
		'Use 4 or more random words, or at least 16 characters. You will type it whenever your diary locks.',
	'auth.strength': 'Strength: {level}',
	'auth.strength.weak': 'weak',
	'auth.strength.okay': 'okay',
	'auth.strength.strong': 'strong',
	'auth.error.fillIn': 'Please fill in every field.',
	'auth.error.usernameInvalid':
		'Usernames have 3 to 32 characters: the letters a–z, numbers, dot, underscore or hyphen.',
	'auth.error.passphraseWeak':
		'That passphrase is too easy to guess. Try four random words, or at least 16 characters.',
	'auth.error.passphraseMismatch': "The two passphrases don't match.",
	'auth.error.network': "Can't reach the server. Check your connection and try again.",
	'auth.error.rateLimited': 'Too many tries. Please wait a moment and try again.',
	'auth.error.generic': 'Something went wrong. Please try again.',

	'join.checking': 'Checking your invite…',
	'join.unreachable.title': "Can't check your invite",
	'join.invalid.title': "This invite link doesn't work",
	'join.invalid.body':
		'It may have expired, been used already or been copied incompletely. Ask the person who invited you for a new link.',
	'join.invalid.signIn': 'Go to sign in',
	'join.welcome.title': 'Welcome to {app}',
	'join.welcome.lead':
		'A private daybook for your meals, how you feel, your health measurements and your medication.',
	'join.welcome.private': 'Only you can read your diary. Not even the person running this server can.',
	'join.welcome.key':
		'You will get a recovery key, the only spare key to your diary. We will help you keep it safe.',
	'join.welcome.notMedical': '{app} is not a medical device. It gives no advice or diagnosis.',
	'join.welcome.start': 'Get started',
	'join.welcome.haveAccount': 'I already have an account',
	'join.account.title': 'Choose how you sign in',
	'join.account.lead': 'Pick a username and a passphrase. Your passphrase never leaves this device.',
	'join.account.continue': 'Continue',
	'join.account.taken': 'That username is already taken. Please choose another one.',
	'join.creating.title': 'Creating your keys…',
	'join.creating.body': 'Your phone is doing the hard work. Nothing has been sent yet.',
	'join.consent.create': 'Create my diary',
	'join.consent.required': 'Please tick the box to continue.',
	'join.sending.title': 'Setting up your diary…',
	'join.error.keys': 'Could not create your keys on this device. Please try again.',

	'consent.v1.title': 'Before you start',
	'consent.v1.p1':
		'{app} keeps your diary entries, which can include information about your health. Everything you write is encrypted on your device before it is saved, so only you can read it. The server, and the person running it, only ever see scrambled data.',
	'consent.v1.p2':
		'Besides your encrypted entries, the server keeps only what it needs to run your account: your username, when you joined and last signed in, and a record of this agreement.',
	'consent.v1.p3':
		'You can withdraw this agreement at any time by deleting your account under Me. Your diary and account are then erased. Encrypted backup copies disappear within 14 days.',
	'consent.v1.checkbox': 'I understand, and I agree to my diary being stored this way.',

	'recoveryKey.title': 'Your recovery key',
	'recoveryKey.lead':
		'This is the only spare key to your diary. Keep it somewhere safe and offline, such as printed in a drawer or in a password manager.',
	'recoveryKey.label': 'Recovery key',
	'recoveryKey.group': 'Group {n}',
	'recoveryKey.print': 'Print',
	'recoveryKey.copy': 'Copy',
	'recoveryKey.copied': 'Recovery key copied',
	'recoveryKey.copyFailed': "Couldn't copy. Please write the key down instead.",
	'recoveryKey.warning.title': 'Nobody else can unlock your diary.',
	'recoveryKey.warning.body':
		"If you lose both your passphrase and this key, your entries are gone for good, and the person running this server can't get them back either.",
	'recoveryKey.next': "I've stored it. Check me",
	'recoveryKey.nextHint': "Next, you'll type two groups from the key to confirm.",
	'recoveryKey.print.title': '{app} recovery key',
	'recoveryKey.print.account': 'Account: {username}',
	'recoveryKey.print.date': 'Printed on {date}',
	'recoveryKey.print.how':
		'To use it, open {app}, choose "Forgot your passphrase?" on the sign-in screen and type this key.',
	'recoveryKey.print.keep':
		'Keep this page somewhere safe and offline. Anyone who has it and knows your username can open your diary.',

	'recoveryConfirm.title': "Let's check it",
	'recoveryConfirm.lead': 'Type group {first} and group {second} from your recovery key.',
	'recoveryConfirm.group': 'Group {n} (4 characters)',
	'recoveryConfirm.confirm': 'Confirm',
	'recoveryConfirm.showAgain': 'Show the key again',
	'recoveryConfirm.mismatch': "Those don't match the key. Check what you saved and try again.",

	'login.title': 'Welcome back',
	'login.lead': 'Sign in to open your diary.',
	'login.submit': 'Sign in',
	'login.forgot': 'Forgot your passphrase?',
	'login.invalid': "That username and passphrase don't match.",
	'login.noAccount': 'New here? Ask the person running this server for an invite link.',
	'login.working': 'Opening your diary…',
	'login.flash.deleted':
		'Your account is deleted and your diary is erased from the server. Thank you for using {app}. Take care.',
	'login.flash.signedOut': 'You are signed out.',
	'login.flash.sessionEnded':
		'Your sign-in ended, for example because the passphrase was changed. Please sign in again.',

	'unlock.title': 'Your diary is locked',
	'unlock.lead': 'Signed in as {username}. Enter your passphrase to open it.',
	'unlock.submit': 'Unlock',
	'unlock.working': 'Unlocking…',
	'unlock.wrong': "That passphrase doesn't match.",
	'unlock.notYou': 'Not you? Sign out',
	'unlock.forgot': 'Forgot your passphrase?',

	'recover.title': 'Get back into your diary',
	'recover.lead': 'Enter your username and the recovery key you saved when you joined.',
	'recover.key': 'Recovery key',
	'recover.key.hint': 'any spacing works',
	'recover.keyInvalid':
		"That doesn't look like a recovery key. It has 32 letters and numbers, in 8 groups of 4.",
	'recover.wrong': "That username and recovery key don't match.",
	'recover.oldKeyNote': 'When you finish, this recovery key stops working. You will get a new one to keep.',
	'recover.continue': 'Continue',
	'recover.backToSignIn': 'Back to sign in',
	'recover.checking': 'Checking your key…',
	'recover.passphrase.title': 'Choose a new passphrase',
	'recover.passphrase.lead': 'Your diary is open. Choose a new passphrase to protect it.',
	'recover.passphrase.continue': 'Continue',
	'recover.newKey.lead':
		'This is your new recovery key, and the old one no longer works. Keep the new one somewhere safe and offline.',
	'recover.finishing': 'Finishing up…',
	'recover.expired':
		'That took longer than five minutes, so for your safety we need to start again. Your diary and your old key are unchanged.',

	'me.account.heading': 'Account',
	'me.account.signedInAs': 'Signed in as {username}',
	'me.account.lockNow': 'Lock now',
	'me.account.signOut': 'Sign out',
	'me.autolock.heading': 'Auto-lock',
	'me.autolock.label': 'Lock after',
	'me.autolock.option': '{minutes} min',
	'me.autolock.hint':
		'The diary locks after this long without use, and after a minute when you leave this page or app.',
	'me.passphrase.heading': 'Passphrase',
	'me.passphrase.lead': 'Your entries stay exactly as they are. Your other devices will be signed out.',
	'me.passphrase.open': 'Change passphrase',
	'me.passphrase.current': 'Current passphrase',
	'me.passphrase.new': 'New passphrase',
	'me.passphrase.wrong': "The current passphrase doesn't match.",
	'me.passphrase.done': 'Passphrase changed. Other devices were signed out.',
	'me.danger.heading': 'Delete account',
	'me.danger.lead': 'This erases your diary and your account from the server. It cannot be undone.',
	'me.danger.backups': 'Encrypted backup copies are kept for up to 14 days and then disappear.',
	'me.danger.export': 'Exporting your diary first is not possible yet. It arrives in a later version.',
	'me.danger.withdraw': 'Deleting your account also withdraws the agreement you gave when you joined.',
	'me.danger.open': 'Delete my account…',
	'me.danger.confirmTitle': 'Delete your account?',
	'me.danger.passphrase': 'Type your passphrase to confirm',
	'me.danger.confirm': 'Delete everything',
	'me.danger.wrong': "That passphrase doesn't match.",
	'me.danger.lastGuardian':
		'You are the only guardian of a dependent profile. Add another guardian or remove that profile first.'
} as const;

export type MessageKey = keyof typeof en;
