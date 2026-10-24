# International transfers (Chapter V, template note)

**How to use this template.** Fill in the table of where your data really lives, then follow the rule for each row. Keep it with
your record of processing. It is a template, **not legal advice**; transfer rules are detailed and change, so check the current
list of adequacy decisions on the European Commission's website.

## The rule in short

Moving personal data to a country outside the EU/EEA (or letting someone there access it) needs a transfer tool under Chapter V
(Art. 44-49): an **adequacy decision** for that country, or **standard contractual clauses (SCCs)** with the recipient plus an
assessment of the local risks, or another tool listed in Art. 46-49. Storing data with a provider whose servers are in the EU/EEA
is not a transfer, but check whether the provider (or its parent) can be reached by non-EU authorities.

## Where does your data go?

| Item | Where | Inside EU/EEA? | Tool if outside |
| --- | --- | --- | --- |
| App server (database, encrypted photos) | [e.g. Raspberry Pi at home, Denmark] | [YES/NO] | [adequacy / SCCs / n/a] |
| Backups and NAS copies | [e.g. NAS at home] | [YES/NO] | |
| Any cloud backup or storage you add | [PROVIDER, REGION] | [YES/NO] | |
| Hosting provider or VPS (if not home) | [PROVIDER, REGION] | [YES/NO] | |
| DNS, certificates | [e.g. DuckDNS, Let's Encrypt] | n/a | Host names only; no user data |

If any row says "outside EU/EEA", name the tool, keep a copy of the contract, and state the transfer in the privacy notice and
the record of processing.

## What helps with end-to-end encryption

Diary content is encrypted on the user's device, and the provider never holds the keys. That reduces the risk of a transfer
a great deal, and you can mention it in your assessment. It does not make the transfer disappear: the provider still holds
metadata (usernames, timing, sizes, IP addresses), which is personal data.

## Push services

Reminders (optional) are delivered through the push services of the phone makers: Apple, Google, Mozilla and Microsoft. Several
are run by companies in the United States. The app sends them an **empty message** to a device address; no diary content,
medicine name or user name is included. They learn that a message was sent to a device, and when. List them as recipients in
the record of processing, and say so in the privacy notice. Users who do not switch reminders on are not affected.

## Example (household case, made-up)

> Pi and NAS are in the family's house in Denmark. No cloud, no VPS. Only recipients outside the EU/EEA are the push services,
> and only for people who switch reminders on. No other transfer tool is needed.

## If you add a non-EU cloud backup later

Update this note, the record of processing and the privacy notice **before** you switch it on, sign the provider's SCCs (or rely
on an adequacy decision), and keep the backup encrypted with a key the provider never holds.
