/** Small pure helpers for drawing: runs of consecutive days and SVG path text. */

export type Run<T> = { start: number; items: T[] };

/** Splits a series into runs of consecutive days that have a value; a gap (null) ends a run. */
export function runs<T>(values: readonly (T | null)[]): Run<T>[] {
	const out: Run<T>[] = [];
	let current: Run<T> | null = null;
	values.forEach((v, i) => {
		if (v === null) {
			current = null;
		} else if (current) {
			current.items.push(v);
		} else {
			current = { start: i, items: [v] };
			out.push(current);
		}
	});
	return out;
}

export type Pt = { x: number; y: number };
const f = (n: number) => String(Math.round(n * 10) / 10);

/** "M x y L x y ..." through the points (nothing for fewer than two). */
export function linePath(points: readonly Pt[]): string {
	if (points.length < 2) return '';
	return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p.x)} ${f(p.y)}`).join(' ');
}

/** A closed band between an upper and a lower edge (same x positions, left to right). */
export function bandPath(upper: readonly Pt[], lower: readonly Pt[]): string {
	if (upper.length < 2 || upper.length !== lower.length) return '';
	const top = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p.x)} ${f(p.y)}`);
	const bottom = [...lower].reverse().map((p) => `L${f(p.x)} ${f(p.y)}`);
	return `${top.join(' ')} ${bottom.join(' ')} Z`;
}

/** Up to `count` indices spread evenly over `n` slots, always including the first and last. */
export function tickIndices(n: number, count: number): number[] {
	if (n <= 0) return [];
	if (n <= count) return Array.from({ length: n }, (_, i) => i);
	const out: number[] = [];
	for (let i = 0; i < count; i++) out.push(Math.round((i * (n - 1)) / (count - 1)));
	return [...new Set(out)];
}

/** Moves labels apart so that neighbours are at least `gap` apart, keeping their order. Returns the new positions. */
export function spread(positions: readonly number[], gap: number): number[] {
	const order = positions.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i);
	const out = order.map((o) => o.p);
	for (let k = 1; k < out.length; k++) if (out[k]! - out[k - 1]! < gap) out[k] = out[k - 1]! + gap;
	// Centre the pushed group back around where its labels wanted to be.
	const shift =
		(order.reduce((a, o) => a + o.p, 0) - out.reduce((a, v) => a + v, 0)) / Math.max(out.length, 1);
	const result = new Array<number>(positions.length);
	order.forEach((o, k) => (result[o.i] = out[k]! + shift));
	return result;
}
