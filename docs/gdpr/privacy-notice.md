# Privacy notice (template)

**How to use this template.** Replace the `[PLACEHOLDERS]`, check each statement against your own server settings (the
ones that depend on settings are marked), then publish the result where people can read it before they sign up, for example
on a page next to the app or in the invitation. It is a template, **not legal advice**. Delete this paragraph and the
"Example" box when you publish.

---

## Privacy notice for [APP NAME, e.g. MyDaybook] at [APP ADDRESS]

_Version [VERSION], valid from [DATE]._

### Who is responsible

[OPERATOR NAME] runs this service and decides how your data is handled (the "controller").
Contact: [CONTACT EMAIL], [POSTAL ADDRESS OR "by email only"].

### Who can use it

The service is for people aged **13 and over**. This is the default age of consent for online services in Denmark; other
countries set a different age by law, so adjust this line to [AGE, e.g. 13] for [COUNTRY]. Profiles for younger children are
not part of this version. You can only join with an invitation from the operator.

### What it is, and what it is not

A private diary for food, well-being, sleep, measurements, pain and medicines. It is personal record keeping. It is **not a
medical device**: it gives no advice, no diagnosis, no dose calculations and no alerts based on your values.

### What we store

| What | Details | Can we read it? |
| --- | --- | --- |
| **Your diary entries and photos** | Stored only as encrypted data. They are encrypted on your device before they are sent. | **No.** We see scrambled data, its rounded-up size and when it was uploaded. |
| **Account data** | Username, when you joined, role (member or admin), whether two-step sign-in is on, how much storage you use, and the day of your latest activity (shown to admins). | Yes |
| **Your agreement** | The consent version, a fingerprint (hash) of the exact text you saw, the language and the time you agreed. | Yes |
| **Security records** | Events such as sign-up, failed sign-ins, recovery key use, passphrase or two-step changes, with the time and your **IP address**. IP addresses are kept for **[IP_RETENTION_DAYS, default 7] days**, then the whole record is deleted. (If the operator sets this to 0, no IP address is stored at all.) | Yes |
| **Reminders (only if you switch them on)** | A push address for your device (issued by Apple, Google, Mozilla or Microsoft), the reminder **times and weekdays**, and your time zone. Not which medicine a reminder is for. | Yes |
| **Sign-in session** | A random session token (stored only as a hash) with its creation and last-used time. | Yes |
| **Admin log** | When an admin invites, disables, enables or deletes an account: who, which account and when. It is kept after an account is deleted. | Yes |

Your passphrase and recovery key never leave your device. We cannot reset them.

### Why, and on what legal basis

Diary content can reveal your health, which the GDPR calls special-category data (Art. 9). We process it only because you give
**explicit consent** when you join (Art. 9(2)(a) and Art. 6(1)(a)). [OPERATOR: state the basis you rely on for security records,
for example legitimate interest in keeping the service safe, Art. 6(1)(f).]

### Who receives data

- **Nobody else** receives your diary. There are no analytics, no trackers, no advertising, no fonts or scripts from other
  sites, and no third-party calls while you use the app.
- **Push services.** If you switch on reminders, our server sends an empty "wake-up" message to the push service of your
  phone maker (Apple, Google, Mozilla or Microsoft). It contains no text and no health information, but the push service
  learns that a message was sent to your device at that time. The words you see ("You have a reminder.") come from your phone.
- **Hosting and backups:** [WHERE, e.g. "a Raspberry Pi in the operator's home in Denmark; encrypted copies on a home NAS"].
  See "Transfers" below.

### Cookies and storage on your device

One cookie is used, only to keep you signed in (strictly necessary; it expires after 30 days without use). The app also keeps
a copy of your encrypted data and your settings (theme, language) in your browser's own storage. There are no tracking cookies.

### How long we keep it

- Diary entries, photos and account data: until you delete them or your account.
- Security records: [IP_RETENTION_DAYS] days. Sessions: until you sign out, or 30 days without use.
- **Backups:** the server makes nightly backups that contain the same encrypted data. If you delete your account, your data is
  removed from the live server at once, but it **stays in older backups until they are replaced, at most [BACKUP RETENTION, e.g.
  14 days]**. It is still encrypted, and only your passphrase or recovery key could open it.

### Your rights

| Right | How |
| --- | --- |
| Access and portability (Art. 15, 20) | Me, "Your data": a .zip with JSON, CSV and your photos, created on your device. The file is **not encrypted**; keep it safe. |
| Correction (Art. 16) | Edit any entry. |
| Erasure (Art. 17) | Me, "Delete account". Your keys, entries, photos, sessions, reminders and security records are deleted from the server. Without the keys, any remaining copy cannot be read. |
| Withdraw consent (Art. 7(3)) | The same as deleting your account. Withdrawing does not affect what happened before. |
| Complain | To the supervisory authority: [SUPERVISORY AUTHORITY, e.g. Datatilsynet in Denmark]. You can also write to [CONTACT EMAIL] first. |

You may also ask us to restrict or object to processing (Art. 18, 21); write to [CONTACT EMAIL].

### Important: losing your keys

If you lose **both** your passphrase and your recovery key, your data **cannot be recovered**, by you or by anyone else. This is
by design.

### What the operator can and cannot do

The operator cannot read your diary and cannot reset your passphrase. The operator can see the account data and metadata above
(for example that you saved something at 08:05). As with every web app, the server delivers the program that runs on your
device, so you must **trust the operator to run the unmodified software**. [OPERATOR NAME] commits to [e.g. "run only released
images built from the project's repository"].

### Transfers

[Choose one:] All data stays in [COUNTRY / EU/EEA]. / Data is hosted in [COUNTRY], covered by [adequacy decision / standard
contractual clauses]. Push services are run by US companies and receive no diary content.

### Changes

If this notice changes in a way that matters, we will tell you in the app or by message. New members always agree to the newest version of the consent text; the version you agreed to stays on record and you can read it under Me, Privacy. [OPERATOR: if a change needs new consent, ask everyone again.]

---

### Example (household case, made-up)

> Controller: the Example family, privacy@example.org. Hosting: a Raspberry Pi at home in Denmark, reached through the
> family VPN. Encrypted nightly copies go to a NAS in the same house and are kept 14 days. Reminders are optional. IP
> addresses are kept 7 days. Age line: "for people aged 13 and over". Authority: Datatilsynet.
