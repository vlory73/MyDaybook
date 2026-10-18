# Home deployment (owner's Raspberry Pi)

The owner's Pi is managed by a separate "Home Assistant session". This file records the integration
request we sent it, so both sides agree. The general guide for other self-hosters will be `docs/SELF_HOSTING.md` (M7).

Status: **planned and agreed** (see the bottom of this file). No image exists yet; the first deployable version is expected after M2 (auth, crypto, entries).

```text
APP INTEGRATION REQUEST
- App name / short id: MyDaybook (working title) / mydaybook
- What it does (one line): Private, end-to-end encrypted family diary (food, well-being, measurements, pain, medication) as an installable web app; the server only ever stores ciphertext.
- Repo (URL or "not yet"): https://github.com/vlory73/MyDaybook (public; no deployable image yet, first one expected after milestone M2)
- Image(s) and tag(s), ARM64 OK? (yes/no): ghcr.io/vlory73/mydaybook:<X.Y.Z>, always pinned (first will be 0.1.0); built by GitHub Actions and pulled by the Pi (outbound only, public package, no token). Multi-arch, ARM64 yes.
- Container port(s) on the Pi: 8090 (family). Later, optional: 8091 (staging copy with synthetic data, separate project "mydaybook-staging").
- Needs HTTPS via the HA proxy? (yes/no; wanted https port, e.g. 8444): yes, required (the app refuses to run without HTTPS: PWA install, service worker and push need it). https://lory-home.duckdns.org:8444 -> 192.168.10.52:8090. Later, for staging: 8445 -> 8091. Caddy should pass X-Forwarded-For/-Proto, allow request bodies up to 15 MB (encrypted photos), and keep its access log OFF for these sites (the app keeps IPs at most 7 days by design).
- Needs access from outside the home? (no / via VPN Plus is fine / needs Tailscale): via VPN Plus is fine. When Tailscale arrives, the SAME URL https://lory-home.duckdns.org:8444 must work over it (Pi as subnet router or equivalent); changing the URL forces everyone to reinstall the app.
- Users/login in the app? (none / own login / other): own login: invite-only accounts, passphrase + optional TOTP, end-to-end encryption; the admin cannot read anyone's data.
- Persistent data (volume names or folders): ~/mydaybook/data (SQLite database, encrypted photo files, automatic pre-migration backups) and ~/mydaybook/backup (nightly dumps). Bind mounts; container runs as uid:gid 1000:1000 (PUID/PGID in .env if different).
- Backup method (dump command + schedule, dump folder, how many kept) or volumes to export: The app does it itself every night at 04:00 (Pi local time): consistent SQLite online backup to ~/mydaybook/backup/db/app-<timestamp>.sqlite (newest 3 kept) plus a mirror of the encrypted photo store in ~/mydaybook/backup/blobs/. Please copy ~/mydaybook/backup/ to the NAS in the 04:30 job (14 days). Manual run: cd ~/mydaybook && docker compose exec app node scripts/cli.mjs backup 
- Restore procedure (short): 1) cd ~/mydaybook && docker compose down. 2) mv data/app.db data/app.db.old; rm -f data/app.db-wal data/app.db-shm. 3) cp backup/db/app-<timestamp>.sqlite data/app.db and rsync -a --delete backup/blobs/ data/blobs/ (take both from the NAS if the Pi copy is gone). 4) If the dump came from a NEWER app version than the running one, set the image tag in compose.yaml back to that version. 5) docker compose up -d, then check http://192.168.10.52:8090/healthz says ok. Note: users get back their passphrase as of the dump date.
- Secrets (names only, never values) and where they live on the Pi: SESSION_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY in ~/mydaybook/.env (mode 600, gitignored). Nobody types them: "docker run --rm ghcr.io/vlory73/mydaybook:<X.Y.Z> gen-secrets >> ~/mydaybook/.env" generates them without printing. Non-secret settings in the same file: PUBLIC_URL=https://lory-home.duckdns.org:8444, TRUSTED_PROXY=<Caddy's address as seen by the container>, TZ=Europe/Copenhagen, IP_RETENTION_DAYS=7, BACKUP_TIME=04:00, BACKUP_KEEP=3, HSTS_MAX_AGE=0 (see question 2).
- Expected RAM / CPU: ~70 MB idle, hard limit 256 MB (mem_limit), CPU near zero (encryption runs on the phones, not the Pi); short spike during the 04:00 backup. Staging, if added, the same again.
- Needs anything from Home Assistant or strøm? (APIs, entities, none): none. Outbound internet only for optional reminder pushes (Apple/Google push services, payload-free) and image pulls from ghcr.io.
- Open questions for the owner: 1) First admin account: after the first deploy, the owner runs "docker compose exec app node scripts/cli.mjs invite --admin" in their OWN terminal (not through the HA session), because the printed invite link is a one-time credential. The token is in the URL fragment (/join#t=...), so it never reaches server logs. 2) For the HA session: is every service reached via lory-home.duckdns.org HTTPS-only? If yes, the app may send a long HSTS header (HSTS_MAX_AGE=31536000); until confirmed it stays 0, because HSTS would force HTTPS on all ports of that name. 3) For the HA session: which address does the app see Caddy connecting from (for TRUSTED_PROXY)? 4) Staging copy on the Pi (port 8091/8445, ~70 MB more RAM): wanted, or test elsewhere?
```

