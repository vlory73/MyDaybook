You are starting a new project in an empty repository. Read this whole brief before doing anything.

# MyDaybook (working title): private family diary for food, well-being, health and medication

## First session (M0): do exactly this, then stop
1. Bootstrap the repo:
   - on main, make one initial commit (README stub, LICENSE, .gitignore)
   - create develop from main
   - all further M0 work is committed directly to develop (allowed only for M0 and M1, see "Git workflow")
2. Save this entire brief verbatim as docs/SPEC.md.
3. Create CLAUDE.md with:
   - a pointer to docs/SPEC.md as the source of truth
   - the rules from "Git workflow" and "How to work"
   - a "Current status" section you update at the end of every session
4. Write docs/ARCHITECTURE.md and docs/THREAT_MODEL.md, including:
   - your stack proposal with justification and alternatives considered
   - the key hierarchy, recovery and guardian handover
   - what a compromised server can and cannot learn
5. Propose the design direction (see "Design and usability"):
   - static HTML mockups in /design
   - phone-width screenshots of each
6. Push develop, summarise the work in 10 lines, list every decision you need from me, and stop. Do not write app code yet.

## Git workflow (gitflow) — mandatory
- Branches:
  - main: released code only. Every commit on main corresponds to a tagged release. Never commit to it directly.
  - develop: the integration branch and the repo's default branch.
  - feature/<short-kebab-name>: every new feature. Branch from the latest origin/develop; merge back into develop via a pull request.
  - release/vX.Y.Z: created from develop only when I ask for a release. Contains only the version bump, changelog and release fixes. PR into main; after I tag the release, open a PR merging main back into develop.
  - hotfix/vX.Y.Z: created from main for urgent fixes. PR into main; after tagging, PR main back into develop.
- Direct commits to develop are allowed ONLY for M0 and M1. From M2 onwards, every change, however small, starts on a new branch and reaches develop through a pull request.
- One feature per branch. A milestone may span several feature branches.
- Before opening a PR:
  - update the branch with the latest develop
  - make sure CI is green
  - keep PRs small enough to review on a phone
- Merge strategy: squash-merge feature PRs; use merge commits for release and hotfix PRs.
- Commit messages follow Conventional Commits. The changelog is generated from them.
- Versioning: SemVer. Stay on 0.x until the public release.
- I create release tags myself (via a GitHub release on main). Never push tags.
- If the environment restricts branch names, or blocks a push to a protected branch, stop and tell me. Do not work around it.

## Context
Build a self-hosted web app (installable PWA) where each person keeps a private diary of food, well-being, health measurements, pain and medication. First deployment: my household of four, on a Raspberry Pi 4 (4 GB, arm64, booting from SSD). It already runs Home Assistant, Pi-hole and other services in Docker, managed with Portainer. Keep the footprint small. Access is from iPhones and a Windows/Mac machine over my home VPN only. Nothing is exposed to the public internet.
Later I will publish it for others to self-host for personal, non-commercial use.

"MyDaybook" is a working title and will likely change before public release. Keep the display name, short name, PWA manifest name, Docker image name and package name in one central config, so a rename touches a single file plus the repo name.

## Non-negotiables

### 1. Users are private from each other AND from the operator
- End-to-end encryption, client-side. The server stores ciphertext only. As admin, I must be unable to read anyone's entries.
- Keys: a per-user master key, wrapped by a passphrase-derived key (Argon2id) and by a one-time recovery key shown at signup. Content encryption: XChaCha20-Poly1305 (libsodium). The server never receives the passphrase. Authenticate with a separately derived key (Bitwarden-style), or propose a better scheme.
- Minimise metadata. The server sees only user id, entry id, timestamps and ciphertext size. Entry type and all content stay encrypted.
- Search, filtering and charts run client-side after decryption.
- Auto-lock the client after inactivity. Never log decrypted content anywhere.
- If a user loses both their passphrase and their recovery key, their data is unrecoverable by design. Say so clearly at signup, and make the user confirm they have stored the recovery key.

