import { blob, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Server-side schema (ARCHITECTURE §5). The server stores ciphertext and wrapped keys only:
 * there is deliberately no plaintext column for anything the user writes.
 * Conventions: text UUIDv4 ids, blobs as Buffers, timestamps as integer ms since epoch,
 * ON DELETE CASCADE from every user-owned table to users. Token tables hold SHA-256 hashes only.
 */
const bytes = (name: string) => blob(name, { mode: 'buffer' });
const userId = (name = 'user_id') =>
	text(name)
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' });

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').unique(), // null for dependents
	kind: text('kind', { enum: ['adult', 'dependent'] }).notNull(),
	role: text('role', { enum: ['member', 'admin'] })
		.notNull()
		.default('member'),
	status: text('status', { enum: ['active', 'disabled'] })
		.notNull()
		.default('active'),
	createdAt: integer('created_at').notNull(),
	kdfSalt: bytes('kdf_salt').notNull(),
	kdfParams: text('kdf_params').notNull(), // JSON
	authScheme: text('auth_scheme').notNull().default('derived-v1'),
	authVerifier: bytes('auth_verifier').notNull(), // SHA-256 of the derived auth key
	recoveryVerifier: bytes('recovery_verifier').notNull(), // SHA-256 of the recovery-derived key
	wrappedMkPw: bytes('wrapped_mk_pw').notNull(),
	wrappedMkRk: bytes('wrapped_mk_rk').notNull(),
	publicKey: bytes('public_key').notNull(),
	wrappedPrivateKey: bytes('wrapped_private_key').notNull(),
	totpSecretEnc: bytes('totp_secret_enc'), // active secret (AES-256-GCM under a key derived from SESSION_SECRET)
	totpPendingEnc: bytes('totp_pending_enc'), // secret shown during enrolment, not yet confirmed
	totpLastStep: integer('totp_last_step'), // newest accepted 30 s step, for replay protection
	storageBytes: integer('storage_bytes').notNull().default(0)
});

export const guardianships = sqliteTable(
	'guardianships',
	{
		dependentId: userId('dependent_id'),
		guardianId: userId('guardian_id'),
		sealedMk: bytes('sealed_mk').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.dependentId, t.guardianId] }),
		index('guardianships_guardian_idx').on(t.guardianId)
	]
);

export const records = sqliteTable(
	'records',
	{
		id: text('id').primaryKey(), // client-generated UUIDv4
		userId: userId(),
		wrappedKey: bytes('wrapped_key'), // null when tombstoned
		ciphertext: bytes('ciphertext'), // null when tombstoned
		size: integer('size').notNull().default(0),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
		rev: integer('rev').notNull().default(1),
		deletedAt: integer('deleted_at')
	},
	(t) => [index('records_user_updated_idx').on(t.userId, t.updatedAt)]
);

export const attachments = sqliteTable(
	'attachments',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		size: integer('size').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => [index('attachments_user_idx').on(t.userId)]
);

export const consents = sqliteTable(
	'consents',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		version: text('version').notNull(),
		textHash: text('text_hash').notNull(),
		locale: text('locale').notNull(),
		actor: text('actor').notNull(), // who accepted (the user, or a guardian id)
		acceptedAt: integer('accepted_at').notNull(),
		withdrawnAt: integer('withdrawn_at')
	},
	(t) => [index('consents_user_idx').on(t.userId)]
);

export const invites = sqliteTable('invites', {
	id: text('id').primaryKey(),
	tokenHash: bytes('token_hash').notNull().unique(), // SHA-256 of the token
	createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
	role: text('role', { enum: ['member', 'admin'] })
		.notNull()
		.default('member'),
	createdAt: integer('created_at').notNull(),
	expiresAt: integer('expires_at').notNull(),
	usedAt: integer('used_at'),
	usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' })
});

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		tokenHash: bytes('token_hash').notNull().unique(), // SHA-256 of the session token
		userId: userId(),
		createdAt: integer('created_at').notNull(),
		expiresAt: integer('expires_at').notNull(),
		lastSeenAt: integer('last_seen_at').notNull()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

// Short-lived, single-use proof that the recovery key was presented (ARCHITECTURE §3.3).
export const recoveryTokens = sqliteTable(
	'recovery_tokens',
	{
		id: text('id').primaryKey(),
		tokenHash: bytes('token_hash').notNull().unique(), // SHA-256 of the token
		userId: userId(),
		expiresAt: integer('expires_at').notNull()
	},
	(t) => [index('recovery_tokens_user_idx').on(t.userId)]
);

export const handovers = sqliteTable(
	'handovers',
	{
		id: text('id').primaryKey(),
		tokenHash: bytes('token_hash').notNull().unique(), // SHA-256 of the handover token
		dependentId: userId('dependent_id'),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: integer('created_at').notNull(),
		expiresAt: integer('expires_at').notNull(),
		usedAt: integer('used_at')
	},
	(t) => [index('handovers_dependent_idx').on(t.dependentId)]
);

export const pushSubscriptions = sqliteTable(
	'push_subscriptions',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		endpoint: text('endpoint').notNull(),
		keys: text('keys').notNull(), // JSON { p256dh, auth }
		createdAt: integer('created_at').notNull()
	},
	(t) => [
		uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
		index('push_subscriptions_user_idx').on(t.userId)
	]
);

// Deliberately not linked to any medication (threat model).
export const reminderSlots = sqliteTable(
	'reminder_slots',
	{
		id: text('id').primaryKey(),
		userId: userId(),
		localTime: text('local_time').notNull(), // HH:MM
		weekdayMask: integer('weekday_mask').notNull(), // bit 0 = Monday ... bit 6 = Sunday
		timeZone: text('time_zone').notNull(), // IANA
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [index('reminder_slots_user_idx').on(t.userId)]
);

export const securityEvents = sqliteTable(
	'security_events',
	{
		id: text('id').primaryKey(),
		type: text('type').notNull(),
		userId: text('user_id'), // no FK: events outlive the account
		ip: text('ip'),
		at: integer('at').notNull()
	},
	(t) => [index('security_events_at_idx').on(t.at)]
);

export const adminAudit = sqliteTable(
	'admin_audit',
	{
		id: text('id').primaryKey(),
		adminId: text('admin_id'), // no FK: the audit trail outlives accounts
		action: text('action', { enum: ['invite', 'revoke_invite', 'disable', 'enable', 'delete'] }).notNull(),
		targetId: text('target_id'),
		at: integer('at').notNull()
	},
	(t) => [index('admin_audit_at_idx').on(t.at)]
);
