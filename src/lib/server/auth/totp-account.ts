import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { writeTx } from '../db';
import { users } from '../db/schema';
import type { UserRow } from './accounts';
import { decryptSecret, base32Decode, verifyTotp } from './totp';

export const totpEnabled = (u: Pick<UserRow, 'totpSecretEnc'>) => u.totpSecretEnc !== null;

/**
 * Checks a code against the user's ACTIVE secret and, if it is valid and fresh, records its step in one atomic
 * update so two parallel requests cannot both use the same code. A secret that no longer decrypts (SESSION_SECRET
 * changed) never matches; the recovery key is the way back in.
 */
export function consumeActiveCode(user: UserRow, code: string, now = Date.now()): boolean {
	if (!user.totpSecretEnc) return false;
	const secret = decryptSecret(user.totpSecretEnc);
	if (!secret) return false;
	const step = verifyTotp(base32Decode(secret), code, now, user.totpLastStep);
	if (step === null) return false;
	return writeTx(
		(tx) =>
			tx
				.update(users)
				.set({ totpLastStep: step })
				.where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
				.run().changes === 1
	);
}
