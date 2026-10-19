import { logLine } from '../db/log';
import { parseEndpoint } from './endpoint';
import { vapidAuthorization, type VapidConfig } from './vapid';

export type SendOutcome = 'sent' | 'gone' | 'failed';

export const SEND_TIMEOUT_MS = 10_000;

/**
 * POSTs an empty (payload-less) push to the subscription's endpoint. The service worker shows a fixed, neutral
 * notification, so nothing about the diary is in the request. Logs the status and the host only, never the endpoint
 * path (it identifies the device). 404 and 410 mean the subscription is gone.
 */
export async function sendPush(
	endpoint: string,
	config: VapidConfig,
	fetchImpl: typeof fetch = fetch
): Promise<SendOutcome> {
	const url = parseEndpoint(endpoint);
	if (!url) {
		logLine({ event: 'push_sent', ok: false, reason: 'endpoint_not_allowed' });
		return 'failed';
	}
	try {
		const res = await fetchImpl(url, {
			method: 'POST',
			redirect: 'manual',
			signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
			headers: {
				authorization: vapidAuthorization(config, url.origin),
				ttl: '3600',
				urgency: 'high',
				'content-length': '0'
			}
		});
		await res.body?.cancel().catch(() => undefined);
		if (res.status === 404 || res.status === 410) {
			logLine({ event: 'push_sent', ok: false, status: res.status, host: url.hostname });
			return 'gone';
		}
		const ok = res.status >= 200 && res.status < 300;
		logLine({ event: 'push_sent', ok, status: res.status, host: url.hostname });
		return ok ? 'sent' : 'failed';
	} catch {
		logLine({ event: 'push_sent', ok: false, reason: 'network', host: url.hostname });
		return 'failed';
	}
}
