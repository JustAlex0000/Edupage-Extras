# Changelog

All notable changes to Edupage Extras are documented here. Versions follow
`package.json` / `manifest.json`. Older history (pre-0.7.0) is only in the git
log — this file starts at the Firefox-compatibility milestone.

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
