# Self-hosting MyDaybook

How to run MyDaybook for your own household on a small machine at home. Plain steps, copy-paste blocks.
The owner's own Raspberry Pi setup is in [HOME_DEPLOYMENT.md](HOME_DEPLOYMENT.md). Releasing is in [RELEASING.md](RELEASING.md).

Examples use the address `diary.example.org` and version `0.10.0`. Replace them with yours.
The commands are for Linux. Images for `arm64` (Raspberry Pi) and `amd64` (normal PCs) are published.

**Note on staging.** The original spec mentions a staging copy and a registry token for Portainer. Neither is provided (owner
decision, 2026-10-24): there is no staging compose file. If you want to test a version first, use a spare folder and port.

## 1. What you need

- A small Linux machine that stays on: a Raspberry Pi 4 (about 100 MB of RAM is used) or any PC or NAS that runs Docker.
- Docker and the Docker Compose plugin (`docker compose version` should work).
- **HTTPS in front of the app. This is required.** Phones only install the app, keep its offline files, use encryption and
  receive reminders on a secure (HTTPS) address. The app itself speaks plain HTTP on `127.0.0.1:8090`, and only that machine can reach it.
- A name for the app, for example `diary.example.org`, with a real certificate. Two common ways:
  - A **reverse proxy** (a program that takes the HTTPS traffic and passes it on), for example [Caddy](https://caddyserver.com),
    which gets free certificates by itself.
  - **Tailscale HTTPS** (`tailscale serve`), if everyone is on your Tailscale network.
- Best: keep the app reachable only from your home network or over a VPN. It is built for a few people you know.

### What the proxy must do

| Setting | Why |
| --- | --- |
| Forward to `127.0.0.1:8090` | That is where the app listens. |
| Send `X-Forwarded-For` and `X-Forwarded-Proto` | The app needs the real address of a visitor and to know it was HTTPS. Caddy does this by default. |
| Allow request bodies of at least 15 MB | Photos are uploaded encrypted. |
| Turn the proxy's access log off for this site | The app deletes IP addresses after `IP_RETENTION_DAYS` days. A proxy log would keep them longer. |

A minimal Caddy site (Caddy writes no access log unless you ask for one):

```text
diary.example.org {
	request_body {
		max_size 15MB
	}
	reverse_proxy 127.0.0.1:8090
}
```

Then set `TRUSTED_PROXY` (step 2.4) to the address the app sees the proxy connecting from. Only that address is believed when it
sends `X-Forwarded-For`.

## 2. First install

### 2.1 Folders

```sh
mkdir -p ~/mydaybook/data ~/mydaybook/backup && cd ~/mydaybook
sudo chown 1000:1000 data backup
```

The app runs as user number 1000 inside the container. For another user, set `PUID` and `PGID` in `.env` and chown to match.

```text
~/mydaybook/
  compose.yaml   how to run the app
  .env           your settings and secrets (keep private)
  data/          the database (app.db), encrypted photos (blobs/), pre-upgrade copies (backups/)
  backup/        nightly copies: db/ and blobs/
```

### 2.2 Get the two files

Download `compose.yaml` and `.env.example` from the release you want. The tag is the version with a `v` in front:

```sh
V=0.10.0
curl -fsSLO https://raw.githubusercontent.com/vlory73/MyDaybook/v$V/compose.yaml
curl -fsSL https://raw.githubusercontent.com/vlory73/MyDaybook/v$V/.env.example -o .env
grep image: compose.yaml     # shows the pinned version
```

`compose.yaml` names the image, for example `ghcr.io/vlory73/mydaybook:0.10.0`. Always keep an **exact version** there, never
`latest`, so an upgrade only happens when you change it. The image is public, so no registry login is needed.
(A private fork of the image would need a read-only GitHub token as a registry login: `docker login ghcr.io`.)

### 2.3 Secrets

Three secrets are made by the app itself. They go straight into `.env` and are not printed:

```sh
docker run --rm ghcr.io/vlory73/mydaybook:$V gen-secrets >> .env
chmod 600 .env
```

They are `SESSION_SECRET` (signs sessions, seals two-step sign-in secrets) and a key pair for reminders (`VAPID_*`).
Run this **once**. Keep a copy of `.env` somewhere safe. Losing `SESSION_SECRET` logs everyone out and removes two-step
sign-in and reminder set-ups, but never loses diary data. From the hardening release on, the server refuses to start without it.

### 2.4 Edit `.env`

Open it with `nano .env` and set at least:

| Setting | Set it to |
| --- | --- |
| `PUBLIC_URL` | The exact address people open, e.g. `https://diary.example.org`. Do not change it later (section 7). |
| `TRUSTED_PROXY` | The proxy's address as the app sees it. With the supplied `compose.yaml` and a proxy on the same machine it is `172.30.90.1` (leave as is). |
| `VAPID_SUBJECT` | Your contact for the phone makers' push services: `mailto:you@example.org`. Needed for reminders. |
| `TZ` | Your time zone, e.g. `Europe/Copenhagen`. The backup time uses it. |
| `BACKUP_RETENTION_DAYS` | How many days your off-machine copy keeps backups (section 6). Default 14. |
| `OPERATOR_NAME`, `OPERATOR_CONTACT` | Optional. Who runs this server and how to reach them. Shown on the Privacy page. |

### 2.5 Start and check

```sh
docker compose up -d
curl -s http://127.0.0.1:8090/healthz       # {"status":"ok"}
docker compose logs --tail 20 app
```

Open your address on a phone, then check the proxy setting. The log has one `first_peer` line, and it should say `"trusted":true`:

```sh
docker compose logs app | grep first_peer
```

### 2.6 First admin

Run this in your own terminal. The link works once, so treat it like a password:

```sh
docker compose exec app cli invite --admin
```

It prints `https://diary.example.org/join#t=...` and when it expires (72 hours; add `--hours 24` to change that). Open it on your
phone and create the account. Pick a passphrase you will not forget: **nobody can reset it for you**. Save the recovery key you
are shown. Invite the family from the admin screen on Me. Then use Share, Add to Home Screen to install the app.

## 3. Portainer (optional)

Portainer is a web page for managing Docker. The command line above is the main way. If you prefer Portainer:

1. Stacks, Add stack, Web editor: paste the contents of `compose.yaml`. Create the `data` and `backup` folders on the host first
   (section 2.1) and use their full paths in the `volumes:` lines.
2. Under Environment variables, use Advanced mode and paste the contents of your `.env`.
3. Deploy the stack. To update, change the version in the image line and press Update the stack (tick "Re-pull image").

The image is public, so no registry has to be added.

## 4. Updating

Read the release notes first. Take a backup, change the version, restart:

```sh
cd ~/mydaybook
docker compose exec app cli backup
V=0.11.0
sed -i -E "s|(ghcr\.io/vlory73/mydaybook:)[0-9]+\.[0-9]+\.[0-9]+|\1$V|" compose.yaml
grep image: compose.yaml        # must show the new version
docker compose pull && docker compose up -d
curl -s http://127.0.0.1:8090/healthz
```

`sed` says nothing even when it changed nothing, so look at the `grep` line. When the release notes say `compose.yaml` or
`.env.example` changed, compare them with the new release.

- **Before changing the database, the app copies it** to `data/backups/pre-migrate-<time>-<from>-<to>.db` (the last 5 are kept).
  If that copy fails, the app stops and does not touch the database.
- Check: open Me, About, and read the version. `docker compose logs --tail 50 app | grep -E 'migrat|error'` shows what happened.

**One-time note for the hardening release.** From that release on, the app writes data and backup files readable by its own user
only. Make the existing files match once, as the user who owns them (normally with `sudo`):

```sh
cd ~/mydaybook && docker compose down
sudo chmod -R go-rwx data backup
docker compose up -d
```

If a job copies the `backup` folder (to a NAS, for example), it must run as the same user (number 1000) or as root, or it can no
longer read the files.

## 5. Rolling back

If the new version misbehaves, put the old version back (section 4 with the old `V=`) and run `docker compose up -d`.
That is enough when the new version did not change the database. If it **did** migrate, the old version may refuse to start.
Then restore the copy made just before the upgrade, with the app stopped:

```sh
cd ~/mydaybook
docker compose down
ls -1 data/backups/        # pre-migrate-2026-10-24T201500Z-12-13.db  (time, from, to)
sudo mv data/app.db data/app.db.broken
sudo rm -f data/app.db-wal data/app.db-shm
sudo cp data/backups/pre-migrate-<newest before the upgrade>.db data/app.db
sudo chown 1000:1000 data/app.db
# set the old version in compose.yaml, then:
docker compose up -d
curl -s http://127.0.0.1:8090/healthz
```

The `-wal` and `-shm` files belong to the broken database, so they must go. Photos are not changed by an upgrade.
Anything written after the upgrade is lost, and **everyone's passphrase is as it was on the copy's date**.

## 6. Backups

Three layers:

1. **Before an upgrade that changes the database:** `data/backups/` (section 4).
2. **Nightly inside the app** at `BACKUP_TIME` (default 23:30, `TZ` time), into `backup/`:
   - `backup/db/app-YYYY-MM-DDTHHMMSSZ.sqlite`: a checked copy of the database. The newest `BACKUP_KEEP` (default 3) stay.
   - `backup/blobs/`: a mirror of the encrypted photos.
3. **Off the machine.** If the machine dies, the nightly copies die with it. Copy `backup/` every night to another disk or a
   NAS, at least 30 minutes after `BACKUP_TIME`, for example `rsync -a ~/mydaybook/backup/ /mnt/nas/mydaybook/`.
   Keep the copies for **`BACKUP_RETENTION_DAYS` days** (default 14), no more and no less. The sign-up text and the Privacy page
   promise that number. If you keep them longer or shorter, change the setting so the text stays true. The date in each
   file name tells you which dump is old.

Backups are still encrypted. Whoever runs the server cannot read the diaries from them either.

A backup right now (safe while the app runs; it prints the file name):

```sh
docker compose exec app cli backup
```

**Deleted accounts.** When someone deletes their account, it is gone from the live data at once. It stays, still encrypted, in
backups until they are rotated out (up to `BACKUP_RETENTION_DAYS` days). The privacy notice says so.

### Restoring from a nightly backup

```sh
cd ~/mydaybook
docker compose down
sudo mv data/app.db data/app.db.old
sudo rm -f data/app.db-wal data/app.db-shm
sudo cp backup/db/app-<timestamp>.sqlite data/app.db
sudo rsync -a --delete backup/blobs/ data/blobs/
sudo chown -R 1000:1000 data
docker compose up -d
curl -s http://127.0.0.1:8090/healthz
```

If the dump was made by a newer version than the one in `compose.yaml`, first set the version that made it. Take the files from
your off-machine copy if the local ones are gone. People get their passphrase as of the dump date. Restores are manual on purpose.
Try one once before you need it.

## 7. Moving to another machine

Keep the **same address** (`PUBLIC_URL`). A phone treats a new address as a new app: everyone would have to install it again,
sign in and switch reminders on again.

1. On the old machine: `docker compose down`.
2. Copy the whole `~/mydaybook` folder (`data`, `backup`, `compose.yaml`, `.env`) to the new machine, keeping permissions
   (`sudo rsync -a`), then `sudo chown -R 1000:1000 data backup` there.
3. Point the name `diary.example.org` and the proxy at the new machine. Update `TRUSTED_PROXY` if the proxy address changed.
4. `docker compose up -d`, check `/healthz`, open the app, sign in, add one entry.

## 8. Settings reference

All go in `.env`. Restart with `docker compose up -d` after a change.

| Setting | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_URL` | `.env.example`: `https://myday.lory-home.duckdns.org` | Address people open, with `https://`. Change it. Do not set `ORIGIN`. |
| `TRUSTED_PROXY` | `172.30.90.1` | Address(es) the proxy connects from, comma-separated. Only these are believed on `X-Forwarded-For`. |
| `TZ` | `Europe/Copenhagen` | Time zone for the backup time. Reminders use each phone's own zone. |
| `IP_RETENTION_DAYS` | `7` | Days IP addresses stay in security events. |
| `BACKUP_RETENTION_DAYS` | `14` | Days your off-machine copy keeps backups; shown to people in the app (whole days, 2 or more). |
| `OPERATOR_NAME` | empty | Optional: who runs the server, shown on the Privacy page. |
| `OPERATOR_CONTACT` | empty | Optional: an email address or `https://` link. Both empty hides the section. |
| `BACKUP_TIME` | `23:30` | Nightly backup, `HH:MM` in `TZ`. `off` turns it off. |
| `BACKUP_KEEP` | `3` | How many nightly database dumps stay in `backup/db`. |
| `HSTS_MAX_AGE` | `86400` | Seconds browsers remember "HTTPS only". Raise to `31536000` after a few weeks. |
| `COOKIE_SECURE` | `true` | Keep `true`. Only `false` for a local test without HTTPS. |
| `ACCESS_LOG` | `off` | The app's own request log (never IP addresses). |
| `SESSION_SECRET` | from `gen-secrets` | Signs sessions. Required. Do not change it casually. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from `gen-secrets` | Keys for reminders. |
| `VAPID_SUBJECT` | `mailto:owner@example.org` | Contact for the push services. Without it and the two keys, reminders are off. |
| `PUID`, `PGID` | `1000` | User and group the container runs as (read by `compose.yaml`, not in `.env.example`). |

## 9. Privacy duties

If the server is only for your family and friends, the GDPR "household exemption" can apply. If you host for others, you are an
operator with duties. [docs/gdpr/README.md](gdpr/README.md) explains the difference and has templates (privacy notice, record of
processing, risk assessment, breach checklist). They are not legal advice.

The sign-up screen says the app is for people aged 13 and over, and new accounts must confirm it. Do not invite younger children.
Profiles for dependents are not available yet.

## 10. Troubleshooting

| What you see | Cause and fix |
| --- | --- |
| The app will not install, or reminders and sign-in fail | No HTTPS, or an address other than `PUBLIC_URL`. Open the exact `PUBLIC_URL` over HTTPS. |
| Sign-in is refused with a 403 error | `PUBLIC_URL` does not match the address in the browser. |
| The log shows `first_peer` with `"trusted":false` | `TRUSTED_PROXY` is not the proxy's address. Use the `peer` value from that line. |
| The container stops at once and the log mentions `SESSION_SECRET` | The secret is missing. Run the `gen-secrets` step (2.3). Hardening release and later. |
| "Pre-migration backup failed, refusing to migrate" | `data` is full or not writable by user 1000. Fix it and start again. Nothing was changed. |
| Docker warns that the memory limit is not supported | Some Raspberry Pi kernels lack memory control. Harmless: the limit is ignored. |
| No reminders on an iPhone | They need the app on the Home Screen and iOS 16.4 or newer. Switch them on under Me. |
| No reminders at all | Check `VAPID_SUBJECT` and both keys are set, and the machine can reach the push services of Apple, Google, Mozilla and Microsoft. Messages are empty: nothing about the diary is sent. |
| Photo upload fails | The proxy blocks big bodies. Allow 15 MB. |

More help: `docker compose logs --tail 100 app`. The logs never contain diary content.
