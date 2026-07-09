# Changelog

All notable changes to Edupage Extras are documented here. Versions follow
`package.json` / `manifest.json`. Older history (pre-0.7.0) is only in the git
log — this file starts at the Firefox-compatibility milestone.

## 0.9.3 — 2026-07-09

- Half-year .ics export now skips school vacation weeks, not just public
  holidays: the stable Slovak/Czech breaks (autumn, Christmas, Easter,
  summer) are skipped automatically, and a new settings field accepts pasted
  date ranges (one per line, ISO or d.m.yyyy) to exclude anything else —
  e.g. the regional spring break.
  ([#23](https://github.com/Alexosavrua/Edupage-Extras/issues/23))

## 0.9.2 — 2026-07-09

- Added two more keyboard shortcuts (assignable on the browser's extension
  shortcuts page, no default keys): "Open Edupage Extras settings" and
  "Toggle mobile responsive layout".
  ([#40](https://github.com/Alexosavrua/Edupage-Extras/issues/40))

## 0.9.1 — 2026-07-09

- Tests no longer instrument the scripts with fragile string-replace
  anchors — each tested script now exposes its internals via a deliberate
  guarded hook (`globalThis.__EE_TEST__` → `__eeTestExports`), so a refactor
  that renames an exported function fails loudly instead of silently
  no-opping. No runtime behavior change (the hook is inert in the real
  extension). ([#35](https://github.com/Alexosavrua/Edupage-Extras/issues/35))

## 0.9.0 — 2026-07-09

- Extracted shared helpers into `scripts/lib/ee-common.js` (a `globalThis.EE`
  namespace loaded first in every context — content scripts, background,
  popup/settings pages, tests). Kills the duplicated copies of the custom
  theme defaults (3×), `normalizeTheme`/`normalizeColor`/
  `normalizeCustomTheme` (3×), `parseDateOnly` (4×), `formatDate` (3×),
  slug normalization (2×) and the balanced-literal parsing helpers, so a
  future edit can't silently diverge again (the class of bug behind #19).
  No behavior change intended. ([#32](https://github.com/Alexosavrua/Edupage-Extras/issues/32))

## 0.8.26 — 2026-07-09

- Added `scripts/_template-enhancer.js` — a copy-paste skeleton for new page
  enhancers with TODO markers (top-frame/path guards, storage toggle,
  debounced observer, cleanup, live re-apply), documented in CONTRIBUTING.md
  and excluded from store packages.
  ([#33](https://github.com/Alexosavrua/Edupage-Extras/issues/33))

## 0.8.25 — 2026-07-09

- Added public `ARCHITECTURE.md` (content-script timing, FOUC theme cache,
  Activity Shield design, dual background registration, conventions) and
  `CONTRIBUTING.md` (setup, test caveats, how to add a feature, release
  flow) for contributors; both excluded from store packages.
  ([#31](https://github.com/Alexosavrua/Edupage-Extras/issues/31))

## 0.8.24 — 2026-07-09

- Fixed the Activity Shield "ActivityRedirect" protection doing nothing on
  browsers without the Navigation API (Firefox) — the beforeunload blocker
  now registers unconditionally in the top frame, and the Navigation API is
  only used as an optional refinement where available.
  ([#47](https://github.com/Alexosavrua/Edupage-Extras/issues/47))

## 0.8.23 — 2026-07-09

- Release workflow now creates a GitHub Release on every tag push, with
  notes taken from this changelog and the Chrome .zip + Firefox .xpi
  attached. The update toast's "what's new" link points at the Releases
  page again. ([#28](https://github.com/Alexosavrua/Edupage-Extras/issues/28))

## 0.8.22 — 2026-07-09

- Added GitHub issue forms (bug report matching the built-in "Report a
  Problem" diagnostic structure, feature request) and a PR checklist
  template. ([#30](https://github.com/Alexosavrua/Edupage-Extras/issues/30))

## 0.8.21 — 2026-07-09

- Added a CI workflow running unit tests and the Firefox lint on every push
  to main and on pull requests, instead of only at release-tag time.
  ([#29](https://github.com/Alexosavrua/Edupage-Extras/issues/29))

## 0.8.20 — 2026-07-09

- Fixed virtual grades and mass overrides being stored unscoped by school —
  the same numeric subject id from two different schools used in the same
  browser profile could show one school's saved virtual grades on another
  school's subject. Now scoped per-origin like the attendance stats cache
  already was, with a one-time migration for existing saved data.
  ([#49](https://github.com/Alexosavrua/Edupage-Extras/issues/49))

## 0.8.19 — 2026-07-09

- Fixed .ics export line folding measuring UTF-16 characters instead of
  UTF-8 octets — Slovak/Czech diacritic-heavy lines (lesson titles, rooms,
  teacher names) could serialize to nearly double RFC 5545's 75-octet cap,
  which strict calendar validators/CalDAV servers reject. ([#50](https://github.com/Alexosavrua/Edupage-Extras/issues/50))

## 0.8.18 — 2026-07-09

- Fixed the "what's new" update toast racing across iframes on pages with
  embedded EduPage views — it could render clipped inside a small iframe,
  or in rarer cases get suppressed entirely on the real page. Now only runs
  in the top frame. ([#46](https://github.com/Alexosavrua/Edupage-Extras/issues/46))

## 0.8.17 — 2026-07-09

- Fixed diagnostics ("Report a Problem") silently dropping every uncaught
  error/rejection on Firefox — the extension-origin check only matched
  `chrome-extension://` stacks/filenames, never Firefox's
  `moz-extension://`. ([#45](https://github.com/Alexosavrua/Edupage-Extras/issues/45))

## 0.8.16 — 2026-07-09

- Fixed a wrong-layout flash on the first page load after toggling "Mobile
  responsive layout" — the FOUC-prevention cache wasn't refreshed when that
  was the only setting changed, so the next page load painted from a stale
  cached value before self-correcting. ([#44](https://github.com/Alexosavrua/Edupage-Extras/issues/44))

## 0.8.15 — 2026-07-09

- Fixed the half-year .ics export ignoring the custom second-halfyear
  start/end dates from Settings — it now uses the same school-year
  boundaries the grades/attendance features already honor instead of the
  hardcoded Feb 1 -> Jun 30 window. ([#43](https://github.com/Alexosavrua/Edupage-Extras/issues/43))

## 0.8.14 — 2026-07-09

- Fixed "Timetable Change Highlights" not staying off — disabling it in
  settings was undone within ~10s by EduPage's own widget re-render, since
  the observer/init paths re-applied highlights without checking the
  toggle. ([#42](https://github.com/Alexosavrua/Edupage-Extras/issues/42))

## 0.8.13 — 2026-07-09

- Fixed grades-page attendance columns (Abs %, predicted attendance, overall
  summary row) showing the wrong child's numbers on parent accounts with
  multiple children — mirrors the #22 fix already applied to the standalone
  attendance page. ([#41](https://github.com/Alexosavrua/Edupage-Extras/issues/41))

## 0.8.12 — 2026-07-09

- Fixed the half-year .ics export silently dropping A/B-week alternation when the timetable preload cache was warm. ([#18](https://github.com/Alexosavrua/Edupage-Extras/issues/18))

## 0.8.11 — 2026-07-09

- Added a "Preferred Account" auto-login setting so multi-account pickers can auto-select a chosen account instead of always stopping. ([#26](https://github.com/Alexosavrua/Edupage-Extras/issues/26))

## 0.8.10 — 2026-07-09

- Added Czech public holidays to the half-year .ics export (previously only Slovak holidays were recognized). ([#27](https://github.com/Alexosavrua/Edupage-Extras/issues/27))

## 0.8.9 — 2026-07-09

- Fixed attendance percentages showing the wrong child's numbers on parent accounts with multiple children — now skips the injected row instead of guessing. ([#22](https://github.com/Alexosavrua/Edupage-Extras/issues/22))

## 0.8.8 — 2026-07-09

- Fixed a dark navy flash on page load for light-toned themes (pink, light custom) — the early anti-FOUC paint no longer forces a dark background for them. ([#20](https://github.com/Alexosavrua/Edupage-Extras/issues/20))

## 0.8.7 — 2026-07-09

- Fixed the popup's dark-mode toggle silently discarding a custom theme's table-header color. ([#19](https://github.com/Alexosavrua/Edupage-Extras/issues/19))

## 0.8.6 — 2026-07-09

- Fixed a year-rollover bug in the timetable widget's date detection around the December/January boundary (mixed 1-based/0-based month math). ([#21](https://github.com/Alexosavrua/Edupage-Extras/issues/21))

## 0.8.5 — 2026-07-09

- Fixed the ucivo CSV export missing a UTF-8 BOM, which made Excel garble Slovak/Czech diacritics. ([#24](https://github.com/Alexosavrua/Edupage-Extras/issues/24))

## 0.8.4 — 2026-07-09

- Reworked the popup and settings UI: section cards with dividers, an icon
  nav with an accent indicator, a sticky horizontal tab bar on small
  screens, and panel transitions. Popup header now shows the logo and
  version, plus a "Made by JustAlex and contributors" footer.
- Substantially improved the mobile-responsive EduPage injection: the
  sidebar collapses into a horizontal scrollable chip rail, the timetable
  strip scrolls instead of overflowing, touch targets and 16px inputs
  avoid iOS zoom-on-focus, and long text wraps instead of overflowing.
- Added a dev-only preview harness (`tests/preview/`, never shipped) for
  rendering the popup/settings pages and a mock EduPage shell without
  needing a real account or the extension runtime.
- Fixed the popup rendering as a paper-thin sliver in Chrome: the popup
  body had no explicit width while `.menu` centered itself with
  `margin: auto`, which broke Chrome's popup auto-sizing on first paint.
- Thanks to Kryptos-s for this update ([PR #36](https://github.com/Alexosavrua/Edupage-Extras/pull/36)).

## 0.8.3 — 2026-07-09

- Added copy buttons to EduPage tests (eTest): a per-question copy button
  next to the existing report/clear icons, plus a "Copy whole test" button
  that copies every question numbered as one block. Toggle in Settings →
  Curriculum Export.

## 0.8.2 — 2026-07-08

- Fixed the extension icon failing to decode ("Could not decode image") on
  the Chrome Web Store by stripping EXIF/XMP metadata that Chrome's image
  decoder rejects.

## 0.8.1 — 2026-07-08

- Further image fixes for the Chrome Web Store icon upload. (spoiler alert it did not fix anything.)

## 0.8.0 — 2026-07-07

- Added Chrome Web Store support: build/upload scripts, `CHROME_RELEASE.md`
  setup guide, and CI publishing alongside Firefox.
- Added curriculum export (`ucivo-enhancer.js`) — export the year's topic
  plan from the Učivo page as `.txt`/`.csv`.
- Improved auto-login to handle the multi-step EduPage login flow.
- Improved dark-mode styling for action buttons.

## 0.7.7 — 2026-07-07

- Style fixes for the attendance enhancer and various bug fixes.

## 0.7.6 — 2026-07-02

- Mobile-responsive layout support.
- Auto-login improvements.
- Various bug fixes.

## 0.7.5 — 2026-07-01

- Build process fixes so packaging works again; test updates.

## 0.7.4 — 2026-07-01

- Redesigned and fixed dark mode and themes.
- Added more custom theme options.
- Debug support for the responsive phone layout.

## 0.7.3 — 2026-06-29

- Firefox mobile testing update.

## 0.7.2 — 2026-06-29

- Redesigned settings navigation.
- Enhanced dark mode theme system.
- Firefox compatibility fixes.

## 0.7.1 — 2026-06-26

- Enhanced Firefox compatibility, updated extension descriptions, improved
  settings layout.

## 0.7.0 — 2026-06-26

- Firefox compatibility: `package.json` build/run/sign scripts, package
  verification, and general Firefox porting work.