### 2. EU GDPR compliance by design
- Treat all diary content as Art. 9 special-category data.
- My use falls under the household exemption. Future self-hosters may be controllers, so build everything an operator needs to comply: privacy by design and default (Art. 25), security (Art. 32).
- Data subject rights built into the UI:
  - export as JSON + CSV, generated client-side (Art. 15/20)
  - edit any entry (Art. 16)
  - account deletion with crypto-shredding and hard delete (Art. 17)
- Explicit, versioned consent at account creation, stored with a timestamp. Withdrawing consent leads to deletion.
- No analytics, no telemetry, no external CDNs or fonts, no third-party calls at runtime. Self-host every asset.
- Server logs carry no request bodies. IP retention is configurable, default 7 days.
- Minors:
  - guardian-managed dependent profiles
  - configurable age threshold, default 13 (Denmark)
  - a "hand over" flow: the child sets a passphrase, the key is re-wrapped, guardian access is revoked after explicit confirmation
- Ship templates in docs/gdpr/:
  - privacy notice
  - record of processing activities (Art. 30)
  - DPIA (Art. 35)
  - breach response checklist (Art. 33/34)
  - a note that hosting outside the EU/EEA triggers transfer rules

### 3. Not a medical device (EU MDR 2017/745, Rule 11)
- Intended purpose: personal record-keeping. State this in the README and the in-app About page.
- No dose calculations, no drug-interaction checks, no diagnostic insights, no advice, no alerts triggered by measurement thresholds.

### 4. Licence hygiene
- LICENSE: PolyForm Noncommercial 1.0.0.
- Dependencies and assets must be MIT/BSD/ISC/Apache-2.0 (code) or CC0/CC-BY (assets) only. Add a licence check to CI.

## Design and usability (as important as the features)
- The app must feel calm, warm and attractive. It should look like a consumer wellness app, not an admin panel or a medical record.
- The design proposal covers:
  - colour palette (light and dark), typography, spacing scale, icon set, motion principles
  - mockups of the key screens: today view, quick-log sheet, body map, medication list, trends
- Implement the approved direction as design tokens and a small component library. Use no off-the-shelf admin-style UI kit. Self-host fonts and icons.
- Interaction rules:
  - bottom navigation; one prominent "+" quick-log button reachable with the thumb
  - common entries in 1–3 taps; logging in under 10 seconds
  - sensible defaults (current time, last-used values)
  - undo instead of confirmation dialogs for non-destructive actions
- Friendly empty states, and a short first-run onboarding that explains privacy and the recovery key in plain language.
- Design for a 375 px wide iPhone screen first. Respect iOS safe areas and Dynamic Type. Dark mode. WCAG 2.2 AA basics.
- English + Danish from day one (i18n framework, no hard-coded strings).

## Features (v1)
- **Food:**
  - meal type, time, free-text description, user-defined tags
  - optional photo, resized and EXIF-stripped client-side before encryption
- **Well-being:**
  - mood, energy, stress (1–5)
  - sleep hours and quality
  - user-defined symptom tags with severity
  - free notes
- **Health measurements:** user-defined types with units (weight, blood pressure, temperature, etc.).
- **Body map for pain and symptoms (2D):**
  - front and back body outlines as hand-built SVG: gender-neutral, with a scaled variant for children's profiles
  - named, tappable regions at a sensible granularity (e.g. left knee, lower back, right temple)
  - a zoomed view for head, hands and feet
  - one entry can mark several points; each stores region id, side, exact x/y within the region, intensity (0–10), quality (sharp, dull, burning, throbbing, aching, tingling, other) and an optional note
  - sides labelled "your left / your right" on screen, because the front view mirrors the user
  - every region also selectable from a searchable list, for accessibility
  - a heat map of the body showing frequency and average intensity per region over a chosen period
  - a data model that allows a lazy-loaded 3D view later without migrating data
- **Medication:**
  - a personal medication list, as entered by the user (name, strength, form, schedule)
  - log doses as taken / skipped / late
  - reminders via Web Push, opt-in. Payloads stay generic ("Time for a check-in") and never carry health content. Document that push messages transit Apple/Google push services, and the iOS requirement: installed PWA, iOS 16.4+.
