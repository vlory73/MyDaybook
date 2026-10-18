import { describe, expect, it } from 'vitest';
import { FULL_MAX_SIDE, PhotoError, THUMB_MAX_SIDE, firstWithin, fitWithin } from './process';

describe('fitWithin', () => {
	it('never upscales', () => {
		expect(fitWithin(800, 600, FULL_MAX_SIDE)).toEqual({ w: 800, h: 600 });
		expect(fitWithin(1280, 1280, FULL_MAX_SIDE)).toEqual({ w: 1280, h: 1280 });
	});
	it('limits the longest side and keeps the aspect ratio', () => {
		expect(fitWithin(4000, 3000, FULL_MAX_SIDE)).toEqual({ w: 1280, h: 960 });
		expect(fitWithin(3000, 4000, FULL_MAX_SIDE)).toEqual({ w: 960, h: 1280 });
		expect(fitWithin(1280, 960, THUMB_MAX_SIDE)).toEqual({ w: 256, h: 192 });
	});
	it('never returns a zero side', () => {
		expect(fitWithin(10000, 1, FULL_MAX_SIDE)).toEqual({ w: 1280, h: 1 });
	});
});

describe('firstWithin', () => {
	const sized = (n: number) => async () => ({ bytes: new Uint8Array(n) });
	const run = (sizes: number[], target: number, hard: number) => {
		const tried: number[] = [];
		const result = firstWithin(
			sizes,
			(n) => {
				tried.push(n);
				return sized(n)();
			},
			target,
			hard
		);
		return { result, tried };
	};

	it('stops at the first step that fits the target', async () => {
		const { result, tried } = run([500, 300, 100], 400, 1000);
		expect((await result).bytes.length).toBe(300);
		expect(tried).toEqual([500, 300]);
	});
	it('keeps the last step when only the hard limit fits', async () => {
		expect((await run([900, 700], 400, 1000).result).bytes.length).toBe(700);
	});
	it('refuses a photo that fits neither', async () => {
		await expect(run([1200, 1100], 400, 1000).result).rejects.toBeInstanceOf(PhotoError);
	});
});
