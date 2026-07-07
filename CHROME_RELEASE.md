# Publishing to the Chrome Web Store — one-time setup, then automatic

Same story as Firefox (see `FIREFOX_RELEASE.md`): the first version must be
uploaded by hand on the developer dashboard, but every version after that is
submitted automatically by the same tag-triggered workflow
(`.github/workflows/firefox-release.yml`) via the Chrome Web Store API.

Chrome gets its own zip: `npm run build:chrome` strips the Firefox-only
manifest keys (`background.scripts`, `browser_specific_settings`) that the
Web Store validator rejects. Never upload the Firefox `.xpi`/`.zip` to Chrome.

---

## Step 1 — Developer account + first manual upload

1. Go to <https://chrome.google.com/webstore/devconsole>, sign in with a Google
   account, and pay the **one-time $5 registration fee**.
2. Build the Chrome package locally:
   ```sh
   npm install
   npm run build:chrome
   ```
   This creates `web-ext-artifacts/edupage_extras-<version>-chrome.zip`.
3. Click **New item** and upload that zip.
4. Fill out the listing: description, category, at least one 1280×800 (or
   640×400) screenshot, and a 128×128 icon (already in `images/`).
5. **Privacy tab** — required before you can submit:
   - Single purpose description (enhances EduPage school-portal pages).
   - Justify each permission: `storage` (settings), `tabs` (applying settings
     to open EduPage tabs), `alarms` + `notifications` (update checks),
     host access to `*.edupage.org` (the pages it enhances),
     `raw.githubusercontent.com` (fetching `manifest.json` for the update
     check), `edublurtesting.ct.ws` (Activity Shield test page — expect the
     reviewer to ask about this one; consider dropping it from the Chrome
     build if it causes friction).
   - Data usage: declare that no user data is collected or transmitted
     (`diagnostics.js` only sends data on an explicit user action).
6. Submit for review. First reviews typically take a few days.

After approval the extension has a permanent ID (visible in the dashboard
URL and on the item page) — you'll need it in Step 2.

## Step 2 — API credentials for CI

The upload API uses Google OAuth, not a simple API key. One-time dance:

1. Open <https://console.cloud.google.com/>, create a project (any name).
2. **APIs & Services → Library** → enable **Chrome Web Store API**.
3. **APIs & Services → OAuth consent screen** → External, fill the minimal
   required fields, add your own Google account as a **test user** (the app
   can stay in "Testing" — but note Google expires testing-mode refresh
   tokens after 7 days, so either publish the consent screen or expect to
   re-mint the token; publishing it for a single-user internal tool is fine).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Desktop app**. Copy the **client ID** and **client secret**.
5. Mint a refresh token — easiest with the CLI already in devDependencies:
   ```sh
   npx chrome-webstore-upload-keys
   ```
   It walks you through the browser consent flow and prints the
   `REFRESH_TOKEN`.

## Step 3 — GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions** → add:

| Secret               | Value                                  |
| -------------------- | -------------------------------------- |
| `CWS_EXTENSION_ID`   | the extension ID from Step 1           |
| `CWS_CLIENT_ID`      | OAuth client ID from Step 2            |
| `CWS_CLIENT_SECRET`  | OAuth client secret from Step 2        |
| `CWS_REFRESH_TOKEN`  | refresh token from Step 2              |

The workflow skips the Chrome upload step (without failing) until these
exist, so Firefox releases are never blocked by this.

## Step 4 — Release

Identical to Firefox: bump the version, tag, push the tag
(see `FIREFOX_RELEASE.md` Step 4). The workflow uploads to both stores.
The Chrome upload uses `--auto-publish`, which submits straight into review;
after Google approves, users update automatically.

To upload manually from your machine instead, export the same four values as
env vars (`EXTENSION_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN`) and
run `npm run upload:chrome`.

## Notes

- Every upload needs a strictly higher version, same as AMO — if a review
  fails, bump and re-tag.
- The in-extension update toast (which checks `manifest.json` on GitHub) is
  independent of store updates and keeps working as-is.
- Chrome Web Store reviews re-run on every permission change; adding a new
  host permission later will re-prompt users and can temporarily disable the
  extension for them until they approve, so batch such changes deliberately.
