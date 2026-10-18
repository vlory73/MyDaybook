/** One JSON line per action on stdout. Never pass secrets, request data or decrypted content here. */
export function logLine(fields: Record<string, string | number | boolean>): void {
	process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...fields }) + '\n');
}

/** UTC timestamp as YYYY-MM-DDTHHMMSSZ (file-name safe, sorts chronologically). */
export function utcStamp(date: Date = new Date()): string {
	return date
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replace(/:/g, '');
}
