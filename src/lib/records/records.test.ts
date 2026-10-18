import { beforeAll, describe, expect, it } from 'vitest';
import { initCrypto } from '$lib/crypto/sodium';
import { randomBytes } from '$lib/crypto/keys';
import { fromB64 } from '$lib/crypto/encoding';
import { daysWithEntries, open, recordsForDay, seal, wireToCached, type StoredRecord } from './codec';
import { addDays, dayKey, formatAt, fromLocalInput, timeOf, toLocalInput, weekDays, weekStart } from './time';
import { isAt, parsePayload, type NotePayload, type Payload } from './types';

// Synthetic data only.
const USER = '5d1f7c0e-2b64-4e0a-8e5b-7f2d9a1c3b44';
const ID = '9a6f0b1c-3d2e-4f5a-8b7c-1d2e3f4a5b6c';
const note = (at: string, text = 'Synthetic note'): NotePayload => ({
	v: 1,
	type: 'note',
	at,
	text,
	tags: []
});
const rec = (id: string, payload: Payload): StoredRecord => ({ id, rev: 1, updatedAt: 1, payload });

beforeAll(async () => {
	await initCrypto();
});

describe('validators', () => {
	it('accepts a valid payload of each type', () => {
		const at = '2026-10-18T08:10:00+02:00';
		const valid: unknown[] = [
			{ v: 1, type: 'food', at, meal: 'breakfast', text: 'Oatmeal', tags: [] },
			{ v: 1, type: 'feeling', at, mood: 4, energy: 3, symptoms: [{ tag: 'headache', severity: 2 }] },
			{ v: 1, type: 'sleep', at, asleepAt: '2026-10-17T23:50:00+02:00', quality: 4, awakenings: 1 },
			{ v: 1, type: 'measurement', at, typeId: 'weight', values: [72.4], unit: 'kg', context: [] },
			{ v: 1, type: 'measurement_type', name: 'Blood pressure', unit: 'mmHg', valueCount: 2, decimals: 0 },
			{ v: 1, type: 'bowel', at, bristol: 4, flags: ['urgent'] },
			{ v: 1, type: 'note', at, text: 'Hello', tags: [] },
			{ v: 1, type: 'sensitivity', label: 'Lactose', icon: 'milk', kind: 'intolerance', order: 0 },
			{ v: 1, type: 'saved_meal', name: 'Usual', meal: 'lunch', text: 'Soup', tags: [], exposures: [] },
			{ v: 1, type: 'settings', values: { usualBedtime: '23:30', weightStep: 0.1, reminders: true } },
			{ v: 1, type: 'tag', name: 'Home' }
		];
		for (const p of valid) expect(parsePayload(p), JSON.stringify(p)).not.toBeNull();
	});

	it('rejects wrong versions, unknown types and malformed fields', () => {
		const at = '2026-10-18T08:10:00+02:00';
		const invalid: unknown[] = [
			null,
			'note',
			[],
			{ v: 2, type: 'note', at, text: 'x', tags: [] },
			{ v: 1, type: 'pain', at },
			{ v: 1, type: 'constructor', at },
			{ v: 1, type: 'note', at: '2026-10-18 08:10', text: 'x', tags: [] },
			{ v: 1, type: 'note', at: '2026-13-45T99:99:00+02:00', text: 'x', tags: [] },
			{ v: 1, type: 'note', at, text: 5, tags: [] },
			{ v: 1, type: 'note', at, text: 'x' },
			{ v: 1, type: 'feeling', at, mood: 6, symptoms: [] },
			{ v: 1, type: 'bowel', at, bristol: 8, flags: [] },
			{ v: 1, type: 'bowel', at, bristol: 3, flags: ['nonsense'] },
			{ v: 1, type: 'measurement', at, typeId: 'weight', values: [], unit: 'kg', context: [] },
			{ v: 1, type: 'settings', values: { a: { nested: 1 } } }
		];
		for (const p of invalid) expect(parsePayload(p), JSON.stringify(p)).toBeNull();
	});

	it('accepts photo references on any record type and rejects malformed ones', () => {
		const ref = {
			id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
			key: 'A'.repeat(43),
			thumbId: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
			thumbKey: 'B'.repeat(43),
			w: 1600,
			h: 1200,
			mime: 'image/jpeg'
		};
		const at = '2026-10-18T08:10:00+02:00';
		const base = [
			{ v: 1, type: 'food', at, meal: 'lunch', text: 'Soup', tags: [] },
			{ v: 1, type: 'note', at, text: 'Hello', tags: [] },
			{ v: 1, type: 'bowel', at, bristol: 4, flags: [] }
		];
		for (const p of base) {
			expect(parsePayload({ ...p, attachments: [ref] })).not.toBeNull();
			expect(parsePayload({ ...p, attachments: [] })).not.toBeNull();
			expect(parsePayload({ ...p, attachments: [ref, ref, ref, ref, ref] })).toBeNull();
			expect(parsePayload({ ...p, attachments: 'x' })).toBeNull();
			expect(parsePayload({ ...p, attachments: [{ ...ref, id: '../../etc/passwd' }] })).toBeNull();
			expect(parsePayload({ ...p, attachments: [{ ...ref, key: 'short' }] })).toBeNull();
			expect(parsePayload({ ...p, attachments: [{ ...ref, mime: 'image/png' }] })).toBeNull();
			expect(parsePayload({ ...p, attachments: [{ ...ref, w: 0 }] })).toBeNull();
		}
	});

	it('isAt needs an offset', () => {
		expect(isAt('2026-10-18T08:10:00Z')).toBe(true);
		expect(isAt('2026-10-18T08:10:00.250-05:00')).toBe(true);
		expect(isAt('2026-10-18T08:10:00')).toBe(false);
	});
});

