import { describe, expect, it } from 'vitest';
import { parseEndpoint } from './endpoint';

describe('push endpoint allowlist', () => {
	it('accepts the known push services over https', () => {
		for (const ok of [
			'https://web.push.apple.com/QAbc123',
			'https://fcm.googleapis.com/fcm/send/abc:def',
			'https://fcm.googleapis.com/wp/xyz',
			'https://updates.push.services.mozilla.com/wpush/v2/abc',
			'https://db5p.notify.windows.com/?token=abc',
			'HTTPS://WEB.PUSH.APPLE.COM/x'
		]) {
			expect(parseEndpoint(ok), ok).not.toBeNull();
		}
	});

	it('rejects other hosts, look-alikes and internal addresses', () => {
		for (const bad of [
			'https://example.com/push',
			'https://evil.example/web.push.apple.com',
			'https://web.push.apple.com.evil.example/x',
			'https://push.apple.com.evil.example/x',
			'https://notpush.apple.com/x',
			'https://storage.googleapis.com/bucket',
			'https://fcm.googleapis.com.evil.example/x',
			'https://127.0.0.1/x',
			'https://localhost/x',
			'https://[::1]/x',
			'https://169.254.169.254/latest',
			'https://user:pw@fcm.googleapis.com/x',
			'https://fcm.googleapis.com:8443/x',
			'http://fcm.googleapis.com/x',
			'ftp://fcm.googleapis.com/x',
			'//fcm.googleapis.com/x',
			'not a url',
			''
		]) {
			expect(parseEndpoint(bad), bad).toBeNull();
		}
	});

	it('rejects non-strings and very long values', () => {
		expect(parseEndpoint(undefined)).toBeNull();
		expect(parseEndpoint(42)).toBeNull();
		expect(parseEndpoint(`https://fcm.googleapis.com/${'a'.repeat(2100)}`)).toBeNull();
	});
});
