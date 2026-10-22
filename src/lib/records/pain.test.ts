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
			'constant',
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
		const head = { space: '2d-head-front-v2' } as const;
		expect(isPainPoint(point({ region: 'temple', side: 'left', ...head }))).toBe(true);
		expect(isPainPoint(point({ region: 'temple', side: 'midline', ...head }))).toBe(false);
		expect(isPainPoint(point({ region: 'top_of_head', side: 'midline', ...head }))).toBe(false); // back view only
		const headBack = { space: '2d-head-back-v2' } as const;
		expect(isPainPoint(point({ region: 'top_of_head', side: 'midline', ...headBack }))).toBe(true);
		expect(isPainPoint(point({ region: 'rear_head', side: 'right', ...headBack }))).toBe(true);
		// The first head close-up (`2d-head-v1`, with nose, mouth, chin and ear zones) was never released, so its space
		// and those zone IDs are simply rejected: there is no compatibility layer.
		expect(isPainPoint(point({ region: 'temple', side: 'left', space: '2d-head-v1' as never }))).toBe(false);
		for (const old of ['nose', 'mouth', 'chin', 'ear', 'eye'])
			expect(isPainPoint(point({ region: old, side: 'midline', ...head }))).toBe(false);
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

describe('pain: constant quality and headache details', () => {
	const H = '2026-10-18T22:00:00+02:00';
	it('accepts "constant" as a quality, still at most three per point', () => {
		expect(isPainPoint(point({ qualities: ['throbbing', 'constant'] }))).toBe(true);
		expect(isPainPoint(point({ qualities: ['throbbing', 'constant', 'dull', 'sharp'] }))).toBe(false);
	});
	it('keeps entries without details valid and takes a full headache object', () => {
		expect(isPainPayload(pain())).toBe(true);
		expect(isPainPayload(pain({ headache: {} }))).toBe(true);
		expect(
			isPainPayload(
				pain({
					headache: {
						started: H,
						stopped: '2026-10-19T03:00:00+02:00',
						before: ['vision', 'speech'],
						worseWithActivity: true,
						light: false,
						sound: true,
						trigger: 'skipped lunch'
					}
				})
			)
		).toBe(true);
	});
	it('rejects bad headache values', () => {
		for (const headache of [
			null,
			[],
			'x',
			{ started: '2026-10-18T22:30:00+02:00' },
			{ started: '2026-10-18T22:00:00' },
			{ started: '2026-10-18T22:00:30+02:00' },
			{ started: H, stopped: '2026-10-18T20:00:00+02:00' },
			{ stopped: H, stillGoing: true },
			{ stillGoing: false },
			{ before: ['aura'] },
			{ before: ['vision', 'vision'] },
			{ before: 'vision' },
			{ light: 'yes' },
			{ trigger: '' },
			{ trigger: 'x'.repeat(201) },
			{ other: 1 }
		])
			expect(isPainPayload(pain({ headache })), JSON.stringify(headache)).toBe(false);
	});
});
