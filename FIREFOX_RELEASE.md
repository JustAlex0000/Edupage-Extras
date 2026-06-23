# Publishing to Firefox Add-ons (AMO) — one-time setup, then automatic

This repo has a GitHub Actions workflow (`.github/workflows/firefox-release.yml`)
that builds, lints, tests, and submits the extension to
[addons.mozilla.org](https://addons.mozilla.org) (AMO) whenever you push a
version tag like `v0.7.0`. After the **one-time setup below**, releasing is just:

```sh
git tag v0.7.0
git push origin v0.7.0
```

No manual upload, ever again — once Mozilla approves a version, everyone with
the extension installed updates automatically.

---

## Step 1 — Create the add-on on AMO (manual, only once)

AMO's submission API can publish *updates* to an existing listing, but the
**very first version** of a new add-on has to be created through the website
once, including filling out the listing (name, description, screenshots,
category). After that, every later version can go through the API/CI.

1. Go to <https://addons.mozilla.org/developers/> and sign in (or create a free
   account).
2. Click **Submit a New Add-on**.
3. Build a signed package locally and upload that file when asked:
   ```sh
   npm install
   npm run build:firefox
   ```
   This creates a `.xpi` (technically a `.zip`) in `web-ext-artifacts/`. Upload
   that.
4. Choose **"On this site"** (listed) distribution so it gets a public AMO
   page and auto-updates for users.
5. Fill out the listing details and submit for review. Mozilla's automated +
   human review can take anywhere from minutes to a few days for a first
   submission.

Once this first version is approved, your add-on has a permanent ID (it's
already pinned in `manifest.json` as
`browser_specific_settings.gecko.id`, so this won't change between versions).

## Step 2 — Get API credentials for CI

1. While signed in to AMO, go to
   <https://addons.mozilla.org/developers/addon/api/key/>.
2. Click **Generate new credentials**.
3. You'll get a **JWT issuer** (looks like `user:1234567:890`) and a
   **JWT secret** (a long random string). Copy both — the secret is only shown
   once.

## Step 3 — Add them as GitHub repository secrets

1. On GitHub, open this repo → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add:
   - Name: `AMO_JWT_ISSUER` → value: the JWT issuer from Step 2.
   - Name: `AMO_JWT_SECRET` → value: the JWT secret from Step 2.

These are encrypted by GitHub and only exposed to the workflow at run time —
they never appear in logs or to anyone browsing the repo.

## Step 4 — Release

Bump the version in both `manifest.json` and `package.json` (they should
always match), commit, then tag and push:

```sh
git add manifest.json package.json
git commit -m "Bump version to 0.7.0"
git tag v0.7.0
git push origin main v0.7.0
```

Pushing the tag triggers the workflow. Watch it run under the repo's
**Actions** tab. On success, the new version is submitted to AMO for review —
check **addons.mozilla.org/developers** to see its status. You can also
re-trigger the workflow manually from the Actions tab (`workflow_dispatch`)
without pushing a new tag, e.g. to retry a failed run.

## Notes

- The Chrome Web Store has the same two-step story (one manual first listing,
  then API-driven updates) if you want to automate that side too later — ask
  and it can be added as a second job in the same workflow.
- `npm run lint:firefox` / `npm run build:firefox` / `npm run run:firefox` all
  work locally too, for testing before you tag a release.
- If a release fails review, fix the issue, bump the version again (AMO
  requires every upload to have a unique version number), and re-tag.
