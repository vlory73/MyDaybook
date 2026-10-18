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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and checks, and [SECURITY.md](SECURITY.md) to report a vulnerability.
Self-hosting instructions (Docker Compose, `.env.example`, the `gen-secrets` command) arrive with the first release, 0.1.0.
