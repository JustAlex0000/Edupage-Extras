# Architecture

Edupage Extras is a Manifest V3 browser extension enhancing EduPage (school
portal), Chromium-first with a Firefox port. Plain JavaScript, no bundler, no
framework — everything under `scripts/` and `menu/` ships exactly as written.

## Layout

| Path | What it is |
|------|------------|
| `manifest.json` | MV3 manifest, shared by Chrome and Firefox |
| `scripts/` | Background script + all content scripts (shipped as-is) |
| `menu/` | Toolbar popup (`menu.html`) and options page (`settings.html`), each with its own JS and a shared i18n helper |
| `_locales/{en,sk,cs}/` | UI strings (`chrome.i18n`) |
| `tests/` | Node built-in test runner suites (no browser needed) |
| `scripts-dev/` | Release tooling (version sync, Chrome zip build, package verification) |

The Settings page presents its normal sections as one continuous searchable
document. Its sidebar buttons scroll to sections and follow the current scroll
position; on narrow screens the same controls become a sticky search field and
horizontal jump bar. Experimental remains a separate, non-searchable view. Its
warning acknowledgement is stored locally as the exact extension version so a
new version requires acknowledgement again.
| `.github/workflows/` | CI (`ci.yml`) and store publishing (`firefox-release.yml`) |

## Content scripts

Declared in `manifest.json` with `run_at: document_start` and
`all_frames: true`. Two consequences everything must respect:

- **`<body>` may not exist yet** when async callbacks (e.g.
  `chrome.storage.local.get`) fire. Anything appending to `document.body`
  must guard and defer to `DOMContentLoaded` (see `showUpdateToast` in
  `scripts/content.js`).
- **Scripts run in every frame**, including iframes and `about:blank`
  frames. Features that should act once per page must guard with
  `window.top === window`.

The grades scripts share `window.__eeGrades` and load in dependency order:
`grades-enhancer.js` provides orchestration/helpers, the focused feature
modules attach their APIs, and `grades-bootstrap.js` starts the enhancer last.
`grades-sort-filter.js` only operates on the primary table containing subject
rows. It moves each subject row together with its following category rows and
never modifies EduPage's separate floating header clone. The feature is
default-on but independently configurable; disabling it restores original
subject order, clears extension filtering, and leaves optional export actions
intact. Sorting/filtering state is page-local and is reset when EduPage replaces
or reloads the table.

