# Threat model

Status: **proposal (M0)**. Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md). Revisit at every milestone that touches
auth, crypto, storage, push or export.

## 1. What we protect

| Asset | Sensitivity |
| --- | --- |
| Diary content: food, mood, sleep, symptoms, measurements, pain points, medication list and doses, notes, photos | GDPR Art. 9 special category. Highest |
| Passphrase, recovery key, master key, per-record keys, identity private key | Equivalent to all content |
| Behavioural metadata: when someone logs, how much, reminder times | Can reveal health patterns indirectly |
| Account data: usernames, guardian relationships, consent records | Personal data; reveals household structure |
| Availability of the data | Loss is permanent if keys are lost (by design) |

## 2. Actors and trust

| Actor | Trusted for | Not trusted for |
| --- | --- | --- |
| The user, on their unlocked device | Everything they own | n/a |
| Other household members (including other adults) | Nothing of another person's diary | Reading, editing or inferring another person's content |
| **Operator / admin** (you, or a future self-hoster) | Keeping the service running and running *unmodified* images | Reading content. The design must make this impossible, not just forbidden |
| Guardian | A dependent's diary *until handover* | Anything after the handover is confirmed |
| Server host (Pi, OS, Docker) | Availability, storing ciphertext | Confidentiality of content |
| Network: LAN, VPN, ISP | Nothing | Everything (TLS required) |
| Apple / Google / Mozilla / Microsoft push services | Delivering a wake-up | Any content (the request has no body). They see the device endpoint, the server that pushes to it, and the timing of each push, i.e. the reminder times |
| npm dependencies and base images | Integrity, verified through pinning, audit and licence checks | Assumed possibly compromised; the main supply-chain risk |
| NAS / backup storage | Storing ciphertext | Confidentiality |

## 3. What a compromised server can and cannot learn

"Compromised" covers four cases, from weakest to strongest attacker: (a) stolen database or backup, (b) a curious admin with shell
access who does not modify code, (c) an attacker who can watch live traffic at the server, and (d) an attacker who can **change
the code** the server delivers.

### 3.1 It CAN learn (cases a to c)

- User IDs, usernames, roles, account status and creation dates.
- Household structure: which profiles are dependents, and who their guardians are.
- Number of records per user, their **padded** sizes (bucketed), and their create, update and delete times (upload times, not event times).
- Number, approximate size and upload times of attachments. Not which record they belong to.
- Reminder **times of day**, weekdays and time zone for users who enable push, as one merged list per device. Not what the reminder is for,
  how many medicines there are, or whether a dose was logged. The list changes when medication schedules change, so an observer of the
  database over time can see that a schedule was edited, and when.
- The push service endpoint (a per-device capability URL), which reveals Apple, Google/Mozilla or Microsoft, and therefore roughly the device type.
- The **timing of every push** the server sends (it sends one at each slot), which equals the uploaded times. Logs record the status and
  host of each push, never the endpoint path.
- Login and session times. IP addresses for failed or rate-limited attempts, kept only for `IP_RETENTION_DAYS` (default 7).
- Whether TOTP is enabled, storage used per user, consent versions and timestamps.
- Activity patterns derived from the above. Example: "uploads a small record most days around 08:05, shortly after a reminder slot".
- (case c only) The auth key each time a user logs in. This lets the attacker log in as that user, but **not** decrypt: the auth key is a
  KDF sibling of the wrapping key, not its parent.
- Later, if sharing between adults is enabled: which records are shared with whom. Sharing is off by default and will be documented when built.

### 3.2 It CANNOT learn (cases a to c)

- Any record content: no text, values, tags, photos, medication names, doses, body regions or intensities.
- **Record types.** Food, pain, medication and settings all look identical, and padding hides most size differences.
- The time an event happened (it lives inside the ciphertext), or the user's local time zone (unless they enable push).
- The passphrase, recovery key, master key, record keys or private keys.
- Which app screens are used: all JavaScript chunks are precached by the service worker, so navigation causes no requests.
- Search queries, filters and chart parameters (all computed on the client).

With a stolen database (case a), the attacker's only route to content is an **offline guessing attack on each passphrase**:
one Argon2id (64 MiB) per guess per user. A passphrase of four or more random words, which onboarding encourages with a strength meter, makes this
impractical. Recovery keys have 160 random bits and cannot be guessed.

### 3.3 The honest limit: case d (malicious code)

All browser-based E2EE has this limit: **the server delivers the code that holds the keys.** An attacker who can change the
JavaScript the server sends can capture a passphrase the next time a user unlocks. Mitigations:

- Pull-based deployment of images built by CI from this repository, pinned by version tag. Compose files can pin by digest too.
- The image runs as non-root with a read-only root filesystem, and app code is not writable from inside the container.
- The service worker serves the cached app shell. A future option is to have it alert the user when the shell's hash changes outside a
  known release. This deters silent tampering, but cannot stop a determined attacker who controls the first load.
- For users of a future self-hoster, this means: **trust the operator to run unmodified images.** The privacy notice template will
  say this plainly.

For the first deployment you are both the operator and a user, so case d reduces to "keep the Pi and the GitHub account secure"
(2FA on GitHub, a read-only GHCR token on the Pi, Portainer not exposed).

