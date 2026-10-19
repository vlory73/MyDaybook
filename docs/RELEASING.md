# Releasing and deploying

How a new version gets from `develop` to the Raspberry Pi. It follows the gitflow rules in [CLAUDE.md](../CLAUDE.md) and
[CONTRIBUTING.md](../CONTRIBUTING.md). Versions follow SemVer and stay on `0.x` until the public release: new features bump
the minor version (0.1.0 → 0.2.0); fixes only bump the patch version (0.2.0 → 0.2.1).

**The short version:** release branch → PR into `main` (merge commit) → GitHub release `vX.Y.Z` → automatic image → PR
`main` back into `develop` → change the tag on the Pi.

---

## Part 1: One-time setup (done for 0.1.0)

These were done once and don't need repeating. They're listed so a fresh start is possible.

1. **Public image.** After the first image was published, the `mydaybook` package on GitHub (profile → Packages →
   *Package settings*) was set to **Public** and linked to the repository. The Pi then pulls without a token.
2. **Branch protection.** Rulesets for `develop`, `main` and `v*` tags (CONTRIBUTING.md, "Branch protection").
3. **First deployment on the Pi** (README, "Run on a Raspberry Pi"):
   ```sh
   mkdir -p ~/mydaybook/data ~/mydaybook/backup && cd ~/mydaybook
   sudo chown 1000:1000 data backup
   # copy compose.yaml and .env.example (saved as .env) from the repo at the release tag; check PUBLIC_URL etc. in .env
   docker run --rm ghcr.io/vlory73/mydaybook:X.Y.Z gen-secrets >> .env
   chmod 600 .env
   docker compose up -d
   curl -s http://127.0.0.1:8090/healthz          # {"status":"ok"}
   ```
4. **First admin**, in your own terminal (the link is a one-time credential):
   `docker compose exec app cli invite --admin`.
5. **Backups:** the app dumps at 23:30 into `~/mydaybook/backup`; the Home Assistant session copies that folder to the NAS at
   00:00 (docs/HOME_DEPLOYMENT.md).

---

## Part 2: Every release

The example uses **0.2.0**; replace it with the version you're releasing.

### What you need

- A computer with **git** and **Node 24** (`node --version`).
- A local clone of the repository (`git clone https://github.com/vlory73/MyDaybook.git`).
- Every feature PR for this release merged into `develop`, with CI green.

### Step 1: Create the release branch

```sh
cd MyDaybook
git fetch origin --tags
git switch -c release/v0.2.0 origin/develop
```

### Step 2: Bump the version

```sh
npm version 0.2.0 --no-git-tag-version      # updates package.json and package-lock.json, makes no tag
```

Then change the pinned image tag from the old version to `0.2.0` in these three places, by hand:

| File | Line to change |
| --- | --- |
| `compose.yaml` | `image: ghcr.io/vlory73/mydaybook:0.2.0` |
| `README.md` | `docker run --rm ghcr.io/vlory73/mydaybook:0.2.0 gen-secrets >> .env` |
| `.env.example` | `#   docker run --rm ghcr.io/vlory73/mydaybook:0.2.0 gen-secrets >> .env` |

Check that you found them all (only `CHANGELOG.md` and the docs history should still mention the old version):

```sh
git grep -n "mydaybook:0\.1\.0"
```

### Step 3: Write the changelog

```sh
node scripts/changelog.mjs 0.2.0
```

This adds a `## 0.2.0 (date)` section to the top of `CHANGELOG.md`. It is built from the commits since the last tag
(`v0.1.0`), grouped into Features, Fixes, Documentation and so on. Open `CHANGELOG.md` and read the new section. You may reword
lines or delete noise, but keep the heading line exactly as it is: the release workflow looks it up by version.

### Step 4: Commit, push and open the PR into main

```sh
git add -A
git commit -m "chore(release): 0.2.0"
git push -u origin release/v0.2.0
```

On GitHub, open a pull request with **base: `main`** and **compare: `release/v0.2.0`**. The title is
`Release 0.2.0`; the description can be the changelog section.

Wait for CI to go green. If it goes red, fix it on the release branch (only release fixes belong there; features wait for the
next version), push, and wait again.

### Step 5: Merge with a merge commit

Merge the PR with **"Create a merge commit"** (not squash). The merge box may not show the choice as a dropdown arrow if only
one method is allowed for `main`; the button then says "Merge pull request" and makes a merge commit.

### Step 6: Publish the GitHub release

