import { describe, expect, it } from 'vitest';
import { BOM, csvCell, joinList, toCsv } from './csv';

describe('csvCell', () => {
	it('leaves plain text and numbers alone', () => {
		expect(csvCell('Porridge')).toBe('Porridge');
		expect(csvCell(7.5)).toBe('7.5');
		expect(csvCell(0)).toBe('0');
	});
	it('quotes commas, quotes and line breaks, doubling the quotes', () => {
		expect(csvCell('eggs, toast')).toBe('"eggs, toast"');
		expect(csvCell('said "hi"')).toBe('"said ""hi"""');
		expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
		expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
	});
	it('writes missing values as empty and booleans as yes / no', () => {
		expect(csvCell(undefined)).toBe('');
		expect(csvCell(null)).toBe('');
		expect(csvCell(true)).toBe('yes');
		expect(csvCell(false)).toBe('no');
	});
	it('keeps non-ASCII text as it is', () => {
		expect(csvCell('rød grød med fløde')).toBe('rød grød med fløde');
	});
});

describe('joinList', () => {
	it('joins with a semicolon and a space', () => {
		expect(joinList(['a', 'b', 'c'])).toBe('a; b; c');
		expect(joinList([1, 2])).toBe('1; 2');
		expect(joinList([])).toBe('');
		expect(joinList(undefined)).toBe('');
	});
});

describe('toCsv', () => {
	it('starts with a byte order mark, then the header, and ends every line with CRLF', () => {
		const text = toCsv(
			['id', 'text'],
			[
				['1', 'a, b'],
				['2', 'c']
			]
		);
		expect(text.startsWith(BOM)).toBe(true);
		expect(text.slice(1)).toBe('id,text\r\n1,"a, b"\r\n2,c\r\n');
	});
	it('writes just the header for no rows', () => {
		expect(toCsv(['a'], [])).toBe(`${BOM}a\r\n`);
	});
});
