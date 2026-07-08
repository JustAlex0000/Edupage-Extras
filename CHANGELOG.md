# Changelog

All notable changes to Edupage Extras are documented here. Versions follow
`package.json` / `manifest.json`. Older history (pre-0.7.0) is only in the git
log — this file starts at the Firefox-compatibility milestone.

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
