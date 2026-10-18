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
- Licences: code dependencies MIT/BSD/ISC/Apache-2.0 only; assets CC0/CC-BY only (font exception pending,
  see open decisions). The CI licence check must stay green.
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

## Current status

_Last updated: 2026-10-18, end of M0 session._

- **Milestone:** M0 delivered, waiting for owner review. No application code exists yet.
- **Done:** initial commit on `main`; `develop` created; `docs/SPEC.md`, this file,
  `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, design proposal (`design/`, HTML mockups + screenshots).
- **Owner review done for most decisions** (see Decisions log and `docs/ARCHITECTURE.md` §12).
- **Waiting on the owner:** D6 (OFL for fonts), D7 (payload-less push), D11 confirmation (consent age 13 vs handover age 18),
  D15 (PDF, can wait for M5), D16 (design). Deferred: D13, D14. D3 Tailscale is tentative.
- **Next:** M1 (scaffold, tooling, CI on PRs, design tokens, core components), once the decisions are made.
- **Not yet written (later milestones):** `docs/gdpr/*`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/SELF_HOSTING.md`,
  Compose files, `.env.example`.
