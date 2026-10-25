import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeOrphanBlobs } from './orphans';

vi.mock('../db/log', () => ({ logLine: vi.fn() }));

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'mydaybook-orphans-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('removeOrphanBlobs', () => {
	it('removes folders of users that no longer exist and keeps the others', () => {
		for (const id of ['alive', 'gone-1', 'gone-2']) {
			mkdirSync(join(dir, 'blobs', id), { recursive: true });
			writeFileSync(join(dir, 'blobs', id, 'photo'), 'cipher');
		}
		writeFileSync(join(dir, 'blobs', 'stray-file'), 'x');
		expect(removeOrphanBlobs(dir, (id) => id === 'alive')).toBe(2);
		expect(existsSync(join(dir, 'blobs', 'alive', 'photo'))).toBe(true);
		expect(existsSync(join(dir, 'blobs', 'gone-1'))).toBe(false);
		expect(existsSync(join(dir, 'blobs', 'gone-2'))).toBe(false);
		expect(existsSync(join(dir, 'blobs', 'stray-file'))).toBe(true);
		expect(removeOrphanBlobs(dir, (id) => id === 'alive')).toBe(0);
	});

	it('does nothing when there is no blobs folder', () => {
		expect(removeOrphanBlobs(dir, () => false)).toBe(0);
	});
});
