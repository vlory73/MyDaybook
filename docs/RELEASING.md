# Releasing and deploying

How a new version gets from `develop` to the Raspberry Pi. It follows the gitflow rules in [CLAUDE.md](../CLAUDE.md) and
[CONTRIBUTING.md](../CONTRIBUTING.md). Versions follow SemVer and stay on `0.x` until the public release: new features bump
the minor version (0.1.0 → 0.2.0); fixes only bump the patch version (0.2.0 → 0.2.1).

**The short version:** release branch (a button on GitHub, or one command) → PR into `main` (merge commit) → GitHub release `vX.Y.Z` → automatic image → PR
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

The example uses **0.2.0**; replace it with the version you're releasing. Before you start, every feature PR for this release
must be merged into `develop`, with CI green.

Steps 1 to 4 prepare the release branch. There are two routes; pick either one each time. Both produce the same branch,
and steps 5 to 8 are the same for both.

- **Route A, in the browser:** the "Prepare release" button on GitHub does steps 1 to 3 for you. Nothing to install.
- **Route B, on your computer:** you run the same preparation yourself. Needs git and Node 22.12 or newer.

### Route A: in the browser

**Step 1. Run "Prepare release".** On GitHub: **Actions** → **Prepare release** (left column) → **Run workflow**. Leave
"Use workflow from" on `develop`, type the version (`0.2.0`, without a `v`) and click **Run workflow**.

**Step 2. Wait for the green tick** (about a minute), then open the run. Its summary shows the new changelog section and a
link: **open the pull request into main**.

- If the run is red, open it to read why. Common reasons: the version is not X.Y.Z, it is not higher than the current one,
  or `release/v0.2.0` already exists (delete that branch under **Branches** and run again).

**Step 3. Review the changelog** (optional). The section is generated from the commit titles since the last release. To
reword it, open the branch `release/v0.2.0`, open `CHANGELOG.md`, click the pencil icon, edit and **Commit changes**
directly to `release/v0.2.0`. Keep the heading line `## 0.2.0 (date)` exactly as it is.

**Step 4. Open the PR.** Click the link from step 2. It opens a pull request with **base: `main`** and
**compare: `release/v0.2.0`**, titled `Release 0.2.0`. Click **Create pull request** and wait for CI to go green.

Continue with step 5 below.

### Route B: on your computer

You need **git**, **Node 22.12 or newer** (`node --version`) and a clone of the repository
(`git clone https://github.com/vlory73/MyDaybook.git`).

**Step 1. Create the release branch.**

```sh
cd MyDaybook
git fetch origin --tags
git switch -c release/v0.2.0 origin/develop
```

**Step 2. Prepare it with one command.**

```sh
node scripts/release-prep.mjs 0.2.0
```

It does three things and commits nothing:

- sets the version in `package.json` and `package-lock.json`;
- moves the pinned image tag (`ghcr.io/vlory73/mydaybook:0.1.0` → `0.2.0`) in `compose.yaml`, `README.md` and
  `.env.example`;
- adds a `## 0.2.0 (date)` section to the top of `CHANGELOG.md`, built from the commits since the last tag (`v0.1.0`).

It stops with a message if the version is not higher than the current one, or if a file no longer names the old tag.

<details>
<summary>Without the script (fully by hand)</summary>

1. In `package.json`, change `"version"` to `"0.2.0"`. Then run `npm install --package-lock-only` to update
   `package-lock.json` (or change the two `"version"` lines at the top of `package-lock.json` by hand).
2. Change `mydaybook:0.1.0` to `mydaybook:0.2.0` in `compose.yaml`, `README.md` and `.env.example`. Check with
   `git grep -n "mydaybook:0\.1\.0"`: only the docs history may still name the old version.
3. Run `node scripts/changelog.mjs 0.2.0`, or write the section yourself at the top of `CHANGELOG.md`, under `# Changelog`:
   `## 0.2.0 (YYYY-MM-DD)`, then `### Features` / `### Fixes` lists.

</details>

**Step 3. Review the changelog.** Open `CHANGELOG.md` and read the new section. You may reword lines or delete noise, but
keep the heading line exactly as it is: the release workflow looks it up by version.

**Step 4. Commit, push and open the PR into main.**

```sh
git add -A
git commit -m "chore(release): 0.2.0"
git push -u origin release/v0.2.0
```

On GitHub, open a pull request with **base: `main`** and **compare: `release/v0.2.0`**, titled `Release 0.2.0`. Wait for CI
to go green.

### Both routes: if CI is red on the release PR

Fix it on the release branch (only release fixes belong there; features wait for the next version), push, and wait again.
Or ask a Claude session to look at the failing check.

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
- [ ] `release/vX.Y.Z` prepared: **Actions → Prepare release** (route A) or `node scripts/release-prep.mjs X.Y.Z` + commit +
      push (route B)
- [ ] Changelog section reviewed
- [ ] PR `release/vX.Y.Z` → `main` opened, CI green
- [ ] Merged with a merge commit
- [ ] GitHub release with tag `vX.Y.Z` on `main` published
- [ ] Release workflow green, image has amd64 + arm64
- [ ] PR `main` → `develop`, merged with a merge commit
- [ ] Backup taken, tag changed and app restarted on the Pi; `/healthz` ok
