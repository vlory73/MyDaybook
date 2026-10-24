# Data protection impact assessment (Art. 35, template)

**How to use this template.** Health data is special-category data, so an operator who is a controller should complete this
before inviting anyone outside their household. Fill in the bracketed parts, rate each risk for your own set-up, and sign it
off. Revisit it when hosting, backups or the app's features change. It is a template, **not legal advice**; a family covered by
the household exemption can use it as a thinking aid.

## 1. Description of the processing

- **What:** a private diary (food, well-being, sleep, measurements, pain, medicines, notes, photos) in an installable web app.
- **Who:** invited people aged 13 and over; [NUMBER] users; operator: [OPERATOR NAME].
- **How:** entries are encrypted on the device with keys derived from the user's passphrase; the server stores ciphertext,
  wrapped keys, account data and short-lived security records (see [`record-of-processing.md`](record-of-processing.md)).
- **Where:** [HOSTING], backups at [BACKUP LOCATION]. Optional reminders use push services (empty messages).
- **Not a medical device:** no advice, diagnosis, dose calculation or threshold alerts.

## 2. Necessity and proportionality

| Question | Answer |
| --- | --- |
| Is the purpose clear and limited? | Yes: personal record keeping for the user. No profiling, no analytics, no sharing in this version. |
| Is there a legal basis? | Explicit, versioned consent at sign-up, stored with timestamp and text hash; withdrawal = account deletion. |
| Is data minimised? | The server never sees content. Its metadata is limited to what the service needs (see THREAT_MODEL 3.1). Reminders upload times only, not medicine names. IP addresses are kept `IP_RETENTION_DAYS` (default 7) days or not at all. |
| Are rights supported? | Export (JSON + CSV + photos, on the device), edit any entry, delete account, privacy notice. |
| Are processors controlled? | [List hosting / backup providers and their contracts, or "none: own hardware"]. |
| Are transfers controlled? | See [`international-transfers.md`](international-transfers.md). |

## 3. Risks to people, and measures

Likelihood and severity: low / medium / high, for the **data subject** (not for the operator). Ratings below are examples for
a small family server; change them for yours.

| # | Risk | Likelihood | Severity | Measures | Residual |
| --- | --- | --- | --- | --- | --- |
| R1 | **Database or backup stolen** | Low | High | Content is encrypted; only an offline guess of each passphrase (Argon2id, 64 MiB per guess) remains possible; strong-passphrase guidance; backups hold ciphertext only; access to the host and NAS is restricted | Low, if passphrases are strong; weak passphrases remain guessable |
| R2 | **Curious or rogue operator/admin** | Low | High | The operator has no tool and no key to read content; admin actions are logged; cannot reset passphrases | Low. The operator can still see metadata (R5) |
| R3 | **Malicious code served to users** (a compromised server, build or dependency can capture a passphrase the next time someone unlocks; this is the honest limit of any browser-based E2EE, THREAT_MODEL 3.3) | Low | High | Pull-based deploys of CI-built images pinned by version; non-root, read-only container; two-factor on the code host account; dependency audit and licence checks in CI; users must trust the operator to run unmodified images | **Medium**: cannot be removed by design; stated in the privacy notice |
| R4 | **Lost passphrase and recovery key** | Medium | High (permanent loss of the diary) | Recovery key shown once and confirmed at sign-up; clear warnings; export available at any time | Accepted: loss is by design. Users are told |
| R5 | **Metadata**: the server sees that, when and how much someone logs; sizes are rounded up; record types are indistinguishable | Medium | Low-medium | Padding buckets; type not visible; no event times (they are inside the ciphertext); IP retention short | Low-medium |
| R6 | **Push metadata**: push services learn the device endpoint and timing of reminders; the server stores reminder times and time zone | Medium (if reminders are on) | Low | Opt-in per device; empty payload; fixed neutral text created on the device; no link to a medicine; endpoints limited to known push hosts | Low |
| R7 | **Backups outlive deletion** | High (by design) | Low-medium | Backups are encrypted and, after account deletion, their keys exist only in the same backup; fixed short retention [BACKUP RETENTION]; stated in the notice | Low |
| R8 | **Shared or stolen phone** | Medium | Medium | Auto-lock; locked app needs the passphrase; local cache holds ciphertext and wrapped keys only; device passcode (user's duty) | Low-medium. A phone that is unlocked with the app open is out of scope |
| R9 | **Exported file (JSON/CSV/photos) is plain text** | Medium | Medium | Export only on request, on the device, with a warning that the file is not encrypted | Medium: depends on how the user stores it |
| R10 | **Account takeover** (guessing, stolen session) | Low | High | Rate limits and lock-outs; optional TOTP; session cookie flags; revocable sessions | Low |
| R11 | **Rollback or deletion of records by the server** | Low | Medium | Ciphertext is bound to user and record, so swaps are detected; rollback and deletion are not detectable (known limit, THREAT_MODEL T4) | Low-medium |
| R12 | **Misuse as a medical device** (a user relies on it for decisions) | Low | Medium | No advice or alerts; "not a medical device" statement in the app and the notice | Low |
| R13 | **Weak operator practice** (no updates, open ports, logs with IPs on the proxy) | Medium | Medium | Self-hosting guide; proxy access log off; update routine [DESCRIBE]; this DPIA reviewed [EVERY 12 MONTHS] | Depends on the operator |

## 4. Consultation

- Data subjects or their representatives asked: [YES/NO, how, summary].
- DPO advice: [N/A or summary].
- Prior consultation of the authority (Art. 36) is needed if a high residual risk remains that you cannot reduce: [NOT NEEDED /
  NEEDED]. With the measures above, R3 is the one to think about.

## 5. Conclusion

[Example, made-up household case: "Family server on a home Raspberry Pi behind a VPN, four adult relatives. The main residual
risk is R3, accepted because the operator is also a user and keeps the host and code account secured. Risks R1, R2, R4-R13 are low
or accepted. No prior consultation needed."]

## 6. Sign-off and review

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Controller / operator | [NAME] | Approved / needs changes | [DATE] |
| DPO or adviser (if any) | [NAME] | [OPINION] | [DATE] |
| Next review due | | | [DATE] |
