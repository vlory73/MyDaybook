/**
 * Builds the data export (ARCHITECTURE §10): one .zip made entirely on the device from the decrypted records.
 *
 *   mydaybook.json   every live record, decrypted, in one file
 *   <type>.csv       one table per kind of entry that has data (tables.ts)
 *   photos/*.jpg     decrypted photos, only when the person asked for them
 *   README.txt       what the files are, in the language of the app
 *
 * Nothing here talks to the network: photo bytes come in through `fetchPhoto`. The file is not encrypted, which the
 * README and the export screen both say. Nothing is logged.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import { brand } from '$lib/brand';
import { translate, type Locale } from '$lib/i18n/core';
import type { MessageKey } from '$lib/i18n/en';
import { dayKey, formatAt, timeOf } from '$lib/records/time';
import type { AttachmentRef, Payload } from '$lib/records/types';
import { buildTables, tableCsv, type ExportRecord, type Table } from './tables';

export const FORMAT = 'mydaybook-export';
export const FORMAT_VERSION = 1;
export const JSON_FILE = 'mydaybook.json';
export const README_FILE = 'README.txt';
/** Photos are stored at about this size (ARCHITECTURE §5.2); only used for the estimate on the export screen. */
export const PHOTO_ESTIMATE_BYTES = 150 * 1024;

/** An estimate rounded to two significant digits, so "about" never shows false precision (460.8 kB -> 460 kB). */
export function roughly(bytes: number): number {
	if (bytes <= 0) return 0;
	const step = 10 ** Math.max(0, Math.floor(Math.log10(bytes)) - 1);
	return Math.round(bytes / step) * step;
}

// ---- Photos ----

export type PhotoPlan = { recordId: string; ref: AttachmentRef; name: string };

const attachmentsOf = (p: Payload): AttachmentRef[] => p.attachments ?? [];

/** When the record happened, for naming its photos: its own time, else the time it was last saved. */
const momentOf = (r: ExportRecord): string =>
	'at' in r.payload ? r.payload.at : formatAt(new Date(r.updatedAt));

/** Every photo of every record with its file name, `photos/2026-10-23_0810_ab12cd34.jpg` (date, time, short id). */
export function planPhotos(records: readonly ExportRecord[]): PhotoPlan[] {
	const used = new Set<string>();
	const out: PhotoPlan[] = [];
	for (const r of records) {
		const moment = momentOf(r);
		const stamp = `${dayKey(moment)}_${timeOf(moment).replace(':', '')}`;
		for (const ref of attachmentsOf(r.payload)) {
			let short = 8;
			let name = `photos/${stamp}_${ref.id.replaceAll('-', '').slice(0, short)}.jpg`;
			while (used.has(name) && short < 32) {
				short += 4;
				name = `photos/${stamp}_${ref.id.replaceAll('-', '').slice(0, short)}.jpg`;
			}
			used.add(name);
			out.push({ recordId: r.id, ref, name });
		}
	}
	return out;
}

export const countPhotos = (records: readonly ExportRecord[]): number =>
	records.reduce((n, r) => n + attachmentsOf(r.payload).length, 0);

const groupNames = (plans: readonly PhotoPlan[]): Map<string, string[]> => {
	const map = new Map<string, string[]>();
	for (const p of plans) map.set(p.recordId, [...(map.get(p.recordId) ?? []), p.name]);
	return map;
};

// ---- JSON ----

export type ExportMeta = { exportedAt: Date; appVersion: string };

type JsonRecord = { id: string; updatedAt: string; payload: Record<string, unknown> };

/**
 * The whole diary as one object. Photo keys never leave the device: `attachments` is replaced by `photos` (the file
 * names in the zip) when photos are included, and by `photoCount` when they are not.
 */
export function buildJson(
	records: readonly ExportRecord[],
	meta: ExportMeta,
	photoNames: ReadonlyMap<string, readonly string[]> = new Map()
) {
	const list: JsonRecord[] = records.map((r) => {
		const { attachments, ...rest } = r.payload as Payload & { attachments?: AttachmentRef[] };
		const payload: Record<string, unknown> = { ...rest };
		const names = photoNames.get(r.id);
		if (names && names.length > 0) payload.photos = [...names];
		else if (attachments && attachments.length > 0) payload.photoCount = attachments.length;
		return { id: r.id, updatedAt: new Date(r.updatedAt).toISOString(), payload };
	});
	list.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
	return {
		format: FORMAT,
		version: FORMAT_VERSION,
		exportedAt: meta.exportedAt.toISOString(),
		app: { name: brand.displayName, version: meta.appVersion },
		records: list
	};
}