## 4. Threats and mitigations (STRIDE summary)

| # | Threat | Mitigation |
| --- | --- | --- |
| T1 | Admin reads someone's diary | E2EE; the server holds only ciphertext and wrapped keys; there is no admin tool that touches keys |
| T2 | Household member reads another member's diary on a shared or unlocked device | Per-user keys; auto-lock (5 min / 60 s background); lock wipes decrypted state; separate iOS profiles not needed |
| T3 | Database or backup theft | Content encrypted; offline Argon2id attack only; strong-passphrase guidance; backups on NAS contain only ciphertext |
| T4 | Server swaps or replays ciphertext between users or records | AEAD associated data binds `userId` + `recordId` to each record and key. **Residual:** rollback of a record to an older version, or deletion, is not detectable in v1 (a signed per-user manifest is a possible later improvement) |
| T5 | Account enumeration through prelogin | Deterministic fake salt for unknown users; uniform error messages and timing. **Residual:** fake answers always carry the default KDF parameters, so an account whose parameters were changed (e.g. a future strength upgrade) is distinguishable from a non-existent one until the defaults catch up |
| T6 | Online passphrase guessing | Rate limits per IP and per username; exponential backoff; optional TOTP (second factor checked only after the passphrase proof, wrong codes rate limited and logged, replay-protected, secret sealed with a key from `SESSION_SECRET`; the recovery key bypasses it by design); security events logged with short retention |
| T7 | Session theft or CSRF | `__Host-` cookie: HttpOnly, Secure, SameSite=Strict; Origin check; JSON-only API; sessions revocable; CSP blocks injected scripts. TOTP does not defend an already stolen session cookie |
| T8 | XSS leading to key theft | Strict hash-based CSP with no `unsafe-inline` and `default-src 'none'`; Svelte auto-escaping; no `{@html}` with user data (lint rule); user text is never rendered as HTML |
| T9 | Supply-chain compromise (npm, base image) | Lockfile with `npm ci`; `npm audit` and licence check in CI; minimal dependencies (one crypto library); Renovate/Dependabot PRs reviewed by a person; pinned base image digests; consider `--ignore-scripts` builds where possible |
| T10 | Metadata inference (timing, size) | Padding buckets; attachments allowed on any record type (the server sees count, padded size and upload time of blobs, but not which record they belong to, because the link and the keys are inside the encrypted record); reminder slots not linked to medications; all chunks precached. **Residual:** activity timing remains visible (see 3.1) |
| T11 | Push service learns health information | Payload-less pushes (empty body, so nothing to decrypt or leak); the notification text is fixed and neutral ("You have a reminder.") and shown by the service worker from a sentence stored on the device; opt-in per device. **Residual:** the push service and the server learn the reminder times and time zone, and the push service the timing of pushes. Endpoints are restricted to the known push services (SSRF guard) |
| T12 | Photo location leakage (EXIF/GPS) | Client-side re-encoding strips all metadata before encryption; a unit test verifies it |
| T13 | Plaintext leaves the E2EE boundary through exports (JSON/CSV/PDF) | Export happens only on explicit user action, is generated on the device, and comes with a short warning that the file is not encrypted |
| T14 | Guardian keeps access after handover | Master key rotation at handover (headers re-wrapped); guardian rows deleted after explicit confirmation. **Residual:** anything the guardian already saw or exported |
| T15 | Lost passphrase and recovery key | Unrecoverable by design; clear warning; recovery key confirmed by re-typing groups; printable sheet; recovery key rotated after use |
| T16 | Logs leak content or identity | No request bodies logged; no IPs on stdout; IPs only in `security_events` with retention; reverse-proxy access log off; client logger stripped in production |
| T17 | Deleted account lingers | Hard delete, `secure_delete`, `VACUUM`. **Residual:** persists in backups until rotation (about 14 days on the home NAS), still encrypted; stated in the privacy notice |
| T18 | Stolen phone | Locked app needs the passphrase. The IndexedDB cache holds only ciphertext and wrapped keys. iOS data protection adds encryption at rest |
| T19 | Network attacker on LAN/VPN | TLS everywhere; HSTS; VPN-only exposure |
| T20 | Denial of service against the Pi | Argon2id runs on the client (no server memory spike); rate limits; body size limits; 256 MB memory limit isolates other services (Home Assistant, Pi-hole) |
| T21 | Losing `.env` secrets | No secret is needed to decrypt user data. Losing `.env` only invalidates sessions, TOTP secrets and VAPID subscriptions. Documented in the backup guide |

## 5. Out of scope

- A compromised or jail-broken client device, malicious browser extensions, or shoulder-surfing.
- Physical attacks on an unlocked, unattended phone within the auto-lock window.
- Legal compulsion of the operator. The operator cannot hand over content they cannot read, but can hand over the metadata in 3.1.
- Quantum attackers. Symmetric keys are 256-bit; X25519 (used only for guardianship and later sharing) is not post-quantum.

## 6. Review triggers

Update this document when adding: sharing between adults, offline sync, the 3D body view, any new server-side table or column,
any new outbound network call, or any change to the key hierarchy.
