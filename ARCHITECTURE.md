# Architecture

Edupage Extras is a plain-JavaScript Manifest V3 extension for the EduPage
portal. There is no framework or build step during development: the files in
`scripts/` and `menu/` are the files that ship.

## Map

- `manifest.json` declares permissions, script order, commands, and extension
  pages.
- `scripts/lib/ee-common.js` is loaded first and contains shared defaults and
  theme data.
- `scripts/lib/ee-i18n.js` follows the common library in extension pages, content
  scripts and both background runtimes. `eeLanguage` stores auto/en/sk/cs,
  independently of the theme. `EE.getMessage` and `EE.getUILanguage` use the
  selected bundled catalog, falling back to English and then native i18n.
  Catalog reads go through the worker's `ee-language-catalog` message, restricted
  to en/sk/cs and this extension's own packaged files; no external requests or
  additional resource permissions are needed. The shared ready promise and
  change subscriptions avoid startup races, while revision checks reject stale
  responses. `menu/language-settings.js` saves the Appearance selector; existing
  EduPage tabs can be refreshed to translate all already-rendered extension UI.
- `scripts/background.js` handles browser events, commands, update checks,
  optional AI-provider requests, notifications, and calendar exports.
- `scripts/content.js` applies themes and shared page styling. The remaining
  `scripts/*-enhancer.js` files are narrow, page-specific additions.
- `scripts/lib/ee-anonymizer.js` is loaded after `ee-common.js` and before
  `content.js`, which applies its state independently of the dark theme. It
  requests the current account's full name from `scripts/anonymizer-main.js`,
  which runs in MAIN and reads `$j('#edubar').edubar('option', 'loggedUserName')`.
  Only the name crosses the isolated-world boundary as a transient string event,
  and it is requested only while enabled. Native profile DOM is a fallback until
  the widget is ready. DOM/script loading and account changes trigger a refresh
  without polling. The enhancer observes
  inserted content and text changes, and replaces whole-name matches in text,
  title, aria-label and alt attributes. Original values stay in memory and are
  restored only when the page has not since changed them. Removed fragments are
  restored and released. Scripts and editable controls are excluded.
  `eeHidePersonalInfoEnabled` remains the toggle; `eeAnonymizerAlias` is the
  normalized, 80-character, extension-local display name, defaulting to Anonymous.
  It is propagated through the shared theme-message contract but excluded from
  page localStorage and diagnostic summaries. `menu/anonymizer-settings.js`
  handles debounced autosave, first-use defaults, visibility and save failures.
- `scripts/grades-*.js` share `window.__eeGrades`; the bootstrap module starts
  them after their dependencies load.
- `scripts/etest-enhancer.js` owns eTest copying and the experimental question
  helper UI.
- `scripts/etest-results-bridge.js` passes the opt-in `eeEtestResultsEnabled`
  preference to `etest-results-main.js` in the page world. The latter wraps
  only `zobrazovatOtazky` for the signed-in student's loaded results in the
  `l2or3` results view, independently of evaluation status names. Missing result
  rows, other users, and other levels retain native behavior.
  `zobrazovatSpravne` and the print renderer stay untouched. Secured responses
  omit the answer key, and widget loading can synthesize a first-option default
  that must never be presented as an actual solution. The original is restored
  when disabled, with event-driven retries and a bounded observer.
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
`content.js` keeps the last theme state in page `localStorage`; the early
`theme-bootstrap.js` applies its class at document start. Both
`scripts/instant-theme.css` and `scripts/theme-static.css` are manifest-loaded
before page DOM/scripts, so stable page, card, and text rules are ready for the
first paint. `content.js` only applies custom properties and normalizes newly
rendered unknown surfaces. Keep the cache compatible with
`EE.DEFAULT_CUSTOM_THEME`.

Theme colors belong in `--ee-*` variables. The dark-mode normalizer observes
newly rendered content and marks only known light surfaces. Avoid broad rules
that invent borders or boxes around EduPage's otherwise continuous layouts.

## Timetable comparison

