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
  Firefox packaging loads `scripts/background-context.js` before the language
  service so its event page serves catalogs directly despite having a document.
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
  CSS masks profile names until a connected body has been scanned with a usable
  name pattern; `ee-anonymizer-active` releases the mask and is removed on disable.
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

## Activity shield

In addition to its built-in EduPage and test-site matches, Stay Active can be
enabled for user-selected HTTP(S) sites from Experimental settings. Each exact
hostname requires optional host permission, and the global master switch and
shield preferences apply there. Adding or removing a site takes effect on the
next navigation or reload; removal also revokes its optional permission unless
another feature uses it. Only the activity shield is made available on these
sites, not the other EduPage content scripts.

The isolated bridge sends boolean preferences over a MessageChannel after a
one-time page-world handshake. Main-world hooks keep preference state in closures;
no DOM control port, native-hidden dataset, or native-state event is published.
The handshake and MAIN-world hooks are observable and are not an anti-tampering
boundary. The indicator is created only when requested and only in the top frame.
The indicator button writes only `eeActivityShieldEnabled` when clicked, leaving
individual shield preferences unchanged. Storage updates synchronize the hooks,
color (blue enabled, red paused), localized action label, and `aria-pressed`
state across tabs. It remains visible while paused if
`eeActivityShieldVisualIndicator` is enabled; disabling that preference removes
it. Failed writes leave the displayed state unchanged and allow retrying.
There is no separate eTest panic control.

Native visibility transitions update reload blocking and pending animation requests
before downstream events are suppressed. Disabling removes the reload blocker and
moves pending animation callbacks back to native scheduling. Stable handles remain
cancellable. The jQuery Sweep calls `.off()` on the exact `.etestplayeral` and `.etestaplayer`
namespaces on `window` and `document`, immediately on activation and at 500ms
intervals while enabled. It does not wrap registration, dispatch, or callbacks.
Disabling stops removal and its timer; intentionally removed handlers remain
removed. Script-load/readiness events also trigger active sweeps. The default-off
state has no polling timer. Browser suspension and cached
native methods remain outside the feature's guarantees.

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
Settings → Timetable; `scripts/timetable-comparison.js` adds an actual-time
comparison grid on the weekly page and a single expandable row below the home
widget. Weekly comparison temporarily hides the native grid, retaining native
class/week navigation and a switch to restore it. The native grid is restored
on disable, cleanup, or unavailable dates. Its rendered lessons supply the first
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

`eeEtestInputLengthEnabled` is default-off and WIP. `ensureInputLength()` reads
inline widths in `ch` from `.etest-answer-input-field`, estimates character counts
as `round((width - 3) / 0.9)`, and shows a localized tooltip on hover/focus.
Native titles are suppressed to avoid duplicate EduPage/browser tooltips and
restored on disable/route exit; class and style changes trigger reapplication.

Saved tests are a separate, default-off `eeTestArchiveEnabled` preference.
`etest-enhancer.js` observes and snapshots the native player while this setting
is on, even if Copy and AI are off. It sends only changed questions on a bounded
debounce, flushing pending changes before native question navigation and page
exit. Captures use random per-opening IDs; native question IDs and route/query
data stay in memory. Replaced players/reopened pages start separate captures so
unverified test identities cannot merge different attempts. The native
`.etest-player-title-name` supplies the display title; late titles update an
existing capture without requiring an answer change. Missing headers do not
erase a previously recorded name.

`etest-archive-background.js` validates top-frame HTTPS EduPage senders (the
content script checks the live route because Chrome can retain a document's
original URL across smart navigation), normalizes text/answer/raster-only messages, and serializes all writes
and deletions under `eeTestArchive`. Limits are 50 captures, 300 questions per
capture, and 3 MiB. Failed/oversized writes preserve previous data and store only
a bounded error key in `eeTestArchiveStatus`. Per-capture sequence numbers reject
out-of-order snapshots. Deleted capture IDs are blocked (last 200 IDs only) so
an open tab cannot immediately recreate the deleted test. Delete all clears
those markers and atomically turns recording off. Disabled recording retains
the collection; no archive data enters diagnostics.

Only the extension's Settings page may list/delete saves via runtime messages.
`menu/etest-archive-settings.js` renders a read-only text-based review with local
PNG/JPEG/WebP data images. It never inserts captured HTML or fetches saved page
URLs. Canvas copying of already-loaded raster pixels is bounded; inaccessible
images and unsupported visuals are labelled as omitted. Saved answers are local
observations, never a submission receipt or inferred answer key. No new host
permissions or AI calls are required.

