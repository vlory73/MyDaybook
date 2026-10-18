/**
 * A deliberately simple, local strength hint (no dependency, nothing leaves the device). It encourages long
 * passphrases (4+ random words or 16+ characters) and refuses only the clearly weak ones. It is not a guarantee:
 * the real protection is Argon2id plus a long passphrase.
 */
export type Strength = 'weak' | 'okay' | 'strong';

const COMMON = new Set([
	'password',
	'passphrase',
	'12345678',
	'123456789',
	'1234567890',
	'qwertyuiop',
	'iloveyou',
	'letmeinplease',
	'adgangskode',
	'kodeord1234'
]);

export function passphraseStrength(passphrase: string): Strength {
	const chars = [...passphrase.normalize('NFKC')];
	const length = chars.length;
	const unique = new Set(chars.map((c) => c.toLowerCase())).size;
	if (length < 8 || unique < 5) return 'weak';
	if (COMMON.has(passphrase.trim().toLowerCase())) return 'weak';
	const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u].filter((re) =>
		re.test(passphrase)
	).length;
	const words = passphrase.trim().split(/\s+/).filter(Boolean).length;
	if ((length >= 16 && unique >= 8) || (words >= 4 && length >= 14)) return 'strong';
	if (length >= 12 || (length >= 10 && classes >= 3)) return 'okay';
	return 'weak';
}

export type PassphraseCheck = 'ok' | 'weak' | 'mismatch';

/** What the "choose a passphrase" forms need: strong enough (at least "okay"), and typed twice the same. */
export function checkNewPassphrase(passphrase: string, repeat: string): PassphraseCheck {
	if (passphraseStrength(passphrase) === 'weak') return 'weak';
	return passphrase === repeat ? 'ok' : 'mismatch';
}