`scripts/lib/ee-timetable-comparison.js` owns calendar validation, sample-week
templates, civil-date A/B repetition, group filtering, and shared-gap calculation.
`scripts/timetable-comparison-ui.js` provides the inline editor exclusively in
Settings → Timetable; `scripts/timetable-comparison.js` adds a compact finish-time
strip above the native weekly grid and a single expandable row below the home
widget. Native timetables stay visible. Their rendered lessons supply the first
schedule without opening a background tab. Weekly route detection accepts both
`mode=timetable` and base64 `eqa` links. Scoped observers handle native timetable
replacement; the home row is mounted after `.userRozvrh` so its periodic native
refresh cannot remove the comparison. Rebinding to an identical native schedule
retains the row, disclosures, focus, and in-flight reads. Current/next labels
update at lesson boundaries without polling.
`eeTimetableComparisonEnabled` defaults off independently of saved data; no
injected controls, discovery observers, or live requests run while it is off.
Setup, edit, removal, and the master switch exist only in Settings. Settings use
the established setting-card/switch/secondary-button components and shared radius
tokens. Turning off or removing a comparison also closes its active temporary
tabs and invalidates in-flight cache writes.

`eeTimetableComparisons` stores a versioned local collection of stable IDs,
normalized profiles, and the selected ID. `eeTimetableComparison` remains the
active-profile projection consumed by page scripts and cache cleanup; Settings
updates both keys in one storage write. The previous single profile is preserved
as the first saved schedule on the first library change. Adds select the new
schedule; edits retain its ID; removing the selected schedule chooses the first
remaining one or clears the active profile. Failed writes preserve both values.
Original calendar files and unrelated event metadata are discarded. Diagnostics
omit both storage keys and the entire comparison DOM. No additional permissions or external services
are used. Calendar support is deliberately limited to dated same-day lessons,
floating/local-zone times, and UTC stamps; unsupported recurrence/timezone forms
are rejected before replacing saved data.

`scripts/timetable-comparison-background.js` uses bounded temporary EduPage tabs
and a ten-minute in-memory cache keyed by school, owner/class, and week. It checks
the sender origin, requested dates, class identity, and normalized lessons before
caching. Removal/changes clear the cache and invalidate in-flight cache writes.
No live comparison data is persisted. Firefox loads this background module after
the shared model and main background script; Chromium imports it in its worker.

The timetable reader selects EduPage's native My timetable/Classes controls,
supports text and compact icon navigation, AM/PM and 24-hour period headers,
and dotted/slashed dates. Period order disambiguates compact English afternoon
times without AM/PM. Passive caching of the currently viewed timetable was
removed because it cannot distinguish another class from the user's own data;
the legacy export cache version was incremented to invalidate ambiguous entries.

## Grades and eTest

Grades sorting/filtering works on the real subject table and moves a subject
with its following category rows. Never modify `#znamkyTableHeaderBg` or
EduPage's floating header clone: EduPage keeps them in sync itself.

The eTest serializer creates a small structured question model rather than
storing page text. It keeps snapshots in memory for the current player only;
they are cleared when the player or route changes.

Test Question Helper is experimental and WIP. It is disabled by default and
sends data only after the student presses its question action. Credentials stay
in extension storage, never in the page, and are isolated per provider so
switching providers preserves each configuration. OpenAI, Gemini, NVIDIA, and OpenRouter
use fixed optional origins requested from the Connection action; Ollama and LM
Studio are loopback-only local endpoints. Gemini keys are sent in a request
header, never in the URL. Suggestions never submit an answer; the visual
fallback is separately opt-in, while live provider and complex eTest interaction
coverage still need manual testing.

## Settings and storage

Use camelCase storage keys; new keys begin with `ee`. Keep the three locale
files on the same key set. Experimental settings stay isolated behind their
acknowledgement view and must not appear in normal settings search.

## Checks and releases

Run `npm test` after code changes, then use the Firefox lint/build and package
verification commands from [CONTRIBUTING.md](CONTRIBUTING.md). Package builders
use an explicit allowlist, so local notes and captures cannot enter a release.
Versioning and tagged release flow are also documented there.
