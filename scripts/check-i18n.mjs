// Fails when a Svelte component contains user-facing text that does not go through i18n
// (spec: "no hard-coded strings"). Checks text nodes and the text of user-facing attributes.
// A file can opt out with the comment <!-- i18n-ignore-file: reason --> (developer-only pages).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'svelte/compiler';

const ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label', 'aria-description']);
const LETTERS = /\p{L}{2,}/u;

const walkFiles = (dir) =>
	readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		return statSync(p).isDirectory() ? walkFiles(p) : p.endsWith('.svelte') ? [p] : [];
	});

const problems = [];
for (const file of walkFiles('src')) {
	const source = readFileSync(file, 'utf8');
	if (source.includes('i18n-ignore-file:')) continue;
	const ast = parse(source, { modern: true });

	const visit = (node, parentName) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) return node.forEach((n) => visit(n, parentName));
		if (node.type === 'Text' && parentName !== 'style' && LETTERS.test(node.data)) {
			problems.push(`${file}:${line(source, node.start)} text "${node.data.trim().slice(0, 40)}"`);
		}
		for (const attr of node.attributes ?? []) {
			if (attr.type !== 'Attribute' || !ATTRS.has(attr.name) || !Array.isArray(attr.value)) continue;
			for (const part of attr.value) {
				if (part.type === 'Text' && LETTERS.test(part.data)) {
					problems.push(`${file}:${line(source, part.start)} ${attr.name}="${part.data.slice(0, 40)}"`);
				}
			}
		}
		const name = node.type === 'RegularElement' ? node.name : parentName;
		for (const [key, value] of Object.entries(node)) {
			// Attributes were checked above; other attribute text (classes, roles, ids) is not user-facing.
			if (key === 'attributes' || key === 'parent') continue;
			if (value && typeof value === 'object') visit(value, name);
		}
	};
	visit(ast.fragment, null);
}

function line(source, offset) {
	return source.slice(0, offset).split('\n').length;
}

if (problems.length) {
	console.error(`Hard-coded user-facing text (use t() from $lib/i18n):\n  ${problems.join('\n  ')}`);
	process.exit(1);
}
console.log('i18n check passed: no hard-coded user-facing text.');