describe('codec', () => {
	const kek = () => randomBytes(32);

	it('seals and opens a payload, bound to user and record id', () => {
		const key = kek();
		const payload = note('2026-10-18T08:10:00+02:00', 'Unique synthetic text 7731');
		const sealed = seal(key, USER, ID, payload);
		const cached = wireToCached({ id: ID, ...sealed, rev: 1, updatedAt: 5, deletedAt: null });
		expect(open(key, USER, cached)).toEqual({ ok: true, payload });
		// The ciphertext does not contain the plaintext.
		expect(Buffer.from(fromB64(sealed.ciphertext)).includes(Buffer.from('7731'))).toBe(false);
		// Wrong user, wrong record id, wrong key: all fail without throwing.
		expect(open(key, 'another-user', cached)).toEqual({ ok: false, reason: 'undecryptable' });
		expect(open(key, USER, { ...cached, id: 'another-id' })).toEqual({ ok: false, reason: 'undecryptable' });
		expect(open(kek(), USER, cached)).toEqual({ ok: false, reason: 'undecryptable' });
	});

	it('reports tombstones and payloads that fail validation', () => {
		const key = kek();
		const tomb = wireToCached({
			id: ID,
			wrappedKey: null,
			ciphertext: null,
			rev: 2,
			updatedAt: 6,
			deletedAt: 6
		});
		expect(open(key, USER, tomb)).toEqual({ ok: false, reason: 'tombstone' });
		const bad = seal(key, USER, ID, { v: 1, type: 'pain' } as unknown as Payload);
		const cached = wireToCached({ id: ID, ...bad, rev: 1, updatedAt: 5, deletedAt: null });
		expect(open(key, USER, cached)).toEqual({ ok: false, reason: 'invalid' });
	});
});

describe('time', () => {
	it('writes `at` in a given offset and keeps the local day', () => {
		const instant = new Date('2026-10-18T21:50:00Z');
		expect(formatAt(instant, 120)).toBe('2026-10-18T23:50:00+02:00');
		expect(formatAt(instant, 180)).toBe('2026-10-19T00:50:00+03:00');
		expect(formatAt(instant, -300)).toBe('2026-10-18T16:50:00-05:00');
		expect(formatAt(instant, 330)).toBe('2026-10-19T03:20:00+05:30');
		expect(dayKey('2026-10-18T23:50:00+02:00')).toBe('2026-10-18');
		expect(timeOf('2026-10-18T23:50:00+02:00')).toBe('23:50');
	});

	it('converts to and from datetime-local values', () => {
		expect(toLocalInput('2026-10-18T08:10:00+02:00')).toBe('2026-10-18T08:10');
		expect(fromLocalInput('2026-10-18T08:10', 120)).toBe('2026-10-18T08:10:00+02:00');
		expect(fromLocalInput('2026-10-18T08:10', -300)).toBe('2026-10-18T08:10:00-05:00');
		expect(fromLocalInput('nonsense')).toBeNull();
		expect(fromLocalInput('2026-02-30T08:10', 0)).toBeNull();
	});

	it('finds the Monday-to-Sunday week, across month and year ends', () => {
		expect(weekStart('2026-10-18')).toBe('2026-10-12'); // a Sunday
		expect(weekDays('2026-10-14')).toEqual([
			'2026-10-12',
			'2026-10-13',
			'2026-10-14',
			'2026-10-15',
			'2026-10-16',
			'2026-10-17',
			'2026-10-18'
		]);
		expect(weekDays('2026-12-31')[0]).toBe('2026-12-28');
		expect(weekDays('2026-12-31')[6]).toBe('2027-01-03');
		expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // DST ends in Europe on 2026-10-25
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
});

describe('day selectors', () => {
	const all = [
		rec('c', note('2026-10-18T09:00:00+02:00', 'second')),
		rec('a', note('2026-10-18T07:30:00+02:00', 'first')),
		rec('d', note('2026-10-19T00:10:00+02:00', 'next day')),
		rec('e', note('2026-10-18T23:50:00-05:00', 'late, other zone')),
		rec('f', { v: 1, type: 'tag', name: 'Home' })
	];

	it('lists one day, earliest instant first, and skips untimed records', () => {
		const day = recordsForDay(all, '2026-10-18');
		expect(day.map((r) => r.id)).toEqual(['a', 'c', 'e']);
		expect(recordsForDay(all, '2026-10-19').map((r) => r.id)).toEqual(['d']);
		expect(recordsForDay(all, '2026-10-20')).toEqual([]);
	});

	it('marks days with entries inside a range', () => {
		const days = daysWithEntries(all, '2026-10-12', '2026-10-18');
		expect([...days]).toEqual(['2026-10-18']);
		expect(daysWithEntries(all, '2026-10-12', '2026-10-19').has('2026-10-19')).toBe(true);
	});
});
