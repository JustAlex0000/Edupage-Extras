# Architecture

Edupage Extras is a plain-JavaScript Manifest V3 extension for the EduPage
portal. There is no framework or build step during development: the files in
`scripts/` and `menu/` are the files that ship.

## Map

- `manifest.json` declares permissions, script order, commands, and extension
  pages.
- `scripts/lib/ee-common.js` is loaded first and contains shared defaults and
  theme data.
- `scripts/background.js` handles browser events, commands, update checks,
  optional AI-provider requests, notifications, and calendar exports.
- `scripts/content.js` applies themes and shared page styling. The remaining
  `scripts/*-enhancer.js` files are narrow, page-specific additions.
- `scripts/grades-*.js` share `window.__eeGrades`; the bootstrap module starts
  them after their dependencies load.
- `scripts/etest-enhancer.js` owns eTest copying and the experimental question
  helper UI.
- `menu/` contains the toolbar popup and settings page. `menu/i18n.js` maps
  strings from `_locales/{en,sk,cs}/messages.json`.
- `tests/` runs with Node's built-in test runner. `scripts-dev/` contains
  versioning and package checks.

## Runtime rules

Content scripts run at `document_start` in every frame. Code that inserts into
the page must wait for a body, and a feature that should run once must guard
with `window.top === window`. Enhancers should be idempotent: use a path guard,
a storage setting, a bounded observer, cleanup, and re-apply after EduPage
renders new content.

The manifest script order is deliberate. Keep shared libraries before their
consumers, grade modules before `grades-bootstrap.js`, and page bridges before
the script they support.

## Themes

Theme settings are read from `chrome.storage.local`. Because storage is async,
`content.js` keeps the last theme state in page `localStorage` and paints it at
document start; `scripts/instant-theme.css` prevents a white flash while the
real value loads. Keep that cache compatible with `EE.DEFAULT_CUSTOM_THEME`.

Theme colors belong in `--ee-*` variables. The dark-mode normalizer observes
newly rendered content and marks only known light surfaces. Avoid broad rules
that invent borders or boxes around EduPage's otherwise continuous layouts.

## Grades and eTest

Grades sorting/filtering works on the real subject table and moves a subject
with its following category rows. Never modify `#znamkyTableHeaderBg` or
EduPage's floating header clone: EduPage keeps them in sync itself.

The eTest serializer creates a small structured question model rather than
storing page text. It keeps snapshots in memory for the current player only;
they are cleared when the player or route changes.

Test Question Helper is experimental and WIP. It is disabled by default and
sends data only after the student presses its question action. Credentials stay
in extension storage, never in the page. Providers are fixed remote origins or
loopback-only local endpoints. Suggestions never submit an answer; live
provider and complex eTest interaction coverage still need manual testing.

## Settings and storage

Use camelCase storage keys; new keys begin with `ee`. Keep the three locale
files on the same key set. Experimental settings stay isolated behind their
acknowledgement view and must not appear in normal settings search.

## Checks and releases

Run `npm test` after code changes, then use the Firefox lint/build and package
verification commands from [CONTRIBUTING.md](CONTRIBUTING.md). Package builders
use an explicit allowlist, so local notes and captures cannot enter a release.
Versioning and tagged release flow are also documented there.
