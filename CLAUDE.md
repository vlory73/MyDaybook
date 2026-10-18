# CLAUDE.md

Guidance for Claude (and any other contributor) working in this repository.

## Source of truth

**[`docs/SPEC.md`](docs/SPEC.md) is the source of truth.** It is the original brief, saved verbatim.
If anything in this file, the code or other docs disagrees with the spec, the spec wins, unless the
owner has approved a change. Approved changes are recorded in "Decisions log" below.

Other key documents:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): stack, key hierarchy, data model, deployment
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md): what we protect, from whom, and what a compromised server can learn
- [`design/README.md`](design/README.md): the proposed design direction and mockups

## Non-negotiables (summary, see spec for full text)

- E2EE: the server stores ciphertext only. Never send plaintext, the passphrase or keys to the server.
  Never log decrypted content anywhere (console, server logs, error reports, test snapshots).
- No analytics, telemetry, external CDNs, external fonts or third-party calls at runtime.
- Not a medical device: no dose calculations, interaction checks, diagnostic insights, advice,
  reference ranges or threshold-triggered alerts.
- Licences: code dependencies MIT/BSD/ISC/Apache-2.0 only; assets CC0/CC-BY only, except fonts, which may
  also be SIL OFL-1.1 (D6). Build/test tooling may also be BlueOak-1.0.0 or Python-2.0 (D22). The CI licence check must stay green.
- Seed data and fixtures are synthetic. Never use real health data.
- No hard-coded user-facing strings: everything goes through i18n (English + Danish).

## Git workflow (gitflow), mandatory

- Branches:
  - `main`: released code only. Every commit on main corresponds to a tagged release. Never commit to it directly.
  - `develop`: the integration branch and the repo's default branch.
  - `feature/<short-kebab-name>`: every new feature. Branch from the latest `origin/develop`; merge back into develop via a pull request.
  - `release/vX.Y.Z`: created from develop only when the owner asks for a release. Contains only the version bump, changelog and release fixes. PR into main; after the owner tags the release, open a PR merging main back into develop.
  - `hotfix/vX.Y.Z`: created from main for urgent fixes. PR into main; after tagging, PR main back into develop.
- Direct commits to develop are allowed ONLY for M0 and M1. From M2 onwards, every change, however small, starts on a new branch and reaches develop through a pull request.
- One feature per branch. A milestone may span several feature branches.
- Before opening a PR:
  - update the branch with the latest develop
  - make sure CI is green
  - keep PRs small enough to review on a phone
- Merge strategy: squash-merge feature PRs; use merge commits for release and hotfix PRs.
- Commit messages follow Conventional Commits. The changelog is generated from them.
- Versioning: SemVer. Stay on 0.x until the public release.
- The owner creates release tags (via a GitHub release on main). Never push tags.
- If the environment restricts branch names, or blocks a push to a protected branch, stop and tell the owner. Do not work around it.

## How to work

1. Milestones:
   - M0: spec, architecture, threat model, design proposal (direct to develop)
   - M1: project scaffold, tooling, CI on pull requests, design tokens and core components (direct to develop; the last direct commit ever)
   - M2: auth, crypto, entry CRUD
   - M3: medication and reminders
   - M4: body map
   - M5: charts, heat map, export, PDF
   - M6: dependent profiles and handover
   - M7: Danish i18n, hardening, image publishing, self-hosting docs
2. From M2 onwards, each milestone is split into one or more `feature/*` branches, each with its own PR into develop. Each PR needs:
   - CI green
   - e2e tests run in the sandbox
   - phone-width screenshots of new or changed screens
   - a 5-line summary
   - a list of open decisions for the owner
3. Update "Current status" in CLAUDE.md at the end of every session, via the current feature branch.
4. Ask before adding any dependency over 1 MB or any network-touching feature.
5. If something in the spec is contradictory or unwise, say so and propose an alternative rather than silently working around it.
6. Use Sonnet sub-agents for well-scoped implementation work to curb costs; the main session designs, reviews and opens PRs (owner request, 2026-10-18).

## Conventions

- Branding (display name, short name, manifest name, description) lives in one file: `brand.config.json`
  (created in M1). Package name stays a neutral `"private": true` name and the image name is derived from
  the repository name in CI, so a rename touches that single file plus the repo name.
- Phone-width screenshots: 375 × 812 CSS px at 2× device scale, light and dark.
- Never commit `.env`, databases, backups or real photos.

## Decisions log

