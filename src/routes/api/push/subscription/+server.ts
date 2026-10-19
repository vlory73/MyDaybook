import { writeTx } from '$lib/server/db';
import { ApiError, api, readJson, reply, requireUser } from '$lib/server/auth/http';
import { deleteSubscription, upsertSubscription } from '$lib/server/push/subscriptions';
import { vapidConfig } from '$lib/server/push/vapid';

/** Registers this device's push subscription with its reminder schedule (times and time zone only). */
export const PUT = api(async (event) => {
	const { user } = requireUser(event);
	if (!vapidConfig()) throw new ApiError(503, 'push_not_configured');
	const body = await readJson(event);
	const result = writeTx((tx) => upsertSubscription(tx, user.id, body));
	if (!result.ok) throw new ApiError(result.status, result.code);
	return reply({ ok: true }, result.created ? 201 : 200);
});

/** Removes this device's own subscription. Works even when reminders were switched off on the server. */
export const DELETE = api(async (event) => {
	const { user } = requireUser(event);
	const body = await readJson(event);
	if (!writeTx((tx) => deleteSubscription(tx, user.id, body.endpoint))) throw new ApiError(404, 'not_found');
	return reply({ ok: true });
});
