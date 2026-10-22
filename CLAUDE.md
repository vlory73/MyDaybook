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
   - After v1: M8 offline-first (owner must-have, 2026-10-19): unlock offline, encrypted outbox for entries made offline, clear
     "not synced yet" state; sign-in, reminders and admin stay online. Builds on the ciphertext cache in IndexedDB
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

## Working with the owner (recorded 2026-10-22, before the move to a Team account)

These are the owner's standing preferences, learned over M2–M4. Follow them in every session.

- **Who's involved:**
  - **The owner**, a product manager (communication and B2B messaging, not a developer). They review PRs on a phone, decide, merge, prepare releases and update branches on GitHub themselves.
  - **The "HA session"**, a separate Claude session that manages the home Raspberry Pi (Home Assistant, Caddy, Docker, the NAS). The owner relays messages between it and this project. Write HA prompts as a ready-to-paste block. Never act on the Pi from here, and report any change to the Pi agreement.
- **Tokens and tone:**
  - The owner is token-conscious, so keep messages short and plain, with no narration of options that won't be pursued.
  - Delegate well-scoped implementation to Sonnet sub-agents (or cheaper). The main session designs, reviews, opens PRs and talks to the owner.
- **Check-ins:**
  - Don't schedule check-ins or reminders unless asked.
  - Watching a PR you opened (CI and review events) is fine and expected: fix red CI, report green CI once.
- **Stopping:** stop at natural stopping points (a release, or a merged milestone branch), and update "Current status" before stopping.
- **Decisions:**
  - Present a plan and its open decisions before building anything sizeable, and give a recommendation for each.
  - The owner answers in chat (e.g. "1 ok, 3 change…"). **Merging a PR without comments means its open decisions are accepted as built**; log them in the decisions log on the next branch.
  - When the owner gives context mid-discussion ("we're still discussing"), don't change anything until they conclude.
