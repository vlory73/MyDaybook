import { api, reply } from '$lib/server/auth/http';
import { destroySession } from '$lib/server/auth/sessions';

export const POST = api((event) => {
	destroySession(event.cookies, event.locals.sessionId ?? undefined);
	return reply({ ok: true });
});
