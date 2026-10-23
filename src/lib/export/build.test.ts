import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { AttachmentRef, Payload } from '$lib/records/types';
import {
	ExportCancelled,
	buildExport,
	buildJson,
	buildReadme,
	countPhotos,
	exportFileName,
	planPhotos
} from './build';
import type { ExportRecord } from './tables';

// Synthetic data only.
const KEY = 'A'.repeat(43);
const ref = (id: string): AttachmentRef => ({
	id,
	key: KEY,
	thumbId: id.replace(/^./, 'f'),
	thumbKey: KEY,
	w: 800,
	h: 600,
	mime: 'image/jpeg'
});
const ID1 = 'ab12cd34-0000-4000-8000-000000000001';
const ID2 = 'ab12cd34-0000-4000-8000-000000000002';
const AT = '2026-10-23T08:10:00+02:00';
const meal = (id: string, attachments?: AttachmentRef[]): ExportRecord => ({
	id,
	updatedAt: Date.parse('2026-10-23T06:11:00Z'),
	payload: {
		v: 1,
		type: 'food',
		at: AT,
		meal: 'breakfast',
		text: 'Porridge',
		tags: [],
		attachments
	} as Payload
});
const meta = { exportedAt: new Date('2026-10-23T09:30:00+02:00'), appVersion: '0.8.0' };

describe('planPhotos', () => {
	it('names photos by date, time and a short id, keeping names unique', () => {
		const plans = planPhotos([meal('r1', [ref(ID1)]), meal('r2', [ref(ID2)])]);
		expect(plans.map((p) => p.name)).toEqual([
			'photos/2026-10-23_0810_ab12cd34.jpg',
			'photos/2026-10-23_0810_ab12cd340000.jpg'
		]);
		expect(countPhotos([meal('r1', [ref(ID1), ref(ID2)])])).toBe(2);
	});
});

describe('buildJson', () => {
	it('lists every record with ISO times and no photo keys', () => {
		const json = buildJson([meal('r1', [ref(ID1)]), meal('r2')], meta, new Map([['r1', ['photos/x.jpg']]]));
		expect(json).toMatchObject({
			format: 'mydaybook-export',
			version: 1,
			exportedAt: '2026-10-23T07:30:00.000Z'
		});
		expect(json.app.version).toBe('0.8.0');
		expect(json.records).toHaveLength(2);
		const first = json.records.find((r) => r.id === 'r1')!;
		expect(first.updatedAt).toBe('2026-10-23T06:11:00.000Z');
		expect(first.payload).toMatchObject({ type: 'food', at: AT, photos: ['photos/x.jpg'] });
		expect(JSON.stringify(json)).not.toContain(KEY);
		expect('attachments' in first.payload).toBe(false);
	});
	it('says how many photos were left out', () => {
		const json = buildJson([meal('r1', [ref(ID1), ref(ID2)])], meta);
		expect(json.records[0]!.payload).toMatchObject({ photoCount: 2 });
		expect('photos' in json.records[0]!.payload).toBe(false);
	});
});

describe('buildReadme and file name', () => {
	it('is written in the chosen language and states that the file is not encrypted', () => {
		const opts = {
			app: 'MyDaybook',
			version: '0.8.0',
			exportedOn: '2026-10-23',
			csvFiles: ['meals.csv'],
			photos: 0
		};
		const en = buildReadme('en', opts);
		expect(en).toContain('NOT encrypted');
		expect(en).toContain('meals.csv');
		expect(en).toContain('mydaybook.json');
		expect(en).toContain('not a medical device');
		expect(buildReadme('da', opts)).toContain('IKKE krypteret');
	});
	it('names the file after the app and the local day', () => {
		expect(exportFileName(new Date('2026-10-23T09:30:00+02:00'))).toMatch(/^mydaybook-2026-10-2[23]\.zip$/);
	});
});

describe('buildExport', () => {
	const records = [meal('r1', [ref(ID1)]), meal('r2')];
	const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

	it('zips the JSON, the CSV tables, the README and the photos', async () => {
		const progress: [number, number][] = [];
		const built = await buildExport({
			records,
			includePhotos: true,
			locale: 'en',
			meta,
			fetchPhoto: async () => jpeg,
			onProgress: (d, t) => progress.push([d, t])
		});
		const files = unzipSync(built.bytes);
		expect(Object.keys(files).sort()).toEqual([
			'README.txt',
			'meals.csv',
			'mydaybook.json',
			'photos/2026-10-23_0810_ab12cd34.jpg'
		]);
		expect(files['photos/2026-10-23_0810_ab12cd34.jpg']).toEqual(jpeg);
		expect(strFromU8(files['meals.csv']!)).toContain('photos/2026-10-23_0810_ab12cd34.jpg');
		expect(JSON.parse(strFromU8(files['mydaybook.json']!)).records).toHaveLength(2);
		expect(built.photos).toBe(1);
		expect(built.missing).toBe(0);
		expect(progress.at(-1)).toEqual([1, 1]);
	});

	it('leaves photos out when asked and never fetches them', async () => {
		let fetched = 0;
		const built = await buildExport({
			records,
			includePhotos: false,
			locale: 'da',
			meta,
			fetchPhoto: async () => {
				fetched++;
				return jpeg;
			}
		});
		expect(fetched).toBe(0);
		const files = unzipSync(built.bytes);
		expect(Object.keys(files).some((f) => f.startsWith('photos/'))).toBe(false);
		expect(strFromU8(files['README.txt']!)).toContain('IKKE krypteret');
	});

	it('counts a photo that cannot be fetched and carries on', async () => {
		const built = await buildExport({
			records,
			includePhotos: true,
			locale: 'en',
			meta,
			fetchPhoto: async () => {
				throw new Error('gone');
			}
		});
		expect(built.missing).toBe(1);
		expect(built.photos).toBe(0);
	});

	it('stops when cancelled', async () => {
		await expect(
			buildExport({
				records,
				includePhotos: true,
				locale: 'en',
				meta,
				fetchPhoto: async () => jpeg,
				isCancelled: () => true
			})
		).rejects.toBeInstanceOf(ExportCancelled);
	});
});
