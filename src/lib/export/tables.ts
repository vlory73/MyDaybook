/**
 * The CSV tables of the data export: one per kind of record that has data. Pure: no Svelte. Column names and the
 * words in cells are always English (the file is for spreadsheets and other apps, not for the screen), times are
 * written exactly as stored (local ISO 8601 with the UTC offset, "2026-10-23T08:10:00+02:00"), lists are joined with
 * "; ", and a pain entry gets one row per marked point. Nothing is computed, rated or compared: every cell repeats
 * what the person entered (not a medical device).
 */
import { regionName } from '$lib/bodymap/catalogue';
import { translate } from '$lib/i18n/core';
import type { MessageKey } from '$lib/i18n/en';
import { DEFAULT_DRINK_IDS, DEFAULT_SIZE_IDS } from '$lib/records/types';
import type {
	DosePayload,
	MeasurementPayload,
	MedicationPayload,
	MedSchedule,
	Payload
} from '$lib/records/types';
import { episodeName } from '$lib/records/episodes';
import { defaultIdOf } from '$lib/records/drinks';
import { suggestionId } from '$lib/records/watch';
import { joinList, toCsv, type Cell } from './csv';

export type ExportRecord = { id: string; updatedAt: number; payload: Payload };
export type Table = { file: string; columns: string[]; rows: Cell[][] };

const en = (key: string) => translate('en', key as MessageKey);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BUILT_IN_CONTEXT = ['morning', 'beforeBreakfast', 'afterExercise'];

/** File names of the photos kept for a record (empty when photos are left out). */
export type PhotoFiles = (recordId: string) => readonly string[];

type Lookups = {
	medication: (id: string) => string;
	sensitivity: (id: string) => string;
	measurementType: (id: string) => string;
	episode: (id: string) => string;
};

function lookups(records: readonly ExportRecord[]): Lookups {
	const byId = new Map(records.map((r) => [r.id, r.payload]));
	const painByEpisode = new Map<string, { payload: Extract<Payload, { type: 'pain' }> }[]>();
	for (const r of records) {
		if (r.payload.type === 'pain' && r.payload.episode)
			painByEpisode.set(r.payload.episode, [
				...(painByEpisode.get(r.payload.episode) ?? []),
				{ payload: r.payload }
			]);
	}
	return {
		medication: (id) => {
			const p = byId.get(id);
			return p?.type === 'medication' ? p.name : '';
		},
		sensitivity: (id) => {
			const p = byId.get(id);
			if (p?.type !== 'sensitivity') return id;
			const sug = suggestionId(p.label);
			return sug ? en(`sens.${sug}`) : p.label;
		},
		measurementType: (id) => {
			if (id === 'weight') return en('cat.weight');
			if (id === 'blood_pressure') return en('measure.bp');
			if (id === 'pulse') return en('measure.pulse');
			const p = byId.get(id);
			return p?.type === 'measurement_type' ? p.name : id;
		},
		episode: (id) => {
			const p = byId.get(id);
			return p?.type === 'pain_episode' ? episodeName('en', p, painByEpisode.get(id) ?? []) : '';
		}
	};
}

const drinkLabel = (kind: 'drink' | 'size', stored: string) => {
	const id = defaultIdOf(stored, kind === 'drink' ? DEFAULT_DRINK_IDS : DEFAULT_SIZE_IDS);
	return id ? en(`drink.${kind === 'drink' ? 'name' : 'size'}.${id}`) : stored;
};

function scheduleText(s: MedSchedule): string {
	switch (s.kind) {
		case 'daily':
			return 'daily';
		case 'weekdays':
			return `weekdays: ${joinList(s.days.map((d) => WEEKDAYS[d] ?? String(d)))}`;
		case 'every_n_days':
			return `every ${s.n} days from ${s.from}`;
		case 'as_needed':
			return 'as needed';
	}
}

