import { describe, expect, it } from 'vitest';
import { FULL_MAX_SIDE, THUMB_MAX_SIDE, fitWithin } from './process';

describe('fitWithin', () => {
	it('never upscales', () => {
		expect(fitWithin(800, 600, FULL_MAX_SIDE)).toEqual({ w: 800, h: 600 });
		expect(fitWithin(1600, 1600, FULL_MAX_SIDE)).toEqual({ w: 1600, h: 1600 });
	});
	it('limits the longest side and keeps the aspect ratio', () => {
		expect(fitWithin(4000, 3000, FULL_MAX_SIDE)).toEqual({ w: 1600, h: 1200 });
		expect(fitWithin(3000, 4000, FULL_MAX_SIDE)).toEqual({ w: 1200, h: 1600 });
		expect(fitWithin(1600, 1200, THUMB_MAX_SIDE)).toEqual({ w: 320, h: 240 });
	});
	it('never returns a zero side', () => {
		expect(fitWithin(10000, 1, FULL_MAX_SIDE)).toEqual({ w: 1600, h: 1 });
	});
});