## Agreed with the Home Assistant session (2026-10-18)

These override the request above where they differ.

1. **HTTPS:** Caddy serves `https://lory-home.duckdns.org:8444` and forwards to `127.0.0.1:8090`. Request bodies are allowed up to 15 MB.
   Caddy sends `X-Forwarded-For/-Proto/-Host` by default and writes no access log.
2. **Port:** publish `"127.0.0.1:8090:8090"` only. There is no plain HTTP on the LAN. Health checks use `http://127.0.0.1:8090/healthz` on the Pi.
3. **Network:** the Compose project gets a fixed subnet `172.30.90.0/24`, so `TRUSTED_PROXY=172.30.90.1` (the gateway Caddy's
   connections arrive from). The app logs the first proxy peer address it sees once at startup, so this can be verified.
4. **HSTS:** every service on that name is HTTPS-only. Ramp up: `HSTS_MAX_AGE=86400` for the first weeks, then `31536000`.
   **No `includeSubDomains` and no `preload`** (duckdns.org is a shared domain).
5. **Remote access:** VPN Plus now; later a Tailscale subnet router. The URL stays the same, so nobody reinstalls.
6. **Backups:** the 04:30 job copies `~/mydaybook/backup/` to the NAS. `db/` dumps are kept 14 days, using the date in the file
   name. `blobs/` is mirrored, and deleted or changed files are kept 14 days in a dated side folder. A dump that is missing or older
   than 26 h fails the run and alerts the owner. **The file name pattern `db/app-<timestamp>.sqlite`, with the timestamp containing
   `YYYY-MM-DD`, must stay stable.** We use `app-YYYY-MM-DDTHHMMSSZ.sqlite`.
7. **Staging:** not on the Pi for now; tested elsewhere. It may come later on 8091/8445.
8. **Deployment:** the HA session deploys from this repo at a release tag, using `compose.yaml` at the repo root. It must contain the
   127.0.0.1 port, the fixed network, `mem_limit`, the bind mounts and `env_file: .env`. Also ship `.env.example` with the
   non-secret settings, and the `gen-secrets` command in the README. Upgrades happen only on purpose, by changing the pinned tag.
9. **First admin invite:** the owner runs it in their own terminal.

**Backup time changed (owner request, 2026-10-18; to confirm with the Home Assistant session):** the NAS is switched off during
the night on a schedule, so nothing may touch it after **01:00**, and 04:00 / 04:30 no longer apply. New times: the app's dump at
**23:30** (`BACKUP_TIME=23:30`, now also the app's default) and the NAS copy job at **00:00**, finished by 01:00. Both stay
adjustable: `BACKUP_TIME=HH:MM` in `~/mydaybook/.env` (Pi local time, apply with `docker compose up -d`); keep the copy at least
30 minutes after the dump. File names, folders, retention and the "newer than 26 h" check are unchanged.

**Our follow-ups:** tell the owner when 0.1.0 is published, and report any change to the above. Ask the owner about the first
admin invite (question 1) when 0.1.0 is ready, and about a staging copy (question 4) if it becomes relevant.