1. On GitHub: **Releases → Draft a new release**.
2. **Choose a tag:** type `v0.2.0` and pick "Create new tag: v0.2.0 on publish".
3. **Target:** `main`.
4. **Title:** `0.2.0`. You can leave the notes empty or write a line of your own; the changelog is added above it
   automatically.
5. Click **Publish release**.

The tag must be exactly `v` + the version in `package.json`, and it must point at `main`. The workflow refuses anything
else, and you fix it by deleting the release and the tag and publishing again.

### Step 7: Let the Release workflow finish

**Actions → Release** runs for about 5 minutes. It:

- checks the tag, the version and the branch;
- builds the image for amd64 and arm64 and publishes `ghcr.io/vlory73/mydaybook:0.2.0` and `:latest`;
- starts the arm64 image as a smoke test;
- puts the changelog section into the release notes.

The **Assets** list on the release (Source code zip/tar.gz) is GitHub's automatic source archive, not the image. The image is
under the repository's **Packages**.

Optional check from any machine with Docker:

```sh
docker manifest inspect ghcr.io/vlory73/mydaybook:0.2.0 | grep architecture    # amd64 and arm64
```

### Step 8: Merge main back into develop

On GitHub, open a pull request with **base: `develop`** and **compare: `main`**, titled
`Merge main back into develop after 0.2.0`. Wait for CI, then merge it with **"Create a merge commit"** (not squash). This
brings the version bump and changelog into `develop`.

Afterwards, delete the `release/v0.2.0` branch if GitHub didn't do it automatically.

---

## Part 3: Deploying to the Pi

Upgrades happen only on purpose: the Pi runs the tag pinned in `~/mydaybook/compose.yaml`, never `:latest`.

### Option A: ask the Home Assistant session

Send it something like:

```text
APP UPDATE: mydaybook 0.2.0 is released (ghcr.io/vlory73/mydaybook:0.2.0, amd64 + arm64).
In ~/mydaybook: take a backup first (docker compose exec app cli backup), change the image tag in compose.yaml to 0.2.0,
docker compose pull && docker compose up -d, then check http://127.0.0.1:8090/healthz and docker compose logs --tail 50 app.
Compare compose.yaml and .env.example with the repo at tag v0.2.0 and report any difference before changing them.
```

### Option B: do it yourself on the Pi

```sh
cd ~/mydaybook
docker compose exec app cli backup                 # a fresh, verified backup before upgrading; prints the file name
sed -i 's|mydaybook:0\.1\.0|mydaybook:0.2.0|' compose.yaml
grep image: compose.yaml                           # should show :0.2.0
docker compose pull
docker compose up -d
curl -s http://127.0.0.1:8090/healthz              # {"status":"ok"}
docker compose logs --tail 50 app                  # look for errors; "migrate" lines are normal after an update
```

Then open the app on your phone. The installed app picks up the new version on its next start; if it still looks old, close it
completely and open it again.

**When `compose.yaml` or `.env.example` changed in the release:** the release notes and the PR into `main` show it. Compare
them with your copies on the Pi (`.env` holds your secrets, so add new settings to it by hand; never replace it).

### If something goes wrong: roll back

1. Put the old tag back in `compose.yaml` (`0.1.0`) and run `docker compose up -d`.
2. If the new version changed the database, the old version may refuse to start. The app copies the database automatically
   before every database change, into `~/mydaybook/data/backups/`; the nightly and manual dumps are in
   `~/mydaybook/backup/db/`. Restoring one means stopping the app and replacing `~/mydaybook/data/app.db` with that copy.
   Ask a Claude session for help with this step rather than guessing, and keep the newer database file aside, not deleted.

---

## Quick checklist

- [ ] Every feature PR merged into `develop`, CI green
- [ ] `release/vX.Y.Z` from `origin/develop`
- [ ] `npm version X.Y.Z --no-git-tag-version`
- [ ] Image tag updated in `compose.yaml`, `README.md`, `.env.example`
- [ ] `node scripts/changelog.mjs X.Y.Z`, section reviewed
- [ ] Commit `chore(release): X.Y.Z`, push, PR into `main`, CI green
- [ ] Merged with a merge commit
- [ ] GitHub release with tag `vX.Y.Z` on `main` published
- [ ] Release workflow green, image has amd64 + arm64
- [ ] PR `main` → `develop`, merged with a merge commit
- [ ] Backup taken, tag changed and app restarted on the Pi; `/healthz` ok
