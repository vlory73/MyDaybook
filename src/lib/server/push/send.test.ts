import { afterEach, describe, expect, it, vi } from 'vitest';
import { syntheticVapidKeys } from './test-keys';
import { sendPush } from './send';
import { vapidConfig } from './vapid';

const keys = syntheticVapidKeys();
const config = vapidConfig({ ...keys, VAPID_SUBJECT: 'mailto:owner@example.invalid' })!;
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/secret-device-token';

const respond = (status: number) =>
	vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

afterEach(() => vi.restoreAllMocks());

describe('sendPush', () => {
	it('POSTs an empty body with VAPID, TTL and urgency headers', async () => {
		const fetchMock = respond(201);
		expect(await sendPush(ENDPOINT, config, fetchMock)).toBe('sent');
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(String(url)).toBe(ENDPOINT);
		expect(init.method).toBe('POST');
		expect(init.body).toBeUndefined();
		expect(init.redirect).toBe('manual');
		expect(init.signal).toBeInstanceOf(AbortSignal);
		const h = init.headers as Record<string, string> & { authorization: string };
		expect(h.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
		expect(h.authorization.endsWith(`k=${keys.VAPID_PUBLIC_KEY}`)).toBe(true);
		expect(h.ttl).toBe('3600');
		expect(h.urgency).toBe('high');
		expect(h['content-length']).toBe('0');
		const claims = JSON.parse(Buffer.from(h.authorization.split('.')[1]!, 'base64url').toString()) as {
			aud: string;
		};
		expect(claims.aud).toBe('https://fcm.googleapis.com');
	});

	it('reports 404 and 410 as gone, other statuses as failed', async () => {
		expect(await sendPush(ENDPOINT, config, respond(410))).toBe('gone');
		expect(await sendPush(ENDPOINT, config, respond(404))).toBe('gone');
		expect(await sendPush(ENDPOINT, config, respond(429))).toBe('failed');
		expect(await sendPush(ENDPOINT, config, respond(500))).toBe('failed');
	});

	it('treats a network error or timeout as failed', async () => {
		const boom = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		expect(await sendPush(ENDPOINT, config, boom)).toBe('failed');
	});

	it('refuses endpoints outside the allowlist without calling out', async () => {
		const fetchMock = respond(201);
		expect(await sendPush('https://internal.example/hook', config, fetchMock)).toBe('failed');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('logs the status and host but never the endpoint path', async () => {
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		await sendPush(ENDPOINT, config, respond(201));
		await sendPush(ENDPOINT, config, respond(410));
		const logged = write.mock.calls.map((c) => String(c[0])).join('');
		expect(logged).toContain('fcm.googleapis.com');
		expect(logged).toContain('"status":410');
		expect(logged).not.toContain('secret-device-token');
		expect(logged).not.toContain('vapid');
	});
});
