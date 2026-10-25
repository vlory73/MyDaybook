# Personal data breach response (Art. 33/34, template)

**How to use this template.** Fill in the contacts now, while nothing is wrong, and keep a copy where you can reach it without
the server. If something happens, work through the checklist from the top and write down what you do and when. It is a
template, **not legal advice**. A family under the household exemption has no duty to notify, but the same steps still help.

## 0. Contacts (fill in)

| Role | Name | Phone / email |
| --- | --- | --- |
| Operator / incident lead | [NAME] | [CONTACT] |
| Backup person | [NAME] | [CONTACT] |
| Hosting provider (if any) | [NAME] | [CONTACT] |
| Supervisory authority | [SUPERVISORY AUTHORITY, e.g. Datatilsynet] | [BREACH REPORT URL / PHONE] |

## 1. What counts

A breach is any loss, theft, alteration or unauthorised access or disclosure of personal data, by accident or on purpose:
a stolen database or backup, a hacked host, a malicious image, a leaked `.env`, a misdirected export, a lost unencrypted export file.

## 2. Checklist

**Clock starts when you become aware.** Note the time: [DATE/TIME].

### Detect

- [ ] Who noticed what, and how (alert, user report, odd log line)? Write it down.
- [ ] Check the server logs (they hold method, route, status and user ID; no bodies, no IPs), the `security_events` table
      (`login_failed`, `rate_limited`, `recovery_used`, `passphrase_changed`, `totp_*`) and the `admin_audit` log.

### Contain

- [ ] Take the app offline or block access at the proxy if an attacker may still be in.
- [ ] Rotate secrets with `gen-secrets` (writes new `SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` lines for `.env`; never
      paste them into chat or tickets):
  - `SESSION_SECRET` protects the stored two-step (TOTP) secrets and the fake sign-in answers for unknown usernames. Changing it
    makes stored TOTP secrets unreadable: people with two-step sign-in on must use their recovery key (which switches it off) and
    set it up again.
  - New VAPID keys mean existing reminder subscriptions no longer match: people switch reminders off and on again.
- [ ] Force sign-out: disabling an account ends all its sessions (Admin, then enable again); to end every session at once, delete
      the rows of the `sessions` table with the database tool. Changing a passphrase signs out all other sessions.
- [ ] Check the image: compare the running image tag and digest with the release you intended (`docker compose images`, the
      release page). If unsure, pull the known release again and recreate the container.
- [ ] Rotate access outside the app: SSH keys, GitHub/registry tokens, DNS and proxy credentials, NAS passwords.
- [ ] Preserve evidence (copy logs, note the image digest) before you wipe or restore.
- [ ] If data was altered or deleted, restore from the newest good backup (`docs/HOME_DEPLOYMENT.md` has the restore steps); users get
      back the data as of the dump date.

### Assess (what could leak, given end-to-end encryption)

| Asset | Exposed to a database/backup thief | Note |
| --- | --- | --- |
| Diary entries and photos | Ciphertext only | Not readable without a user's passphrase or recovery key. Strong passphrases make offline guessing impractical |
| Usernames, roles, creation dates | Yes | Personal data |
| Sizes (rounded) and upload/update/delete times of records | Yes | Metadata |
| Wrapped keys and key-derivation salt | Yes | Allow an offline guess per passphrase (one slow hash each) |
| Sign-in verifiers | Yes | SHA-256 of a derived key; they let an attacker test guesses but do not reveal the passphrase |
| TOTP secrets | Encrypted with a key derived from `SESSION_SECRET`; readable if `.env` leaked as well | |
| Session tokens | Stored as hashes only | A copy of the database does not let an attacker sign in |
| IP addresses | Up to `IP_RETENTION_DAYS` of security events | |
| Reminder times, time zone, push endpoints | Yes | Endpoints let someone send empty pushes only to those hosts' devices; they carry no content |
| **Everything, if malicious code reached users** | Passphrases typed while it ran | Treat as a full compromise of those users: see below |

Decide: was personal data affected? How many people? What kind? Is it **likely to result in a risk** to them? Is it **likely to
result in a high risk**? A stolen ciphertext-only backup with strong passphrases is usually a low risk; leaked passphrases or an
unencrypted export are high.

### Notify the authority (Art. 33)

- [ ] If there is a risk to people: notify [SUPERVISORY AUTHORITY] **within 72 hours of becoming aware**, even if some facts are
      still unknown (add them later). If you are late, give the reason.
- [ ] Say: what happened, categories and approximate number of people and records, likely consequences, contact point, what you
      have done and will do.
- [ ] If no notification is needed, write down why.

### Tell the people affected (Art. 34)

- [ ] If the risk is **high**, tell them without undue delay, in plain language: what happened, what it means for them, what you
      did, what they should do (for example "change your passphrase, set up your recovery key again, treat your old passphrase
      as exposed if you reused it elsewhere"), and who to contact.
- [ ] Not needed if the data was effectively unreadable to the attacker (strong encryption, keys not exposed) or you have since
      made a high risk unlikely.
- [ ] After malicious code or a leaked passphrase: every affected user changes their passphrase and recovery key. Warn them that
      anything the attacker already decrypted cannot be taken back.

### Recover and learn

- [ ] Fix the root cause, upgrade, re-check against [`../THREAT_MODEL.md`](../THREAT_MODEL.md), update the DPIA.
- [ ] Hold a short review: what worked, what to change.

## 3. Breach register (Art. 33(5): keep every breach, even if not reported)

| Date aware | Description | People / records | Effects | Actions taken | Authority told (date)? | Users told (date)? | Closed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [DATE] | [SHORT TEXT] | [N] | [TEXT] | [TEXT] | [YES/NO] | [YES/NO] | [DATE] |

## 4. Example (household case, made-up)

> A family member's phone with the app installed is lost. The app was locked and the local cache holds only ciphertext, so no
> notification is needed. Actions: sign that person out from another device (disable and re-enable the account), log it in the
> register as "no risk to rights and freedoms", and remind everyone to use a device passcode.
