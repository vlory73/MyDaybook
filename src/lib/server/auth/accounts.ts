import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;

const b64 = (buf: Buffer) => buf.toString('base64url');

export function findByUsername(username: string): UserRow | undefined {
	return db().select().from(users).where(eq(users.username, username)).get();
}

export function findById(id: string): UserRow | undefined {
	return db().select().from(users).where(eq(users.id, id)).get();
}

/** All wrapped key material the client needs to unlock after login or reload. Nothing here opens without the passphrase. */
export function bundleOf(u: UserRow) {
	return {
		kdfSalt: b64(u.kdfSalt),
		kdfParams: JSON.parse(u.kdfParams) as unknown,
		wrappedMkByPassphrase: b64(u.wrappedMkPw),
		wrappedPrivateKey: b64(u.wrappedPrivateKey),
		publicKey: b64(u.publicKey)
	};
}

export function identityOf(u: UserRow) {
	return { userId: u.id, username: u.username, role: u.role };
}