The eTest helper remains registered across native smart navigation. It reads
its opt-in settings on every top-level EduPage document, observes native content
changes only while a helper feature is enabled, and renders controls only on
`/elearning` routes. Disabling disconnects its observer and clears injected
controls and remembered questions. A per-document guard makes background
reattachment idempotent. A fresh attachment removes orphaned copy/AI controls
and pending markers from an invalidated extension context before rebuilding;
a repeat attachment to the live helper preserves its current request.
Enabling or installing/updating the extension can attach
the shared common and i18n libraries followed by the fixed helper file to existing
EduPage tabs using `scripting`. The libraries preserve their live state on repeat
attachment; this never reloads a test or invokes an AI provider automatically.

Grades sorting/filtering works on the real subject table and moves a subject
with its following category rows. Never modify `#znamkyTableHeaderBg` or
EduPage's floating header clone: EduPage keeps them in sync itself.

`grades-weights.js` adds an opt-in `eeGradesWeightsEnabled` panel to the existing
Grades toolbar, with a subject selector and aligned name/weight pairs. Its
Escape/outside-click listeners are removed when disabled or rebound; table
replacement preserves the selected subject and open state. Grade rows stay
unchanged. It finds `.znamkyStudentViewer(` initializers by
method name and resolves their dynamic target to the current table. Only
`kategorie` and `vsetkyUdalosti.edupage` definitions are projected by `PredmetID`,
without joining to grades, so empty definitions remain visible. `p_vaha` is
divided by 20. Definitions stay in memory and DOM; disabling removes the UI.
The shared body observer handles table replacements; if definitions are still
missing, a head-only observer waits for an initializer for at most ten seconds.

Attendance cache version 16 includes student identity in its cache key. Every load
verifies the current sole owner from a fresh attendance response before considering
memory or storage; a completed full read verifies the owner again. Ambiguous owners
fail closed. Changing the grades table/period or disabling attendance aborts pending
reads. Individual reads have a twenty-second deadline. Summary rendering ignores
its own mutations and does not rebuild unchanged values.

AI suggestions are tied to the exact player, route, question model, and request
generation. Disable, mode changes, player replacement, and navigation invalidate
pending actions; returned data cannot modify an obsolete question. Provider reads
have a twenty-five-second deadline to remain below Chromium's fetch lifetime.

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
Versioning and tagged release flow are also documented there. `release.yml`
validates tagged builds once, then independent jobs create the GitHub Release
and submit the exact verified Chrome artifact. Firefox checks still run, but AMO
submission is manual-only in `firefox-release.yml` and fails closed unless the
repository variable `AMO_PUBLISH_ENABLED` is explicitly true. Neither store's
submission gates GitHub Release creation.

## AI activity diagnostics

`background.js` serializes all writes/clear/disable operations for
`eeAiActivityLog` (80 entries, seven-day pruning on write/read). The local
`eeAiActivityLogEnabled` preference defaults on while either AI feature is enabled;
no events are written when both are off. Explicit false survives re-enabling an
AI feature. Switching logging off also erases data.
Only Settings may read/clear/change this preference through runtime messages.
Top-frame HTTPS EduPage helpers may report fixed application/shortcut event
codes and an allowlisted helper/automatic feature identifier; they cannot supply
arbitrary log text. Backend events add fixed configuration/provider/response
stages and fixed shortcut-delivery reasons. Provider errors become
fixed codes and HTTP status numbers. Model metadata uses an explicit public
OpenAI preset allowlist; every other model is `custom`. No provider messages,
credentials, prompts, answers, school URLs or test identifiers are stored.
Diagnostics exclude the key even with redaction disabled. Log storage failures
must never interrupt an AI action. `menu/ai-activity-settings.js` renders text
entries inside the shared AI configuration and observes storage/language changes.
Copy uses normalized safe entries, the extension version and UTC timestamps;
clipboard denial reveals a selected read-only fallback. Clear/disable removes
that fallback, too. Log exports are user-initiated and never uploaded.
The provider adapter detects output-limit termination before parsing or applying
a potentially partial response; no automatic retry or token-budget increase.

### Review and comparison improvements

Saved-test serialization reads KaTeX MathML once, omits TeX annotations and
visual duplicates, and serializes common fractions, powers, roots and vectors
as readable text. The title reader prefers the native nested `.interactiveElem`
name and excludes SR-only instructions and counters. Later snapshots preserve the
last nonempty native title. There is no manual naming flow. Copy exports plain
text through a user action; image omission
is explicit. Existing flattened captures are not automatically rewritten.

