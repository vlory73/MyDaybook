import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './+server';

describe('GET /api/privacy', () => {
	const keys = ['IP_RETENTION_DAYS', 'BACKUP_RETENTION_DAYS', 'OPERATOR_NAME', 'OPERATOR_CONTACT'] as const;
	const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
	afterEach(() => {
		for (const k of keys) {
			if (saved[k] === undefined) delete process.env[k];
			else process.env[k] = saved[k];
		}
	});

	it('answers with the four public values and a short cache, and nothing else', async () => {
		process.env.IP_RETENTION_DAYS = '3';
		process.env.BACKUP_RETENTION_DAYS = 'nonsense';
		process.env.OPERATOR_NAME = 'Test operator';
		delete process.env.OPERATOR_CONTACT;
		const res = (GET as unknown as () => Response)();
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('public, max-age=60');
		expect(await res.json()).toEqual({
			ipRetentionDays: 3,
			backupRetentionDays: 14,
			operatorName: 'Test operator',
			operatorContact: ''
		});
	});
});