Load order matters and is defined by the manifest `js` array:
`ua-ios-bootstrap.js` loads first as the isolated-world fallback described
below. `diagnostics.js` then installs early error capture (it exposes
`window.__eeDiagnostics`, and only ever sends data in response to an explicit
`ee-collect-page-diagnostics` message from the user-triggered "Report a
Problem" flow; the default snapshot is structure-only redacted). Then the
Activity Shield bridge, `content.js` (theming), and the per-page enhancers
(`timetable-`, `grades-`, `attendance-`, `ucivo-`, `etest-enhancer.js`,
`autologin.js`).

## iOS browser app compatibility

EduPage serves `/app/main` with `AscMobileAppVersion` even in an ordinary iOS
browser. Its app code also treats any truthy `window.webkit` as proof that
native request handlers exist. In Orion and Safari-compatible WebExtension
hosts this can hide the web login and route RPC/storage calls into native
handlers that never answer.

`ua-ios-fix.js` runs directly in the MAIN world where the manifest host
supports MV3's `world` key. Orion may ignore that key, so the first isolated
content script, `ua-ios-bootstrap.js`, also injects the packaged fix through a
narrow `web_accessible_resources` entry. The fix is top-level, iOS, and
`/app/*` only. It leaves the real iPhone platform/vendor visible, shadows the
UA needed by EduPage's login gate, and keeps the generic `window.webkit`
namespace hidden for that page's lifetime because EduPage repeats its
truthiness check for every RPC and lazy appstorage call. A genuine EduPage
message handler/native provider bypasses the browser compatibility behavior.

## FOUC prevention (theme cache)

`chrome.storage.local` is async, so a dark-themed page would flash white on
every navigation if styling waited for storage. Instead `content.js` caches
the last-applied theme settings in page `localStorage` (`eeThemeCacheV1`) and
paints from that synchronously at `document_start`, then reconciles with real
storage once it answers. `scripts/instant-theme.css` is the CSS half of this
mechanism — its rules are gated behind the classes the early paint applies.

## Theming

Themes are CSS variables (`--ee-*`, e.g. `--ee-link`, `--ee-accent`) defined
per theme in `content.js`. Enhancers inject their own `<style>` blocks that
reference those variables. Dark mode additionally runs a DOM normalizer
(MutationObserver-driven) that re-tags dynamically rendered light surfaces
with the dark surface classes.

## eTest copy model

`etest-enhancer.js` serializes question DOM into a small internal model instead
of copying raw `innerText`. The serializer preserves line structure, represents
inline answer fields as `___`, expands dropdown choices, separates ABCD options,
keeps each choice label and its text together, and marks selected choices inline.
Non-choice responses such as typed, dropdown, matching, and ordering answers use
a separate selected-answer section. The serializer allowlists the HTML/URL
surface used for rich clipboard output. Clipboard writes include both
`text/plain` and sanitized `text/html`, then fall back to a plain-text write when
rich clipboard APIs are unavailable.

The enhancer keeps in-memory snapshots of questions seen in the current test so
the whole-test action also works as a student moves through one-question pages.
Stable `data-cardid` identities prevent the changing question counter from
discarding or replacing earlier snapshots. Snapshots are never persisted and
are cleared when the player instance changes. A document-start observer handles
question UI inserted after the enhancer loads. Route changes also clear the
snapshot set. The `eeEtestIncludeAnswers` and `eeEtestIncludeImages` preferences
are default-on and only affect copied output. The default-on
`eeEtestQuestionButtonsEnabled` and `eeEtestWholeTestButtonEnabled` preferences
independently control the two button placements without disabling serialization.
The icon-only whole-test control reuses EduPage's action-button classes and keeps
its accessible name in `aria-label`/`title`; the per-question icon keeps an
explicit high-contrast dark-theme foreground.

## Activity Shield (three pieces)

- `activity-shield-main.js` runs in the **MAIN (page) world** — it patches
  `document.visibilityState`, `hasFocus`, `requestAnimationFrame`, etc. It
  has **no `chrome.*` access** by design.
- `activity-shield-bridge.js` runs in the normal isolated world and mirrors
  storage preferences onto a hidden `#ee-activity-shield-port` element's
  `dataset`, which the MAIN-world script reads.
- All its preferences are `eeActivityShield*` storage keys. The
  `edublurtesting.ct.ws` host entries in the manifest are its test page.

## Background script

`scripts/background.js` is registered **both** as `service_worker` (Chrome)
and as event-page `scripts` (Firefox) in the manifest — intentional; keep
both. Firefox quirks live behind the `IS_FIREFOX` flag (e.g.
`notifications.create` with `buttons` silently rejects on Firefox, so the
option is omitted there).

Update checks fetch `manifest.json` from `raw.githubusercontent.com` (see
`host_permissions`) and compare versions; releases are tags plus GitHub
Releases generated by the tag-push workflow.

## Storage conventions

Keys are camelCase in `chrome.storage.local`. Newer keys are prefixed `ee`
(e.g. `eeMobileResponsiveEnabled`); legacy ones are unprefixed
(`darkModeEnabled`) and stay that way for compatibility.

School-specific grade-title overrides are nested by EduPage origin; legacy
flat maps migrate under the current origin. Structured attendance and
timetable caches use the same origin boundary, expire after 15 and 10 minutes
respectively, and prune stale buckets during normal reads/writes. Settings →
Debug can remove both reconstructible caches without touching preferences or
user-authored grade data.

## Tests

`npm test` runs Node's built-in test runner over `tests/*.test.js`. Tests
read the content-script **source text** and execute it in a `vm` sandbox with
stubbed `chrome.*` APIs — no browser involved. Each testable script contains
a deliberate hook: when `globalThis.__EE_TEST__` is set (tests only, never
the real extension), it publishes its internals on
`globalThis.__eeTestExports`. Renaming or removing an exported function fails
loudly at the export site — keep the hook's export list in sync when
refactoring.

## Release flow

See [CONTRIBUTING.md](CONTRIBUTING.md#releases). Short version: versions are
bumped only via `npm version` (a lifecycle hook syncs `manifest.json`), every
bump gets a `CHANGELOG.md` entry in the same commit, and pushing a matching
`vX.Y.Z` tag triggers the workflow that tests, builds, publishes to the
Chrome Web Store + AMO, and creates the GitHub Release.

Both browser builders stage only the paths declared in
`scripts-dev/package-policy.js`; Firefox packaging and signing never operate
directly on the working tree. Browser-specific verification selects the exact
current-version archive and rejects every entry outside the shared allowlist.
Normal CI builds and verifies both packages before release time.
