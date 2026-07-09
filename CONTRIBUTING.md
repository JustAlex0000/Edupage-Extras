# Contributing

Thanks for helping improve Edupage Extras! Start with
[ARCHITECTURE.md](ARCHITECTURE.md) for how the extension is put together.

## Setup

```sh
git clone https://github.com/Alexosavrua/Edupage-Extras.git
cd Edupage-Extras
npm ci
```

There is no build step for development — load the repo directory directly:

- **Chrome/Edge:** `chrome://extensions` → enable Developer mode → "Load
  unpacked" → pick the repo root.
- **Firefox:** `npm run run:firefox` (web-ext launches a profile with the
  extension), or `about:debugging` → "Load Temporary Add-on" →
  `manifest.json`.

## Tests

```sh
npm test
```

Node's built-in test runner over `tests/*.test.js`. Tests read content-script
source, string-replace anchor lines to expose internals, and run the result
in a `vm` sandbox with stubbed `chrome.*`. **Caveat:** if your refactor
changes a line a test anchors on, the test breaks silently at load — run
`npm test` after touching any file that has a matching `tests/*.test.js`, and
update the anchors in the same change.

`npm run lint:firefox` runs web-ext lint (also run by CI on every push/PR).

## Conventions

- Storage keys: camelCase, new keys prefixed `ee` (e.g.
  `eeMobileResponsiveEnabled`); legacy unprefixed keys stay as-is.
- DOM ids/classes the extension injects: `ee-` prefix.
- Theme colors: use the `--ee-*` CSS variables, never hardcoded colors.
- Firefox-specific behavior: gate behind `IS_FIREFOX` in `background.js` /
  `window.eeI18n.isFirefox` in menu pages.
- Tests assert structural invariants (switch markup, a11y labels) as well as
  parsing logic — update them when touching `menu/` markup.
- Plain commit messages; **no `Co-Authored-By` or similar trailers.**

## Adding a feature (enhancer)

Every page enhancer follows the same skeleton — top-frame guard → path guard
→ storage toggle key → MutationObserver with debounce → `enhance()` →
cleanup when disabled → `storage.onChanged` re-apply. Start from
[`scripts/_template-enhancer.js`](scripts/_template-enhancer.js) (a
copy-paste skeleton with TODO markers, excluded from store packages) or see
existing enhancers in `scripts/` (e.g. `ucivo-enhancer.js`).

A new feature touches four places:

1. `manifest.json` — add the script to the content-script `js` array.
2. `menu/settings.html` + `menu/settings.js` — a settings row with a toggle.
3. `_locales/en`, `_locales/sk`, `_locales/cs` — strings for the toggle
   label/description (all three locales must keep identical key sets).
4. `tests/` — a test covering the new parsing/markup.

Decide default-on vs default-off: cosmetic/enhancement features that are safe
everywhere default on; anything that changes page behavior or is
school-specific defaults off.

## Releases

(Maintainer-only.) Never hand-edit the version in `package.json` or
`manifest.json`:

1. Add a `## X.Y.Z — YYYY-MM-DD` section at the top of `CHANGELOG.md`.
2. `npm version patch|minor|major --no-git-tag-version` — the `version`
   lifecycle hook syncs `manifest.json` and stages it.
3. Commit as `upd X.Y.Z <description>` (changelog + bump in the same
   commit).
4. `git tag vX.Y.Z` — must exactly match `package.json`; the workflow's
   guard step fails the run otherwise.
5. `git push origin main --tags` — the tag triggers
   `.github/workflows/firefox-release.yml`: tests, lint, builds, publishes
   to the Chrome Web Store and AMO, and creates the GitHub Release with
   notes from `CHANGELOG.md`.
6. Verify the run succeeded (`gh run watch`) — a green tag push doesn't
   guarantee the publish steps passed.
