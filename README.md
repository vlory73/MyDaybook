# MyDaybook

> Working title. A private, end-to-end encrypted family diary for food, well-being, health measurements, pain and medication — self-hosted, installable as a PWA.

**Status:** early development (milestone M1: app shell, design system and CI). Not usable for diary entries yet.

**Intended purpose:** personal record-keeping only. MyDaybook is not a medical device. It gives no advice, no diagnosis, no dose calculations and no alerts based on measurements.

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

## Documents

- [Spec](docs/SPEC.md) (source of truth) · [Architecture](docs/ARCHITECTURE.md) · [Threat model](docs/THREAT_MODEL.md)
- [Design proposal](design/README.md) with phone-width mockups

## Developer quick start

```sh
npm ci
npm run dev
```

First admin (after the server has started once so the database exists): `node scripts/cli.mjs invite --admin` prints a one-time
`/join#t=…` link (in Docker: `docker compose exec app cli invite --admin`). The token sits in the URL fragment, so it
never reaches server logs.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and checks, and [SECURITY.md](SECURITY.md) to report a vulnerability.

## Run on a Raspberry Pi (Docker)

The full self-hosting guide (`docs/SELF_HOSTING.md`) arrives in M7. The home setup is described in
[docs/HOME_DEPLOYMENT.md](docs/HOME_DEPLOYMENT.md). You need a reverse proxy with HTTPS in front (the app speaks plain HTTP on
`127.0.0.1:8090` only).

```sh
mkdir -p ~/mydaybook/data ~/mydaybook/backup && cd ~/mydaybook
sudo chown 1000:1000 data backup                 # the container runs as uid:gid 1000:1000 (PUID/PGID in .env if different)
# copy compose.yaml and .env.example (as .env) from this repo at the release tag, then edit PUBLIC_URL etc. in .env
docker run --rm ghcr.io/vlory73/mydaybook:0.2.0 gen-secrets >> .env   # appends the three secrets without printing them
chmod 600 .env
docker compose up -d
curl -s http://127.0.0.1:8090/healthz            # {"status":"ok"}
docker compose exec app cli invite --admin       # first admin: run in your own terminal, the link is a one-time credential
```

Upgrades are deliberate: change the image tag in `compose.yaml`, then `docker compose up -d`. Releasing and upgrading step
by step: [docs/RELEASING.md](docs/RELEASING.md).