const timesText = (m: MedicationPayload) => joinList(m.times.map((x) => `${x.time} ${x.amount}`.trim()));
const contextText = (m: MeasurementPayload) =>
	joinList(m.context.map((c) => (BUILT_IN_CONTEXT.includes(c) ? en(`measure.ctx.${c}`) : c)));

type Builder<K extends Payload['type']> = {
	file: string;
	columns: string[];
	rows: (
		r: { id: string; updatedAt: number; payload: Extract<Payload, { type: K }> },
		ctx: Lookups,
		photos: string
	) => Cell[][];
};

const tables: { [K in Payload['type']]?: Builder<K> } = {
	food: {
		file: 'meals.csv',
		columns: ['id', 'at', 'meal', 'where', 'description', 'tags', 'watch_list', 'photos'],
		rows: ({ id, payload: p }, ctx, photos) => [
			[
				id,
				p.at,
				p.meal,
				p.where,
				p.text,
				joinList(p.tags),
				joinList((p.exposures ?? []).map((e) => `${ctx.sensitivity(e.id)}: ${e.state}`)),
				photos
			]
		]
	},
	feeling: {
		file: 'feeling.csv',
		columns: ['id', 'at', 'mood', 'energy', 'stress', 'symptoms', 'note', 'photos'],
		rows: ({ id, payload: p }, _c, photos) => [
			[
				id,
				p.at,
				p.mood,
				p.energy,
				p.stress,
				joinList(p.symptoms.map((s) => (s.severity ? `${s.tag} (${s.severity})` : s.tag))),
				p.note,
				photos
			]
		]
	},
	sleep: {
		file: 'sleep.csv',
		columns: ['id', 'woke_at', 'asleep_at', 'quality', 'awakenings', 'naps', 'note', 'photos'],
		rows: ({ id, payload: p }, _c, photos) => [
			[
				id,
				p.at,
				p.asleepAt,
				p.quality,
				p.awakenings,
				joinList((p.naps ?? []).map((n) => `${n.from} to ${n.to}`)),
				p.note,
				photos
			]
		]
	},
	measurement: {
		file: 'measurements.csv',
		columns: ['id', 'at', 'type', 'values', 'unit', 'context', 'note', 'photos'],
		rows: ({ id, payload: p }, ctx, photos) => [
			[id, p.at, ctx.measurementType(p.typeId), joinList(p.values), p.unit, contextText(p), p.note, photos]
		]
	},
	bowel: {
		file: 'bowel.csv',
		columns: ['id', 'at', 'bristol_type', 'flags', 'note', 'photos'],
		rows: ({ id, payload: p }, _c, photos) => [[id, p.at, p.bristol, joinList(p.flags), p.note, photos]]
	},
	gut: {
		file: 'nausea_heartburn.csv',
		columns: ['id', 'at', 'nausea', 'heartburn', 'flags', 'note', 'photos'],
		rows: ({ id, payload: p }, _c, photos) => [
			[
				id,
				p.at,
				p.symptoms.find((s) => s.kind === 'nausea')?.intensity,
				p.symptoms.find((s) => s.kind === 'heartburn')?.intensity,
				joinList(p.flags),
				p.note,
				photos
			]
		]
	},
	note: {
		file: 'notes.csv',
		columns: ['id', 'at', 'text', 'tags', 'photos'],
		rows: ({ id, payload: p }, _c, photos) => [[id, p.at, p.text, joinList(p.tags), photos]]
	},
	drink: {
		file: 'drinks.csv',
		columns: ['id', 'at', 'drink', 'size', 'size_ml', 'count', 'total_ml', 'note', 'photos'],
		rows: ({ id, payload: p }, _c, photos) => [
			[
				id,
				p.at,
				drinkLabel('drink', p.drink),
				drinkLabel('size', p.size),
				p.sizeMl,
				p.count,
				p.totalMl,
				p.note,
				photos
			]
		]
	},
	dose: {
		file: 'doses.csv',
		columns: [
			'id',
			'at',
			'medicine',
			'status',
			'scheduled_date',
			'scheduled_time',
			'amount',
			'note',
			'photos'
		],
		rows: ({ id, payload: p }: { id: string; payload: DosePayload }, ctx, photos) => [
			[
				id,
				p.at,
				ctx.medication(p.medicationId),
				p.status,
				p.slot?.date,
				p.slot?.time,
				p.amount,
				p.note,
				photos
			]
		]
	},
	pain: {
		file: 'pain.csv',
		columns: [
			'entry_id',
			'at',
			'point',
			'place',
			'region',
			'side',
			'view',
			'intensity',
			'qualities',
			'point_note',
			'entry_note',
			'episode',
			'headache_started',
			'headache_stopped',
			'headache_still_going',
			'headache_before',
			'headache_worse_with_activity',
			'headache_light',
			'headache_sound',
			'headache_trigger',
			'photos'
		],
		rows: ({ id, payload: p }, ctx, photos) =>
			p.points.map((pt, i) => [
				id,
				p.at,
				i + 1,
				regionName('en', pt.region, pt.side),
				pt.region,
				pt.side,
				pt.space,
				pt.intensity,
				joinList(pt.qualities),
				pt.note,
				p.note,
				p.episode ? ctx.episode(p.episode) : undefined,
				p.headache?.started,
				p.headache?.stopped,
				p.headache?.stillGoing,
				joinList(p.headache?.before),
				p.headache?.worseWithActivity,
				p.headache?.light,
				p.headache?.sound,
				p.headache?.trigger,
				i === 0 ? photos : ''
			])
	},
	pain_episode: {
		file: 'pain_episodes.csv',
		columns: ['id', 'name', 'started', 'ended'],
		rows: ({ id, payload: p }, ctx) => [[id, ctx.episode(id), p.started, p.ended]]
	},
	medication: {
		file: 'medications.csv',
		columns: [
			'id',
			'name',
			'strength',
			'unit',
			'form',
			'schedule',
			'times',
			'start',
			'end',
			'archived',
			'reminders',
			'note'
		],
		rows: ({ id, payload: p }) => [
			[
				id,
				p.name,
				p.strength,
				p.unit,
				p.form,
				scheduleText(p.schedule),
				timesText(p),
				p.start,
				p.end,
				p.archived,
				p.reminders,
				p.note
			]
		]
	},
	sensitivity: {
		file: 'watch_list.csv',
		columns: ['id', 'name', 'kind'],
		rows: ({ id, payload: p }, ctx) => [[id, ctx.sensitivity(id), p.kind]]
	},
	saved_meal: {
		file: 'saved_meals.csv',
		columns: ['id', 'name', 'meal', 'description', 'tags', 'watch_list'],
		rows: ({ id, payload: p }, ctx) => [
			[
				id,
				p.name,
				p.meal,
				p.text,
				joinList(p.tags),
				joinList(p.exposures.map((e) => `${ctx.sensitivity(e.id)}: ${e.state}`))
			]
		]
	}
};

/** The tables that have data, in a fixed order, rows sorted by time (then id) so the file is stable. */
export function buildTables(records: readonly ExportRecord[], photoFiles: PhotoFiles = () => []): Table[] {
	const ctx = lookups(records);
	const order = Object.keys(tables);
	const sortKey = (r: ExportRecord) => ('at' in r.payload ? r.payload.at : '') + r.id;
	const out: Table[] = [];
	for (const type of order) {
		const spec = tables[type as Payload['type']] as Builder<Payload['type']> | undefined;
		if (!spec) continue;
		const mine = records
			.filter((r) => r.payload.type === type)
			.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
		if (mine.length === 0) continue;
		const rows = mine.flatMap((r) => spec.rows(r as never, ctx, joinList(photoFiles(r.id))));
		out.push({ file: spec.file, columns: spec.columns, rows });
	}
	return out;
}

export const tableCsv = (t: Table): string => toCsv(t.columns, t.rows);
