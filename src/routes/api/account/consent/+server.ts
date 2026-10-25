import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { consents } from '$lib/server/db/schema';
import { api, reply, requireUser } from '$lib/server/auth/http';

/** The signed-in person's own consent record: which version they agreed to, and when. Nothing else. */
export const GET = api((event) => {
	const { user } = requireUser(event);
	const row = db()
		.select({ version: consents.version, acceptedAt: consents.acceptedAt })
		.from(consents)
		.where(eq(consents.userId, user.id))
		.orderBy(desc(consents.acceptedAt))
		.get();
	return reply({ consent: row ?? null });
});
