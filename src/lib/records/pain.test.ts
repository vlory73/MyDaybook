import { describe, expect, it } from 'vitest';
import { PAIN_QUALITIES, heatStep, isPainPayload, isPainPoint } from './pain';

// Synthetic data only.
const point = (extra: Record<string, unknown> = {}) => ({
	region: 'knee',
	side: 'right',
	space: '2d-front-v1',
	u: 0.42,
	v: 0.61,
	intensity: 6,
	qualities: ['aching'],
	note: 'after a walk',
	...extra
});
const pain = (extra: Record<string, unknown> = {}) => ({
	v: 1,
	type: 'pain',
	at: '2026-10-18T08:10:00+02:00',
	points: [point()],
	...extra
});

describe('pain validator', () => {
	it('accepts a normal entry, with or without notes and qualities', () => {
		expect(isPainPayload(pain())).toBe(true);
		expect(isPainPayload(pain({ points: [point({ note: undefined, qualities: [] })], note: 'ok' }))).toBe(
			true
		);
	});

	it('limits intensity to whole numbers 0 to 10', () => {
		for (const n of [0, 5, 10]) expect(isPainPoint(point({ intensity: n }))).toBe(true);
		for (const n of [-1, 11, 2.5, NaN, '5', null]) expect(isPainPoint(point({ intensity: n }))).toBe(false);
	});

	it('takes 0 to 3 distinct qualities from the list only', () => {
		expect(PAIN_QUALITIES).toEqual([
			'sharp',
			'dull',
			'burning',
			'throbbing',
			'aching',
			'tingling',
			'numb',
			'itchy'
		]);
		expect(isPainPoint(point({ qualities: ['numb', 'itchy', 'sharp'] }))).toBe(true);
		expect(isPainPoint(point({ qualities: ['sharp', 'dull', 'burning', 'aching'] }))).toBe(false);
		expect(isPainPoint(point({ qualities: ['other'] }))).toBe(false);
		expect(isPainPoint(point({ qualities: ['sharp', 'sharp'] }))).toBe(false);
		expect(isPainPoint(point({ qualities: 'sharp' }))).toBe(false);
		expect(isPainPoint(point({ qualities: undefined }))).toBe(false);
		expect(isPainPoint(point({ quality: 'aching', qualities: undefined }))).toBe(false);
	});

	it('takes 1 to 20 points', () => {
		expect(isPainPayload(pain({ points: [] }))).toBe(false);
		expect(isPainPayload(pain({ points: Array.from({ length: 20 }, () => point()) }))).toBe(true);
		expect(isPainPayload(pain({ points: Array.from({ length: 21 }, () => point()) }))).toBe(false);
		expect(isPainPayload(pain({ points: undefined }))).toBe(false);
	});

	it('keeps u and v within 0..1', () => {
		for (const [u, v] of [
			[0, 0],
			[1, 1]
		] as const)
			expect(isPainPoint(point({ u, v }))).toBe(true);
		for (const bad of [-0.01, 1.01, NaN, Infinity, '0.5'] as const) {
			expect(isPainPoint(point({ u: bad }))).toBe(false);
			expect(isPainPoint(point({ v: bad }))).toBe(false);
		}
	});

	it('knows the region, side and space', () => {
		expect(isPainPoint(point({ region: 'nosee' as never }))).toBe(false);
		expect(isPainPoint(point({ side: 'middle' }))).toBe(false);
		expect(isPainPoint(point({ side: 'midline' }))).toBe(false); // the knee is paired
		expect(isPainPoint(point({ region: 'thigh', side: 'midline' }))).toBe(false); // the thigh is paired
		expect(isPainPoint(point({ region: 'lower_belly', side: 'left' }))).toBe(true);
		expect(isPainPoint(point({ region: 'lower_back', side: 'left', space: '2d-back-v1' }))).toBe(false);
		expect(isPainPoint(point({ region: 'lower_back', side: 'midline', space: '2d-back-v1' }))).toBe(true);
		expect(isPainPoint(point({ space: '3d-mesh-v1' }))).toBe(false);
		expect(isPainPoint(point({ region: 'calf', space: '2d-front-v1' }))).toBe(false); // the front view has no calf
	});

	it('accepts the close-up spaces for their own regions only', () => {
		const head = { space: '2d-head-v1' } as const;
		expect(isPainPoint(point({ region: 'temple', side: 'left', ...head }))).toBe(true);
		expect(isPainPoint(point({ region: 'nose', side: 'midline', ...head }))).toBe(true);
		expect(isPainPoint(point({ region: 'nose', side: 'left', ...head }))).toBe(false);
		expect(isPainPoint(point({ region: 'temple', side: 'left' }))).toBe(false); // not on the front view
		expect(isPainPoint(point({ region: 'knee', side: 'left', ...head }))).toBe(false);
		const hand = { space: '2d-hand-v1' } as const;
		expect(isPainPoint(point({ region: 'thumb', side: 'right', ...hand }))).toBe(true);
		expect(isPainPoint(point({ region: 'back_of_hand', side: 'left', ...hand }))).toBe(true);
		expect(isPainPoint(point({ region: 'thumb', side: 'midline', ...hand }))).toBe(false);
		const foot = { space: '2d-foot-v1' } as const;
		expect(isPainPoint(point({ region: 'sole', side: 'right', ...foot }))).toBe(true);
		expect(isPainPoint(point({ region: 'heel', side: 'left', ...foot }))).toBe(true);
		expect(isPainPoint(point({ region: 'heel', side: 'left', space: '2d-back-v1' }))).toBe(true);
		expect(isPainPoint(point({ region: 'sole', side: 'right', ...hand }))).toBe(false);
		// The main-view hand and foot stay valid choices.
		expect(isPainPoint(point({ region: 'hand', side: 'right' }))).toBe(true);
		expect(isPainPoint(point({ region: 'foot', side: 'left' }))).toBe(true);
	});

	it('accepts wider areas, and old belly points on a side', () => {
		expect(isPainPoint(point({ region: 'belly', side: 'midline', u: 0.5, v: 0.5 }))).toBe(true);
		expect(isPainPoint(point({ region: 'belly', side: 'left' }))).toBe(false);
		expect(isPainPoint(point({ region: 'upper_belly', side: 'midline' }))).toBe(true);
		expect(isPainPoint(point({ region: 'lower_belly', side: 'midline' }))).toBe(true);
		expect(isPainPoint(point({ region: 'upper_belly', side: 'left' }))).toBe(true);
		expect(isPainPoint(point({ region: 'lower_belly', side: 'right' }))).toBe(true);
		expect(isPainPoint(point({ region: 'belly', side: 'midline', space: '2d-back-v1' }))).toBe(false);
		expect(isPainPoint(point({ region: 'back', side: 'midline', space: '2d-back-v1' }))).toBe(true);
		expect(isPainPoint(point({ region: 'back', side: 'midline', space: '2d-front-v1' }))).toBe(false);
		expect(isPainPoint(point({ region: 'back', side: 'left', space: '2d-back-v1' }))).toBe(false);
	});

	it('limits notes and needs a real time', () => {
		expect(isPainPoint(point({ note: 'x'.repeat(500) }))).toBe(true);
		expect(isPainPoint(point({ note: 'x'.repeat(501) }))).toBe(false);
		expect(isPainPayload(pain({ at: 'yesterday' }))).toBe(false);
		expect(isPainPayload(pain({ type: 'food' }))).toBe(false);
		expect(isPainPayload(null)).toBe(false);
	});
});

describe('heat steps', () => {
	it('is a plain, rising scale of seven steps with no thresholds', () => {
		const steps = Array.from({ length: 11 }, (_, i) => heatStep(i));
		expect(steps).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6]);
	});
});
