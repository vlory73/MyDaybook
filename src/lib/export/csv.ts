/**
 * CSV writing for the data export (RFC 4180). Pure: no Svelte, no i18n. Files start with a UTF-8 byte order mark so
 * spreadsheets open accents and "æøå" correctly, lines end with CRLF, and a cell is quoted when it holds a comma,
 * a quote or a line break. Lists are joined with "; " by the caller (`joinList`).
 */

export type Cell = string | number | boolean | null | undefined;

export const BOM = '﻿';
export const EOL = '\r\n';
export const LIST_SEPARATOR = '; ';

export const joinList = (items: readonly (string | number)[] | undefined): string =>
	(items ?? []).join(LIST_SEPARATOR);

/** One cell, quoted only when it needs to be. Missing values are empty cells; booleans are `yes` / `no`. */
export function csvCell(value: Cell): string {
	if (value === null || value === undefined) return '';
	const text = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A whole file: byte order mark, header row, one line per row, every line ended by CRLF. */
export function toCsv(columns: readonly string[], rows: readonly (readonly Cell[])[]): string {
	const line = (cells: readonly Cell[]) => cells.map(csvCell).join(',') + EOL;
	return BOM + line(columns) + rows.map(line).join('');
}