Home comparison retains its summary disclosure and uses horizontal lesson
columns beneath it. No Home shared-gap paragraph is rendered. Disclosures remain
open across re-rendering. The weekly planner uses actual minutes and packs
overlapping intervals into separate tracks, marking unknown days unavailable.
Its mount follows the complete native canvas, falling back to the parsed root
when `#fitheight` is absent. The comparison is visible by default. Scoped classes
hide only the native grid, collapse canvas minimum height, and restore the original
view on switch, disable or cleanup. No native timetable node is replaced.

New provider presets keep saved model IDs. GPT-6 requests omit temperature;
reasoning Off maps to none only on models that support it and otherwise low.
Gemini 4 and 3.8 use LOW rather than unsupported MINIMAL for Off.

Weekly comparison presentation reads native subject-cell colours at render time
by matching the existing text/background layers. They remain presentation-only
and are never written to saved schedules or caches. Imported-only subjects use
a deterministic native-style pastel palette, tinted against theme tokens in
dark mode. Ownership remains labelled; overlap tracks and actual times are unchanged.

## AI fill timing and reference text

`eeAiFillDelaySeconds` is bounded to 0–60 (default 0), and
`eeAiSequentialFillEnabled` defaults false. The content helper keeps requests
pending through filling, using one cancelable timeout and an expected question
snapshot after each own mutation. Before every action it rechecks player,
route, model/answers, generation and connectivity. Escape, trusted edits,
configuration changes and page/player replacement invalidate pending work.
Programmatic input/change events from an active own step do not cancel it.
Cloned AI controls are recreated instead of retaining detached event handlers.
The AI shortcut checks the currently hovered question before its existing
clicked/focused/single-question fallback. Copy targeting is unchanged.

Sequential mode applies fields, choices, dropdowns and ordering moves locally
with `eeAiFillStepSeconds` (0.1–10, default 0.5) between steps. Matching keeps the full validated permutation and
stable original pair IDs in the existing MAIN bridge, accepting monotonic local
step indexes. The API request/response schema and provider-call count are
unchanged. No test navigation or automatic submission is added.

`menu/ai-fill-settings.js` owns the timing and notes controls. Context uses
`eeAiContextEnabled` (default false) and `eeAiContextText` (up to 20,000 UTF-16
code units). UTF-8 `.txt`/`.md` imports are capped at 128 KiB, reject invalid
encoding/NULs and load only a draft until Save. No original file/filename is
stored. Clear writes empty text and disables context atomically. Background
reads notes only for opted-in explicit AI actions, appends them as untrusted
reference data to the existing prompt, and rejects oversized stored notes
rather than truncating. Disabled context leaves the provider body unchanged.
Content scripts do not read notes, and notes are excluded from all diagnostics
and activity logs. They remain local until cleared/extension removal, while
copies sent to the selected provider follow that provider's retention rules.

`eeAiAutoFillEnabled` is an independent, default-off feature with its own
`fill-loaded-test` browser command. Both AI features share configuration and
notes; either opt-in reveals shared Settings. Background authorization checks
`mode: loaded-test` against the automatic-fill switch, while ordinary question
requests still require the individual helper. Existing-tab bootstrap also
recognizes the independent feature.

The content helper snapshots rendered questions only in `.cardsPerScreen-all`,
queues unvisited unanswered entries serially, and uses the existing guarded
request/fill path. It awaits completion before advancing, skips manually edited
future entries, and holds a result if its question becomes hovered/focused.
Focus/pointer/scroll/DOM events resume a hold; there is no polling. Repeated
queue shortcut, Escape, configuration/route/player changes, current-question
edits and provider errors stop remaining work. Already-applied answers stay.
Queue requests suppress all question UI and visual fallbacks, including error
notes. Only safe fixed lifecycle events reach the Settings activity log. The
queue never starts on enable/load and never navigates or submits tests.

## Optional test fullscreen restoration

`scripts/test-fullscreen.js` runs in the top isolated frame, independently of AI
and page-world shield hooks. `eeActivityShieldRestoreFullscreen` defaults false,
requires Stay Active and Block Escape, and is registered in the manifest and
existing-tab bootstrap. It only arms after observing actual fullscreen containing
the rendered `.etest-screen-questions` view in an `.etest-player`.
Window capture observes fullscreen changes before document-level handlers.

One subsequent trusted click/ordinary key inside the questions may request the
original connected fullscreen element; native focus/visibility checks prevent
background requests. Escape, F11, Tab and modifier shortcuts are ignored. There
is no keyboard lock, focus stealing, exit suppression or automatic fullscreen
request from a fullscreen-exit/focus event. Denial is swallowed and not retried
until another genuine fullscreen entry/exit. Route/player replacement or loss
of question view resets state, as do disabling preferences and pagehide.
Discovery is event-driven and bounded to 30 seconds when no player is open;
its observer lasts through the current question view. No page data is stored,
logged or sent. There are no new permissions or AI dependencies.