- **Views:**
  - daily timeline
  - trend charts
  - "doctor visit" PDF export for a date range, generated client-side, including the body heat map
- **Accounts:**
  - invite-only registration
  - optional TOTP
  - admin can invite, disable accounts and see storage use, but cannot see content

## Out of scope for v1 (design keys so these can come later)
- Sharing selected categories between adults (read-only, revocable, off by default).
- Offline-first sync. v1 can require connectivity but must cache the app shell.
- 3D body view.
- Native app-store builds.

## Tech direction (my starting suggestion; propose and justify, then wait for my confirmation)
- SvelteKit + TypeScript PWA, single Node process (adapter-node)
- SQLite (better-sqlite3 + Drizzle)
- libsodium-wrappers-sumo
- Docker Compose, multi-arch (linux/arm64 + linux/amd64)
- HTTPS: PWAs, service workers and WebCrypto need a secure context. Propose a TLS approach for a VPN-only home deployment, compare options, and document the setup.
- Security baseline:
  - strict CSP with no inline scripts
  - HSTS
  - SameSite cookies
  - rate limiting on auth endpoints
  - dependency audit in CI

## Build and deployment
- You never deploy. Deployment is pull-based: the home server only makes outbound connections, and nothing is exposed inbound.
- GitHub Actions:
  - on every pull request to develop or main: lint, typecheck, tests, licence check, audit, e2e
  - on every merge to develop: the same checks, then build and push a multi-arch image to GHCR tagged :edge
  - on a version tag (vX.Y.Z) on main: build and push the image tagged :X.Y.Z and :latest, and publish the generated changelog in the GitHub release
- Provide two Docker Compose files ready to paste into Portainer stacks:
  - staging: tracks :edge, separate port and volume, seeded with synthetic data
  - family: pinned to an explicit version tag
- Configuration via a .env file on the host only; ship .env.example. Provide a one-off command that generates the session secret and VAPID keys on the host.
- Database migrations run automatically at startup, but only after writing a timestamped backup of the SQLite file. Abort startup if the backup fails.
- A nightly backup script that copies the database and photo store to a mounted NAS path. Document that deleted accounts persist in backups until rotation, and reflect that in the privacy notice.
- Health check endpoint. Memory limit set in Compose (target under 256 MB).

## Repo deliverables
- README (purpose, intended-use disclaimer, quick start)
- docs/SPEC.md
- docs/ARCHITECTURE.md
- docs/THREAT_MODEL.md
- docs/gdpr/*
- SECURITY.md
- CONTRIBUTING.md (including the gitflow rules)
- CLAUDE.md
- docs/SELF_HOSTING.md, covering:
  - first install on a Raspberry Pi with Docker + Portainer
  - adding a GHCR read-only token as a Portainer registry
  - updating by changing the version tag
  - rollback, including restoring a pre-migration backup
  - moving the stack to another host (e.g. a NAS)
- Tests: unit tests for all crypto and key handling; e2e tests for the core flows
- Seed data must be synthetic. Never use real health data in fixtures.

## How to work (copy these rules into CLAUDE.md)
1. Milestones:
   - M0: spec, architecture, threat model, design proposal (direct to develop)
   - M1: project scaffold, tooling, CI on pull requests, design tokens and core components (direct to develop; the last direct commit ever)
   - M2: auth, crypto, entry CRUD
   - M3: medication and reminders
   - M4: body map
   - M5: charts, heat map, export, PDF
   - M6: dependent profiles and handover
   - M7: Danish i18n, hardening, image publishing, self-hosting docs
2. From M2 onwards, each milestone is split into one or more feature/* branches, each with its own PR into develop. Each PR needs:
   - CI green
   - e2e tests run in the sandbox
   - phone-width screenshots of new or changed screens
   - a 5-line summary
   - a list of open decisions for me
3. Update "Current status" in CLAUDE.md at the end of every session, via the current feature branch.
4. Ask before adding any dependency over 1 MB or any network-touching feature.
5. If something in the spec is contradictory or unwise, say so and propose an alternative rather than silently working around it.
