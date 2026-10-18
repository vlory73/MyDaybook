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

7. Testing economy (owner request, 2026-10-18). GitHub Actions is the official gate; local runs exist to avoid red CI cycles:
   - Docs-only changes: no local test run; let CI confirm.
   - While iterating: run only the fast, relevant checks (lint, typecheck, the affected unit tests or one e2e spec).
   - Before pushing code: one full local run (`npm run lint`, `npm run check`, `npm test`, `npm run licenses`,
     `npm run audit`, `npx playwright test --project=phone-chromium`), as the spec requires e2e in the sandbox.
   - Keep tool output trimmed (tail/grep); never paste full logs.
   - Give sub-agents the same rule.

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
| 2026-10-18 | Photos: 1280 px JPEG q0.7 (~150 KB), 256 px thumbnails, 1.25 MiB blob cap, `BODY_SIZE_LIMIT=2M`. Declined for now: separate JSON body cap; per-user storage quota deferred to the backlog | Owner, PR #11 |
| 2026-10-18 | TOTP: using the recovery key bypasses and switches off two-step sign-in; no backup codes in v1; optional `E2E_PORT` test setting kept | Owner, PR #12 |
| 2026-10-18 | M3 approved: medication, doses, reminders (Web Push opt-in, needs an installed PWA on iOS 16.4+; iPhone check after 0.1.0), plus nausea/heartburn logging moved from the backlog into M3 | Owner |

## Backlog (owner requests to raise later)

Remind the owner of these when planning the next feature milestone; don't build them unasked.

- **Per-user storage quota** (deferred 2026-10-18, "much later"): e.g. `STORAGE_QUOTA_MB`, refusing uploads over it with a
  friendly message. `users.storage_bytes` already tracks usage. Raise it again only much later (not at the next milestone).

## Current status

_Last updated: 2026-10-18, start of M3 (feature/medication)._

- **M2 done** (all merged into develop): crypto-core (#2), server-db (#3), auth-server (#4), auth-ui (#5), records sync and
  notes (#7), body logging (feeling, sleep, weight/measurements, bowel), meals with watch list and saved meals, photos (#11;
  ~150 KB each, 1.25 MiB cap, `BODY_SIZE_LIMIT=2M`), TOTP (#12), e2e timing fixes (#14), admin users and invites (#13).
  Screenshots per feature in `docs/screenshots/<feature>/`.
- **M3 plan (owner-approved order):** `feature/medication` (medication list and set-up sheet in Meds), `feature/doses` (due
  doses computed on the device, "All taken" per slot, taken / skipped / late, as-needed), `feature/reminders` (opt-in,
  payload-less Web Push with own VAPID, D7; verified on a real iPhone only after 0.1.0 is on the Pi), and
  `feature/log-gut` (quick nausea and heartburn logging, from the backlog).
- **M3 progress:** `feature/medication` built: `medication` record, Meds list (active and archived), set-up sheet, pure schedule
  helper (`src/lib/meds/schedule.ts`, for doses); screenshots in `docs/screenshots/medication/`.
  `feature/log-gut` in review (#15): nausea / heartburn quick-log tile and sheet (`gut` record); screenshots in
  `docs/screenshots/log-gut/`.
- **M1 contents:** SvelteKit app shell (client-side rendering, adapter-node), design tokens + 12 core components, typed i18n
  (en + da), Today / Trends / Meds / Me screens with empty states, quick-log sheet (tiles not wired yet), About text with the
  intended-use statement, theme and language switching, PWA manifest, icons, service worker (app shell), security headers +
  strict CSP, `/healthz`, CI workflow (lint, types, unit, licences, audit, build, e2e on Chromium + WebKit), CONTRIBUTING,
  SECURITY. Screenshots in `docs/screenshots/m1/`.
- **Decisions D1–D23 all approved.** The owner is setting up branch protection (rulesets for `develop`, `main` and `v*` tags,
  see "Branch protection" in CONTRIBUTING.md).
- **Promised to the owner:** say when 0.1.0 is published (and report any change to the Pi agreement); ask about the first admin
  invite (Q1) at 0.1.0, and about a staging copy on the Pi (Q4) only if it becomes relevant. Raise the backlog items when
  planning the next milestone.
- **Not yet written (later milestones):** `docs/gdpr/*`, `docs/SELF_HOSTING.md`, Dockerfile, `compose.yaml`, `.env.example`.