| Date | Decision | Source |
| --- | --- | --- |
| 2026-10-18 | Repo bootstrapped; `main` and `develop` created and pushed | M0 |
| 2026-10-18 | `develop` set as the GitHub default branch | Owner |
| 2026-10-18 | Approved: D1 stack, D2 hash-based CSP + `wasm-unsafe-eval`, D4 derived-key auth, D5 libsodium-sumo, D8 attachments on any record, D9 auto-lock, D10 recovery key format, D12 deletion allowed unless a dependent is left without a guardian | Owner, M0 review |
| 2026-10-18 | Tentative: D3 Tailscale HTTPS; D11 handover suggested at 18, consent age 13 kept separate | Owner, M0 review |
| 2026-10-18 | Deferred: D13 backup mechanism, D14 backup retention. Open: D6 font licence, D7 push UX, D15 PDF approach, D16 design | Owner, M0 review |
| 2026-10-18 | Approved: D6 OFL-1.1 allowed for font files only (system fonts first), D7 payload-less push, D11 consent age 13 / handover age 18, D15 print first then pdf-lib | Owner |
| 2026-10-18 | Home Pi facts from the Home Assistant session: D3 = existing Caddy at https://lory-home.duckdns.org:8444, app on port 8090; D13 = in-app dump at 04:00 into ~/mydaybook/backup (3 kept); D14 = 14 days on the NAS. See docs/HOME_DEPLOYMENT.md | Owner, HA session |
| 2026-10-18 | Home Pi details agreed with the HA session: port 127.0.0.1:8090, fixed subnet 172.30.90.0/24 (TRUSTED_PROXY=172.30.90.1), HSTS 86400 then 31536000 with no includeSubDomains, stable dump name, no staging on the Pi, root `compose.yaml` + `.env.example` required. See docs/HOME_DEPLOYMENT.md | HA session |
| 2026-10-18 | D16 design "Linen & Clay" approved. D17 scope additions approved: food watch list (intolerances/allergens) + saved meals, bowel movements, recurring medication with "All taken", dedicated sleep and weight logging. D18–D20 proposed (descriptive food/symptom views only, no BMI/targets, no pill counts) | Owner |
| 2026-10-18 | D18–D20 approved: food/symptom views descriptive only, no alerts on bowel entries; no BMI, targets or reference ranges; no pill counts or refill reminders in v1 | Owner |
| 2026-10-18 | M1: SvelteKit 2.70 / Svelte 5 / Vite 7 / TypeScript 5.9 / Vitest 5 pinned (newer majors skipped deliberately). `cookie` overridden to 0.7.2 (audit). D21 (in-house i18n) and D22 (tooling licences) proposed | M1 |
| 2026-10-18 | Approved: D21 in-house i18n, D22 BlueOak-1.0.0/Python-2.0 for build/test tooling only, and the M1 dev dependencies over 1 MB (TypeScript, Prettier, svelte-check, Svelte, ESLint, Vitest, @types/node, Vite, eslint-plugin-svelte, SvelteKit) | Owner |
| 2026-10-18 | D23 approved: on account deletion, the user's security_events are deleted; admin_audit rows are kept for accountability | Owner |

## Backlog (owner requests to raise later)

Remind the owner of these when planning the next feature milestone; don't build them unasked.

- **Nausea and heartburn** (requested 2026-10-18): a dedicated, quick way to log them. Today they could only be logged as
  symptom tags with a severity. Fits next to bowel movements in the gut area.

## Current status

_Last updated: 2026-10-18, during M2 (feature/auth-server)._

- **Milestone:** M2 in progress. Merged: crypto-core (#2) and server-db (#3). In review: `feature/auth-server` (sessions, origin guard,
  rate limits, signup/login/recovery/passphrase/delete API, first-admin invite CLI). Built, stacked on auth-server:
  `feature/auth-ui` (join, login, unlock view, auto-lock, recovery, Me account section; screenshots in
  `docs/screenshots/auth-ui/`). Next: `feature/entries`.
  TOTP and admin user management will come in their own branches. Every change goes through a `feature/*` branch and a PR.
- **M1 contents:** SvelteKit app shell (client-side rendering, adapter-node), design tokens + 12 core components, typed i18n
  (en + da), Today / Trends / Meds / Me screens with empty states, quick-log sheet (tiles not wired yet), About text with the
  intended-use statement, theme and language switching, PWA manifest, icons, service worker (app shell), security headers +
  strict CSP, `/healthz`, CI workflow (lint, types, unit, licences, audit, build, e2e on Chromium + WebKit), CONTRIBUTING,
  SECURITY. Screenshots in `docs/screenshots/m1/`.
- **Decisions D1–D23 all approved.** The owner is setting up branch protection (rulesets for `develop`, `main` and `v*` tags,
  see "Branch protection" in CONTRIBUTING.md).
- **Next:** see Milestone above; the M2 branch plan was `feature/crypto-core`, `feature/server-db`,
  `feature/auth-signup`, `feature/entries`.
- **Promised to the owner:** say when 0.1.0 is published (and report any change to the Pi agreement); ask about the first admin
  invite (Q1) at 0.1.0, and about a staging copy on the Pi (Q4) only if it becomes relevant. Raise the backlog items when
  planning the next milestone.
- **Not yet written (later milestones):** `docs/gdpr/*`, `docs/SELF_HOSTING.md`, Dockerfile, `compose.yaml`, `.env.example`.