- **PR format** (owner-approved, used since #11):
  - title in Conventional Commits
  - "Summary" with five numbered points
  - "Tests (local)" with counts
  - "Screenshots" with paths
  - "Open decisions for the owner" as a numbered list, plain language, most important first
  End with the Claude Code footer.
- **Releases:**
  - The owner runs `docs/RELEASING.md` (Actions → Prepare release → release PR → GitHub release; main back into develop).
  - Feature work continues on develop while a release branch is open.
  - The Pi is then upgraded via the HA session or the copy-paste block (Option B).
- **Small follow-ups:** they may ride on the next feature branch instead of their own PR, when the owner says so (e.g. the "Pain" rename went with `feature/bodymap-zoom`).
- **Issues and milestones:** no GitHub milestones. Issues are not used yet (only family users); see the decisions log.
- **Preferred style:** write all user-facing text and docs in plain, international English, and avoid jargon in messages to the owner.

## Lessons learned (CI, tests and tooling)

- **WebKit runs only in CI** (not installed locally), so design tests that pass there:
  - Don't use `page.route` for requests from a page the service worker controls. WebKit bypasses it; use `test.use({ serviceWorkers: 'block' })` and stub what's needed (see `tests/e2e/reminders.spec.ts`).
  - After `page.reload()`, wait for the "Your diary is locked" heading before unlocking, and give the first timeline assertion 15 s (see `tests/e2e/dose-adhoc.spec.ts`).
- **Flaky-looking failures:** root-cause first. If the same code passed CI before and the failing test isn't touched by the PR, make the test robust within the PR instead of re-running.
- **GitHub incidents:** during GitHub Actions incidents, runs may sit queued for minutes (Prepare release once took 9 min). Check githubstatus.com. If a release's `published` event was missed, rebuild with Actions → Release → Run workflow (tag input).
- **Sub-agents** work best in their own git worktree (`isolation: worktree`), with a precise brief (scope, decisions, tests, screenshots, the full local check) and an instruction not to push. The main session reviews the screenshots, merges develop, runs the full local check, pushes and opens the PR.
- **Merge conflicts in CLAUDE.md** are common, because every branch updates "Current status". Resolve them by combining both sides.
- **Pi upgrades:** `sed` reports success even when it changes nothing. The upgrade block therefore checks that the tag changed and stops otherwise (#39, #43).

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
| 2026-10-18 | Medication: weekdays not preselected, amount may be empty, times follow the phone's 12/24-hour setting (not forced). Nausea/heartburn gets its own stomach icon (CC0, drawn in-house) | Owner, PRs #15/#16 |
| 2026-10-19 | "Log another medicine" (ad-hoc dose) built before reminders; "Keep in my medicines" on by default; suggestions from the person's own medicines only. Built-in medicine name list goes to the backlog | Owner |
| 2026-10-19 | Tester feedback: visible Edit on Meds rows; logged doses editable (time for Taken as well as Taken late; an as-needed dose can move to another medicine); "Sachet (powder)" form added | Owner |
| 2026-10-18 | Doses: "All taken" only for slots with 2+ open doses; doses of archived/changed medications stay on the timeline only; duplicate times on one medication to be refused in the set-up sheet (follow-up). Order changed: Pi setup (Docker image, GHCR publishing, compose, nightly backup) and 0.1.0 before reminders | Owner, PR #19 |
| 2026-10-18 | Backups: the NAS is off during the night, so everything must be done by 01:00. App dump moves to 23:30 (new default `BACKUP_TIME`), NAS copy to 00:00; both adjustable. Replaces the 04:00 / 04:30 of D13 | Owner; confirmed by the HA session |
| 2026-10-19 | Meds rows leave out the form when it is "Other" (#34). Reminders design approved: the device uploads only times + time zone (no medicine link), empty VAPID pushes via Apple/Google/Mozilla, in-house VAPID (no `web-push`, MPL-2.0), endpoint allowlist, fully neutral text "You have a reminder." | Owner |
| 2026-10-19 | Reminders (#35) merged with its open decisions as built: no reminders for "every N days", start date not checked, 10 subscriptions per account, orphaned subscriptions dropped on 404/410, `PUSH_SCHEDULER=off`. Pi agreement extended: `VAPID_SUBJECT` in `.env`, outbound HTTPS to Apple/FCM/Mozilla/Windows push hosts (done by the HA session) | Owner, HA session |
| 2026-10-19 | No GitHub milestones. Issues: how to use them is decided later (users are family only for now); when feedback grows, revisit labels, an issue template that keeps health details out, and moving the backlog into issues | Owner |
| 2026-10-19 | Fluid intake added before M4 (`feature/fluids`, 0.4.0): Drink tile, default drinks + own drinks, editable presets (drinks with a usual size; sizes in cl), quantity stepper (2 × 15 cl = 30 cl), typed amount, "Same again", plain daily total. Stored in ml (per entry: drink, size name, size ml, count, total), shown in cl. No goals, nudges, hydration warnings, caffeine or alcohol-unit calculations (D19) | Owner |
| 2026-10-19 | Offline-first is a must-have right after v1 (M8); the spec already keeps it out of v1 | Owner |
| 2026-10-19 | Fluids (#40) merged with its 9 open decisions as built (built-in names follow the language, own amount 1–500 cl, "Other" saves an own drink, day total on Today and in the sheet, presets last-writer-wins, own Drink category = 11 tiles, removed presets stay selectable on old entries, deleting a size clears it as usual size; no "restore defaults", "Same again" only in the sheet) | Owner |
| 2026-10-19 | M4 plan approved: segmented outline (refined mockup), ~30 main regions + ~10–15 per zoom view, intensity 0–10 on a plain warm-to-plum scale (0 allowed, no thresholds), text summary on Today (body thumbnail idea kept for M5), no FMA IDs. Qualities: sharp, dull, burning, throbbing, aching, tingling, numb, itchy (0–3 per point, multi-select), no "other" (the note covers it). "Same as last time" and a dismissible "Still there?" card on Today for pain logged in the last 2 days. Branches: release-tooling → bodymap-regions → bodymap-entry (→ 0.5.0) → bodymap-zoom (→ 0.6.0) | Owner |
| 2026-10-19 | No children's body outline (spec deviation): the 2D outline is not anatomically accurate anyway, and the same region IDs would let one be added later without converting data. Revisit only if testers ask | Owner |
| 2026-10-19 | `release.yml` gets a manual "Run workflow" (tag input) to rebuild an existing release's images; the Pi upgrade block asks for the version | Owner |
| 2026-10-19 | Body map entry (#45) merged with its 7 decisions as built ("Same as last time" copies intensities, no intensity until picked, calendar-day window for "Still there?", "0 none · 10 worst imaginable", no entry-level note). 0.5.0 released. Quick-log tile and timeline label renamed from "Body map" to **"Pain" / "Smerter"** (the sheet keeps "Where do you feel it?"); ships with `feature/bodymap-zoom` | Owner |
| 2026-10-20 | Body map close-ups for head, hands and feet, and wider areas for diffuse pain (whole belly, upper and lower belly, whole back) approved after 0.5.0 feedback. Chest is not widened | Owner |
| 2026-10-22 | #48 feedback: one recognisable footprint (five toes) for both foot faces, with Top/Sole only relabelling; count badges on the close-up buttons; belly width choices show only the half holding the tapped quarter. Open: the sole is drawn as a footprint (big toe on the same side as the top view); a code switch `SOLE_TOES_UP` would flip it | Owner |
| 2026-10-22 | Project memory lives in this repo (CLAUDE.md), ahead of the move to a Team account; owner preferences and lessons recorded above | Owner |
| 2026-10-22 | M3 done: reminders confirmed on the owner's iPhone against the Pi; the Pi upgrade block that asks for the version confirmed working | Owner |

## Backlog (owner requests to raise later)

Remind the owner of these when planning the next feature milestone; don't build them unasked.

- **Per-user storage quota** (deferred 2026-10-18, "much later"): e.g. `STORAGE_QUOTA_MB`, refusing uploads over it with a
  friendly message. `users.storage_bytes` already tracks usage. Raise it again only much later (not at the next milestone).
- **Built-in medicine name list** (requested 2026-10-19): name suggestions beyond the person's own history, bundled in the app
  (no runtime lookups). First check the licence (CC0/CC-BY only; e.g. the Danish Medicines Agency's product data) and the size
  (over 1 MB needs approval); names only, never strengths, doses or interactions, and typed text always stays free.
- **Pain episodes** (requested 2026-10-19, for the M5 plan): link pain entries over several days into one episode with a start and
  end ("knee pain, 3 Oct → 9 Oct"), for charts and the doctor-visit PDF. Adds an optional episode link to entries; no migration.

## Current status

_Last updated: 2026-10-22. Released: 0.5.0 (on the Pi). In review: #48 `feature/bodymap-zoom` (CI green; merging it completes M4 → 0.6.0). M3 done: reminders confirmed on the owner's iPhone. The upgrade block that asks for the version works. Open: the owner tests the footprint sole and gathers family feedback (keep, or flip with `SOLE_TOES_UP`). Next: plan M5 (charts, heat map, export, PDF; include pain episodes and the body thumbnail idea from the backlog)._

- **M2 done** (all merged into develop): crypto-core (#2), server-db (#3), auth-server (#4), auth-ui (#5), records sync and
  notes (#7), body logging (feeling, sleep, weight/measurements, bowel), meals with watch list and saved meals, photos (#11;
  ~150 KB each, 1.25 MiB cap, `BODY_SIZE_LIMIT=2M`), TOTP (#12), e2e timing fixes (#14), admin users and invites (#13).
  Screenshots per feature in `docs/screenshots/<feature>/`.
- **M3 plan (owner-approved order):** `feature/log-gut` (merged #15), `feature/medication` (merged #16), `feature/doses`
  (due doses computed on the device, "All taken", taken / skipped / late, as-needed), then the **Pi setup** (`feature/docker`:
  image, `compose.yaml`, `.env.example`, `gen-secrets`; `feature/backup`: nightly dump at 23:30; GHCR image publishing in CI)
  and **0.1.0**, then `feature/reminders` (opt-in, payload-less Web Push with own VAPID, D7; checked on a real iPhone on the Pi).
- **M3 progress:** `feature/medication` merged (#16): `medication` record, Meds list (active and archived), set-up sheet, pure schedule
  helper (`src/lib/meds/schedule.ts`, for doses); screenshots in `docs/screenshots/medication/`.
  `feature/doses` merged (#19): `dose` record, due doses computed on the device (`src/lib/meds/due.ts`), "All taken" per slot with one Undo,
  Today / Meds / quick-log "Medicine" cards, timeline entries; screenshots in `docs/screenshots/doses/`.
  `feature/backup` merged (#21): nightly backup job, `cli backup`, verified dumps, blob mirror (`scripts/backup-core.mjs`).
  `feature/log-gut` merged (#15): nausea / heartburn quick-log tile and sheet (`gut` record); screenshots in
  `docs/screenshots/log-gut/`.
- **feature/docker merged (#22):** `Dockerfile` (pinned node:24-bookworm-slim, non-root, read-only root), `scripts/docker-entrypoint.sh`,
  `gen-secrets`, `cli` command, root `compose.yaml`, `.env.example`, `TRUSTED_PROXY` support (`src/lib/server/auth/proxy.ts`).
- **feature/image-publish merged (#23):** CI builds and starts the image on amd64 and arm64 for every PR, publishes `:edge` on merges
  into develop, and `release.yml` publishes `:X.Y.Z` + `:latest` with the changelog (`scripts/changelog.mjs`) on a release.
  Owner step after the first publish: make the GHCR package public (CONTRIBUTING "Releases and images").
- **M1 contents:** SvelteKit app shell (client-side rendering, adapter-node), design tokens + 12 core components, typed i18n
  (en + da), Today / Trends / Meds / Me screens with empty states, quick-log sheet (tiles not wired yet), About text with the
  intended-use statement, theme and language switching, PWA manifest, icons, service worker (app shell), security headers +
  strict CSP, `/healthz`, CI workflow (lint, types, unit, licences, audit, build, e2e on Chromium + WebKit), CONTRIBUTING,
  SECURITY. Screenshots in `docs/screenshots/m1/`.
- **Decisions D1–D23 all approved.** The owner is setting up branch protection (rulesets for `develop`, `main` and `v*` tags,
  see "Branch protection" in CONTRIBUTING.md).
- **0.1.0 released** (2026-10-18): release PR #24 into main, owner's GitHub release, image `ghcr.io/vlory73/mydaybook:0.1.0`
  (amd64 + arm64, public), main merged back into develop (#25). Deployed on the Pi by the HA session (healthy, proxy trusted,
  NAS copy at 00:00 tested with a restore). In the container the command is `cli …` (see docs/HOME_DEPLOYMENT.md).
- **`feature/dose-edit` merged (#29):** Edit label on Meds rows, date and time for Taken, medicine picker for as-needed doses
  (`src/lib/meds/doseTime.ts`); screenshots in `docs/screenshots/dose-edit/`. `feature/med-form-sachet` merged (#28): sachet form.
- **`feature/dose-adhoc` merged (#27):** "Log another medicine" in the Medicine sheet and on Meds (`AdhocDoseSheet.svelte`,
  `src/lib/meds/adhoc.ts`); screenshots in `docs/screenshots/dose-adhoc/`.
- **Release guide merged (#30):** `docs/RELEASING.md` (route A: Actions → Prepare release; route B: `node scripts/release-prep.mjs`;
  Pi upgrade via the HA session, the command line or Portainer as a fallback).
- **0.2.0 released** by the owner with the guide (#31 into main, #32 back into develop) and deployed on the Pi. Docker warns that
  the Pi kernel has no memory-limit support, so `mem_limit` is ignored (harmless; fix = `cgroup_enable=memory cgroup_memory=1`
  in `/boot/firmware/cmdline.txt` + reboot, via the HA session, not done yet). The owner keeps docker compose; Portainer is only
  a fallback.
- **`feature/meds-hide-other` merged (#34):** the "Other" form is no longer shown on Meds rows (owner decision from #27).
- **`feature/reminders` merged (#35, last M3 part):** opt-in per device. The device uploads only `{ tz, slots: [{ time, days }] }`
  (`src/lib/push/schedule.ts`), the server keeps it in `push_subscriptions` and a one-minute tick (`src/lib/server/push/`) sends empty
  VAPID-signed pushes (own ES256 code, `node:crypto`, endpoint allowlist); the service worker shows a fixed neutral text. Needs
  `VAPID_SUBJECT` in the Pi's `.env` (docs/HOME_DEPLOYMENT.md); screenshots in `docs/screenshots/reminders/`.
  The six open decisions in #35 were accepted with the merge. **Pi prepared** by the HA session: `VAPID_SUBJECT` in `.env` (3 VAPID
  lines), outbound HTTPS to all four push hosts works. **0.3.0 released** by the owner and deployed on the Pi by the HA session
  (healthy). The upgrade block in docs/RELEASING.md only matched 0.1.0, so it silently kept 0.2.0; it now takes `V=<version>`,
  matches any version and stops when the tag did not change (#39). **Done:** confirmed on the owner's iPhone (2026-10-22); M3 is complete.
- **`feature/fluids` merged (#40), released in 0.4.0:** `drink` and `drink_presets` records (`src/lib/records/drinks.ts`), Drink tile, `DrinkSheet.svelte`
  (two taps for water, quantity stepper 1 to 10, typed amount, "Same again", live total), `DrinkPresetsSheet.svelte` (edit mode), plain
  day total on Today; screenshots in `docs/screenshots/fluids/`. Trends charts stay in M5.
- **M4 (body map):** `feature/release-tooling` merged (#43: #40 log, M4 decisions, `release.yml` manual rebuild, upgrade block that
  asks for the version); `feature/bodymap-regions` merged (#44, belly as four quarters); `feature/bodymap-entry` merged (#45), 0.5.0 released, `feature/bodymap-zoom` (→ 0.6.0).
  0.4.0 (fluids) released and on the Pi.
- **`feature/bodymap-regions` (M4 branch 1, merged #44):** region catalogue (26 IDs, `src/lib/bodymap/catalogue.ts`), `BodyMap` and `RegionFinder` components
  (style guide only, no entry UI yet), `pain` validator (`src/lib/records/pain.ts`, not yet in `parsePayload`); screenshots in `docs/screenshots/bodymap-regions/`.
- **Upgrade block** (docs/RELEASING.md Option B, asks for the version): confirmed working by the owner (2026-10-22).
- **`feature/bodymap-entry` (M4 branch 2, merged #45, in 0.5.0):** `pain` wired into `parsePayload` and the timeline; "Body map" quick-log tile
  (`cat.pain` now reads "Body map" / "Kropskort"); `BodyMapSheet.svelte` ("Where do you feel it?": map, Find, pinned point panel with
  intensity 0 to 10, up to 3 qualities, note, `+ Point`, `Save N points`; `LogSheet` got `dock`, `extra` and `saveLabel`); "Same as last
  time" and the "Still there?" card on Today (`src/lib/records/painEntry.ts`, dismissal = entry id in localStorage); screenshots in
  `docs/screenshots/bodymap-entry/`. Heat map, charts and PDF stay in M5.
- **`feature/bodymap-zoom` (M4 branch 3, in review, → 0.6.0):** close-ups for head, hands and feet (`2d-head-v1`, `2d-hand-v1`, `2d-foot-v1`, 9 / 8 / 11 new regions with
  `parent` set; one hand or foot at a time with a Right / Left and Palm / Back or Top / Sole toggle; Head / Hands / Feet buttons and "Back to the body" in `BodyMapSheet.svelte`;
  Find lists them and opens the close-up), and wider areas (`belly`, `back`, and `upper_belly` / `lower_belly` on the midline; "This quarter · Upper belly · Lower belly · Whole belly"
  and "This part · Whole back" chips in the point panel; stored at the centre, drawn as a dot with the area softly highlighted). Catalogue now works with scenes
  (`mainScene`, `zoomScene`, `zoomFor`, `wideOptions`, `widen`); coordinate spaces documented in ARCHITECTURE §5. Foot: one footprint silhouette with five toes for both faces; count badges on the close-up buttons; belly width choices show only the half that holds the quarter. Screenshots in `docs/screenshots/bodymap-zoom/`.
- **Promised to the owner:** report any change to the Pi agreement; ask about a staging copy on the Pi (Q4) only if it becomes
  relevant. The storage quota stays in the backlog ("much later").
- **Not yet written (later milestones):** `docs/gdpr/*`, `docs/SELF_HOSTING.md`.
