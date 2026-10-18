// Licence policy (spec "Licence hygiene", decisions D6 and D22). Pure functions, unit-tested.

/** Allowed for anything that ships: server runtime, client bundle. */
export const SHIPPED = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD']);
/** Data/asset licences also allowed for shipped packages and static files. */
export const ASSET = new Set(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']);
/** Build/test tooling only (never shipped): additionally allows these permissive licences (D22). */
export const TOOLING_EXTRA = new Set(['BlueOak-1.0.0', 'Python-2.0']);
/** Fonts may also be OFL-1.1 (D6). */
export const FONT_EXTRA = new Set(['OFL-1.1']);

/** Evaluates a simple SPDX expression (OR / AND / parentheses) against an allowed set. */
export function satisfies(expression, allowed) {
	const expr = String(expression).trim();
	if (!expr) return false;
	const strip = (s) => {
		s = s.trim();
		while (s.startsWith('(') && s.endsWith(')') && balanced(s.slice(1, -1))) s = s.slice(1, -1).trim();
		return s;
	};
	const e = strip(expr);
	const orParts = splitTop(e, ' OR ');
	if (orParts.length > 1) return orParts.some((p) => satisfies(p, allowed));
	const andParts = splitTop(e, ' AND ');
	if (andParts.length > 1) return andParts.every((p) => satisfies(p, allowed));
	return allowed.has(e.replace(/\*$/, ''));
}

function balanced(s) {
	let depth = 0;
	for (const ch of s) {
		if (ch === '(') depth++;
		if (ch === ')' && --depth < 0) return false;
	}
	return depth === 0;
}

function splitTop(s, sep) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '(') depth++;
		else if (s[i] === ')') depth--;
		else if (depth === 0 && s.startsWith(sep, i)) {
			parts.push(s.slice(start, i));
			start = i + sep.length;
		}
	}
	parts.push(s.slice(start));
	return parts;
}

export const union = (...sets) => new Set(sets.flatMap((s) => [...s]));