// ---- README ----

export function buildReadme(
	locale: Locale,
	opts: { app: string; version: string; exportedOn: string; csvFiles: readonly string[]; photos: number }
): string {
	const t = (key: string, vars?: Record<string, string | number>) =>
		translate(locale, `export.readme.${key}` as MessageKey, vars);
	const lines = [
		t('title', { app: opts.app }),
		t('exported', { date: opts.exportedOn, app: opts.app, version: opts.version }),
		'',
		t('notEncrypted'),
		'',
		t('inside'),
		`- ${JSON_FILE}: ${t('json')}`,
		`- ${t('csv')}`,
		...opts.csvFiles.map((f) => `    ${f}`),
		`    ${t('csvNotes')}`,
		opts.photos > 0 ? `- photos/: ${t('photos', { count: opts.photos })}` : `- ${t('noPhotos')}`,
		`- ${README_FILE}: ${t('readme')}`,
		'',
		translate(locale, 'me.about.notMedical')
	];
	return lines.join('\r\n') + '\r\n';
}

// ---- Zip ----

export type BuildOptions = {
	records: readonly ExportRecord[];
	includePhotos: boolean;
	locale: Locale;
	meta: ExportMeta;
	/** Gives the decrypted JPEG bytes of one photo; throws when it cannot be had (the photo is then left out). */
	fetchPhoto: (ref: AttachmentRef) => Promise<Uint8Array>;
	onProgress?: (done: number, total: number) => void;
	isCancelled?: () => boolean;
};

export type BuiltExport = {
	name: string;
	bytes: Uint8Array;
	files: string[];
	photos: number;
	/** Photos that could not be fetched and are not in the file. */
	missing: number;
};

export class ExportCancelled extends Error {
	constructor() {
		super('cancelled');
	}
}

/** `mydaybook-2026-10-23.zip`: the brand name in lower case, then the local day. */
export const exportFileName = (now: Date): string => {
	const day = formatAt(now).slice(0, 10);
	return `${brand.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${day}.zip`;
};

/** Fetches the photos one at a time (so a cancel is quick), then writes the JSON, the CSV tables and the README. */
export async function buildExport(opts: BuildOptions): Promise<BuiltExport> {
	const plans = opts.includePhotos ? planPhotos(opts.records) : [];
	const files: Zippable = {};
	const kept: PhotoPlan[] = [];
	let missing = 0;
	opts.onProgress?.(0, plans.length);
	for (const [i, plan] of plans.entries()) {
		if (opts.isCancelled?.()) throw new ExportCancelled();
		try {
			// JPEGs are already compressed: stored, not deflated.
			files[plan.name] = [await opts.fetchPhoto(plan.ref), { level: 0 }];
			kept.push(plan);
		} catch {
			missing++;
		}
		opts.onProgress?.(i + 1, plans.length);
	}
	if (opts.isCancelled?.()) throw new ExportCancelled();

	// Let the progress bar paint before the (synchronous) zipping starts.
	await new Promise((resolve) => setTimeout(resolve, 0));
	const names = groupNames(kept);
	const tables: Table[] = buildTables(opts.records, (id) => names.get(id) ?? []);
	const json = buildJson(opts.records, opts.meta, names);
	files[JSON_FILE] = strToU8(JSON.stringify(json, null, 2));
	for (const t of tables) files[t.file] = strToU8(tableCsv(t));
	files[README_FILE] = strToU8(
		buildReadme(opts.locale, {
			app: brand.displayName,
			version: opts.meta.appVersion,
			exportedOn: formatAt(opts.meta.exportedAt).slice(0, 10),
			csvFiles: tables.map((t) => t.file),
			photos: kept.length
		})
	);
	const bytes = zipSync(files, { level: 6, mtime: opts.meta.exportedAt });
	return {
		name: exportFileName(opts.meta.exportedAt),
		bytes,
		files: Object.keys(files),
		photos: kept.length,
		missing
	};
}
