# Contributing

Thanks for helping. Please read [`docs/SPEC.md`](docs/SPEC.md) (source of truth), [`CLAUDE.md`](CLAUDE.md) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first.

## Ground rules

- **Privacy first.** The server must only ever see ciphertext. Never log, print or snapshot decrypted content.
- **Not a medical device.** No dose calculations, interaction checks, diagnoses, advice, reference ranges or
  threshold-triggered alerts. Views of a user's data stay descriptive.
- **No runtime third parties.** No analytics, CDNs, external fonts or calls to other services.
- **Synthetic data only** in tests, fixtures and seed data.
- **Every user-facing string goes through i18n** (`t()` from `$lib/i18n`), with English and Danish. `npm run lint` fails on
  hard-coded text.
- **Licences:** code dependencies MIT/BSD/ISC/Apache-2.0; assets CC0/CC-BY; fonts may also be OFL-1.1. New static files must
  be listed in `static/ASSET_LICENSES.json`. Ask before adding any dependency over 1 MB.

## Git workflow (gitflow)

- `main`: released code only; every commit is a tagged release. Never commit to it directly.
- `develop`: integration branch and the default branch.
- `feature/<short-kebab-name>`: one feature per branch, from the latest `origin/develop`, merged back by **squash** PR.
- `release/vX.Y.Z`: from develop when the owner asks; only version bump, changelog and release fixes; PR into main with a
  **merge commit**; after the owner tags it, PR main back into develop.
- `hotfix/vX.Y.Z`: from main for urgent fixes; PR into main (merge commit); after tagging, PR main back into develop.
- Since M2 nothing is committed directly to develop.
- Before opening a PR: merge the latest develop into your branch, make CI green, keep the PR small enough to review on a phone.
- PRs include: green CI, e2e run, phone-width screenshots (light and dark) of new or changed screens, a 5-line summary and
  open decisions.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, …);
  the changelog is generated from them. SemVer, 0.x until the public release. Only the owner creates tags.

## Local development

Requires Node 24 (see `.nvmrc`; Node 22.12+ works).

```sh
npm ci
npm run dev            # http://localhost:5173
npm run lint           # Prettier, ESLint, hard-coded string check
npm run check          # svelte-check / TypeScript
npm test               # unit tests (Vitest)
npm run licenses       # licence policy check
npm run audit          # npm audit, fails on high/critical
npm run test:e2e       # Playwright against the production build
```

Phone-width screenshots for a PR (375 × 812 at 2×, light and dark):

```sh
SCREENSHOTS=<branch-name> npx playwright test screenshots --project=phone-chromium
```

They are written to `docs/screenshots/<branch-name>/`. The component showcase is at `/styleguide` when the server runs with
`STYLEGUIDE=1` (the e2e server does).
