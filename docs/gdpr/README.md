# GDPR templates

**How to use this folder.** These are templates for the person who runs a MyDaybook server. Copy them, replace every
`[PLACEHOLDER]`, delete the example boxes that do not apply, and keep your filled-in copies outside this repository (they
describe your own household or organisation). They are templates, **not legal advice**; if you are unsure, ask a lawyer or your
national data protection authority.

## Do you need these?

| Situation | What it means | What to do |
| --- | --- | --- |
| **A family on its own server**, used only by relatives and friends for personal records (for example one home Raspberry Pi behind a VPN) | The "household exemption" (Art. 2(2)(c)) can apply: purely personal or household activity is outside the GDPR. It is not guaranteed, and it does not cover everyone who hosts for others. | Nothing is required. The privacy notice and the breach checklist are still good practice, and they make the app's promises visible to the people you invite. |
| **An operator who is a controller**: you host for people outside your household, for a club, a clinic, a company or the public | You decide why and how the data is processed, so you are a controller. Diary content is Art. 9 health data, which raises the bar. | Use all of the documents. Publish the privacy notice, keep the record of processing (Art. 30), run the DPIA (Art. 35) before going live, and keep the breach checklist at hand. |

The software is built so that an operator can comply (privacy by design, Art. 25; security, Art. 32): the server stores
ciphertext only, the data subject's rights are buttons in the app, and nothing is sent to third parties except empty reminder
pushes. The operator still owns the legal side: the notice, the records and the hosting choices.

## Files

| File | Purpose | GDPR |
| --- | --- | --- |
| [`privacy-notice.md`](privacy-notice.md) | What you tell the people who use your server | Art. 12-14 |
| [`record-of-processing.md`](record-of-processing.md) | Your internal register of what is processed and why | Art. 30 |
| [`dpia.md`](dpia.md) | Risk assessment for health data | Art. 35 |
| [`breach-response.md`](breach-response.md) | What to do when something goes wrong | Art. 33, 34 |
| [`international-transfers.md`](international-transfers.md) | Hosting or backups outside the EU/EEA | Chapter V |

**Suggested reading order:** this file, then `privacy-notice.md`, `dpia.md`, `record-of-processing.md`,
`international-transfers.md`, and `breach-response.md` last (print it and keep it where you can find it in a bad hour).

## Filling in the placeholders

Placeholders are written in capitals and square brackets. The usual ones:

| Placeholder | Example (made-up) |
| --- | --- |
| `[OPERATOR NAME]` | `The Example family` or `Example Health Club ApS` |
| `[CONTACT EMAIL]` | `privacy@example.org` |
| `[COUNTRY]` | `Denmark` |
| `[SUPERVISORY AUTHORITY]` | `Datatilsynet (Danish Data Protection Agency)` |
| `[APP ADDRESS]` | `https://diary.example.org` |
| `[BACKUP RETENTION]` | `14 days` |

Check these against your own `.env` and backup set-up before you publish: `IP_RETENTION_DAYS` (default 7, `0` = IP addresses are
not stored), `BACKUP_KEEP` and your NAS or cloud retention. The notice must match what your server really does.

## Related documents

[`../THREAT_MODEL.md`](../THREAT_MODEL.md) (what a compromised server can learn), [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
(data model, key hierarchy, account deletion), [`../HOME_DEPLOYMENT.md`](../HOME_DEPLOYMENT.md) (an example set-up),
[`../SPEC.md`](../SPEC.md) section 2.

## Not covered in this version

Dependent profiles for children under the age threshold and the hand-over flow are parked until after v1.0. The notice
therefore says the service is for people aged 13 and over. If you are in a country with a different age of digital consent,
adjust that line (see the notice).
