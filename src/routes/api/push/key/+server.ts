import { ApiError, api, reply, requireUser } from '$lib/server/auth/http';
import { vapidConfig } from '$lib/server/push/vapid';

/** The server's VAPID public key, which the browser needs to subscribe. 503 when reminders are not set up here. */
export const GET = api((event) => {
	requireUser(event);
	const config = vapidConfig();
	if (!config) throw new ApiError(503, 'push_not_configured');
	return reply({ publicKey: config.publicKey });
});
