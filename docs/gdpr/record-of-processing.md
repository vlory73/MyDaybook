# Record of processing activities (Art. 30, template)

**How to use this template.** Copy it, fill in the bracketed parts and keep it up to date whenever you change hosting, backups
or settings. Keep it internal; you show it to the supervisory authority on request. It is a template, **not legal advice**.
A family running the app for itself under the household exemption does not need one, but it is a handy checklist.

## 1. Controller

| Item | Entry |
| --- | --- |
| Controller | [OPERATOR NAME], [ADDRESS] |
| Contact (and DPO, if you have one) | [CONTACT EMAIL] |
| Joint controllers / processors | [NONE, or list a hosting provider acting as processor, with the contract date] |

## 2. Processing activities

| # | Purpose | Categories of data subjects | Categories of personal data | Legal basis |
| --- | --- | --- | --- | --- |
| P1 | Store users' private diary | Invited users aged 13 and over | Encrypted diary entries and photos (health data, Art. 9). The operator holds ciphertext, rounded-up sizes and upload/update/delete times only | Explicit consent, Art. 9(2)(a), Art. 6(1)(a) |
| P2 | Run accounts and sign-in | Users, admins | Username, role, status, creation date, key-wrapping material and sign-in verifiers (no plaintext passphrase), optional encrypted two-step secret, storage used, session tokens (hashed) with times | Consent; contract-like necessity of the service |
| P3 | Record consent | Users | Consent version, text hash, language, time, who accepted | Legal obligation to demonstrate consent, Art. 7(1) |
| P4 | Keep the service secure | Users, people who try to sign in | Security events (type, time, user id if known, IP address), rate-limit counters (in memory only), admin audit log (admin id, action, target id, time) | Legitimate interest, Art. 6(1)(f) [confirm] |
| P5 | Medication reminders (optional) | Users who switch them on | Push endpoint of the device, reminder times, weekdays, time zone. No medicine names | Consent |
| P6 | Backups and recovery | All users | Copies of everything in P1-P5 (still encrypted where P1 is concerned) | Same as the source data; security, Art. 32 |

## 3. Recipients

| Recipient | What it receives | Role |
| --- | --- | --- |
| Hosting: [e.g. the operator's own Raspberry Pi, Denmark] | Everything above | Operator's own system |
| Backup storage: [e.g. NAS at the same address / cloud provider, country] | Encrypted dumps of the database and encrypted photo files | [Own system / processor] |
| Push services: Apple, Google, Mozilla, Microsoft | An empty message per reminder, sent to the device's endpoint; they see the endpoint, the sending server and the timing | Independent controllers of their own push network; receive no diary content |
| Domain / certificate / DNS provider: [e.g. DuckDNS, Let's Encrypt] | The host name; not user data | Infrastructure |
| Reverse proxy: [e.g. Caddy on the same machine, access log off] | Traffic in transit | Operator's own system |

No analytics, advertising, error-reporting or other third parties are used.

## 4. Transfers outside the EU/EEA

[NONE: everything is hosted in [COUNTRY].] Push services are run by companies in the US but receive no personal content;
see [`international-transfers.md`](international-transfers.md).

## 5. Retention

| Data | Retention |
| --- | --- |
| Diary entries, photos, account data, consent record | Until the user deletes them or the account (then erased from the live system at once) |
| Security events, including IP addresses | `IP_RETENTION_DAYS` (default 7); with `0` the IP is not stored, and the event is still deleted after 7 days. Events of a deleted user are deleted with the account |
| Sessions | Sliding 30 days without use; removed on sign-out or account deletion |
| Push subscriptions | Until the user switches reminders off, signs out, the push service reports the endpoint gone, or the account is deleted |
| Admin audit log | Kept after account deletion (accountability); holds ids, no names or content. [Set your own limit, e.g. 12 months] |
| Backups | [BACKUP RETENTION, e.g. app dumps: newest 3 on the server; NAS copies 14 days]. Deleted accounts remain, encrypted, until rotation |

## 6. Security measures (Art. 32)

Summary; details are in [`../THREAT_MODEL.md`](../THREAT_MODEL.md) and [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

- End-to-end encryption on the device (XChaCha20-Poly1305, Argon2id key derivation); the server never receives the passphrase
  or any key that can open content; the operator cannot reset a passphrase.
- TLS only, HSTS, strict content security policy, session cookie HttpOnly/Secure/SameSite=Strict, request origin checks.
- Rate limiting and lock-outs on sign-in; optional two-step sign-in (TOTP); invite-only sign-up.
- No request bodies and no IP addresses in server logs; the proxy access log is off.
- Images run as non-root with a read-only root filesystem, built by CI and pinned by version.
- Deleting an account removes its rows, wraps and photo files (`secure_delete` on, WAL checkpoint).
- Access limited to [WHO has admin or shell access].

## 7. Example (household case, made-up)

> Controller: the Example family (no DPO). Hosting: Raspberry Pi in Aarhus, Denmark, behind a family VPN. Backups: nightly
> dump at 23:30 on the Pi (newest 3 kept), copied at midnight to a NAS in the same house (14 days). Recipients: push services
> only if a family member switches reminders on. Transfers: none. Review date: [DATE].

## 8. Review log

| Date | Change | By |
| --- | --- | --- |
| [DATE] | First version | [NAME] |
