/**
 * The person's own name: one encrypted `profile` record (first and last name, both optional). Pure: no Svelte.
 * The name is only ever shown on the device (greeting, report name field); never log it.
 */
import type { StoredRecord } from './codec';
import { MAX_NAME_LENGTH, type ProfilePayload } from './types';

/** The profile record to use. Two devices may each have made one; the most recently changed wins. */
export function findProfile(all: Iterable<StoredRecord>): StoredRecord<ProfilePayload> | undefined {
	let best: StoredRecord<ProfilePayload> | undefined;
	for (const r of all) {
		if (r.payload.type !== 'profile') continue;
		const c = r as StoredRecord<ProfilePayload>;
		if (!best || c.updatedAt > best.updatedAt || (c.updatedAt === best.updatedAt && c.id > best.id)) best = c;
	}
	return best;
}

const clean = (s: string | undefined) =>
	(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();

/** The payload to store for what was typed (blank parts left out), or null when both are blank. */
export function profileFromInput(firstName: string, lastName: string): ProfilePayload | null {
	const first = clean(firstName);
	const last = clean(lastName);
	if (!first && !last) return null;
	const out: ProfilePayload = { v: 1, type: 'profile' };
	if (first) out.firstName = first;
	if (last) out.lastName = last;
	return out;
}

/** "First Last", or whichever part is set, or '' when there is no name. */
export function fullName(p: ProfilePayload | undefined): string {
	return [clean(p?.firstName), clean(p?.lastName)].filter(Boolean).join(' ');
}

/** The name for the greeting: the first name, else the last name alone, else the fallback (the login name). */
export function greetingName(p: ProfilePayload | undefined, fallback = ''): string {
	return clean(p?.firstName) || clean(p?.lastName) || fallback;
}

/** The name to prefill on reports: the full name, else the fallback (the login name). */
export function reportName(p: ProfilePayload | undefined, fallback = ''): string {
	return fullName(p) || fallback;
}
