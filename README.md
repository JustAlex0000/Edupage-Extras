# Edupage Extras

Edupage Extras is a browser extension that improves the
Edupage web portal with small (and big) quality-of-life features. 

**This project is not affiliated with Edupage, aSc Applied Software Consultants,
or any school using Edupage.**

## Installation

### Load unpacked in Chrome or Edge

1. Download or clone this repository. (Do not forget to extract it if downloading directly)
**Updating with git pull WILL NOT WORK when downloading directly!**
2. Open `chrome://extensions` in any Chromium browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder: `Edupage-Extras/`.
6. Open an Edupage page such as `https://your-school.edupage.org/`, or reload an already opened page.

### Installation in Firefox

Edupage Extras is being submitted to addons.mozilla.org (AMO) starting with
version 0.7.0. Once the listing is live, search "Edupage Extras" on
[addons.mozilla.org](https://addons.mozilla.org) or follow the link from this
repository (https://addons.mozilla.org/en-US/firefox/addon/edupage-extras/). Installs from AMO
update automatically — no manual steps needed.

Note: this extension is built for Chromium-based browsers and has been ported to Firefox so anyone can use it.
      if you encounter any bugs please report it on my discord. (there is a report tool built in settings.)
## Features

### Appearance

- **Themes** for Edupage pages and extension menus.
- **Theme hotkey** support for toggling themes on or off through the browser's
  extension shortcuts page.
- **Theme picker** with Dark, Ocean Cyan, Forest Green, Emerald Green,
  Rose Pink, Royal Purple, and Light themes.
- **Centered layout** option for a cleaner main page layout.
- **Help text cleanup** for hiding the top-right Edupage help greeting.

### Grades

- **Grade badges** on the Edupage grades page.
- **Color-coded average bars** for subject averages.
- **Overall average row** based on the averages Edupage already renders.
- **Virtual Grade Calculator** — add hypothetical grades to any subject and
  see the projected average update live, using EduPage's own grade weights
  (read directly from EduPage's data, not guessed from on-screen labels).
- **JSON export** of the grades table (subject, average, and attendance fields
  when enabled) via an Export JSON button above the table. The file is
  human-readable, self-documenting, and easy to feed back into scripts.

### Attendance

- **Subject attendance** inside the Edupage grades table.
- **Halfyear absence percentage** inside Edupage's existing attendance summary.
- **Second halfyear start/end date overrides** in Settings for attendance
  calculations when EduPage's default dates need adjusting.
- Uses the official attendance data already embedded in the loaded Edupage page.
- Highlights the currently active halfyear and shows the raw absent/total lesson ratio.

The extension reads the values from Edupage's existing grade table. It does not
log in, use credentials, fetch grades from a server, or calculate hidden grade data.

### Timetable

- **Substitution and room-change highlights**, colored by change type instead
  of EduPage's single generic color, so you can tell at a glance what changed.
- **Export to .ics** — download the current week or the whole half-year as a
  standard calendar file, importable into Google Calendar, Apple Calendar,
  Outlook, and most other calendar apps. Optionally include or exclude this
  week's substitutions/room changes.

### Languages

- **Localized interface** for the popup, Settings, and Experimental pages, plus
  the injected grades columns. English, Slovak, and Czech are bundled.
- The language follows the browser UI language automatically
  (`chrome.i18n`/`browser.i18n`), falling back to English.

### Updates

- **Chrome/Edge (unpacked installs):** an update reminder checks the public
  GitHub project manifest and compares it with the installed version. If a
  newer version is available, it prompts you to pull the latest project and
  reload the unpacked extension from `chrome://extensions/`.
- **Firefox (installed from AMO):** updates automatically through Firefox's
  own add-on update mechanism — no manual steps, and the GitHub-based reminder
  above doesn't apply.
- Update checks do not send Edupage data anywhere.

## Usage

- Click the extension icon to quickly toggle themes or open settings.
- Open **Settings** for appearance and grade options.
- Assign a shortcut in the extension shortcuts page if you want to toggle
  themes without opening Settings.
- Choose **Custom** in the theme picker to build your own themes.
- Use **Check For Updates** in Settings to manually check the public GitHub
  version (Chrome/Edge unpacked installs only — see Updates above).

## Permissions

Edupage Extras requests:

- `storage` - saves extension settings locally in the browser.
- `tabs` - finds open Edupage tabs so settings can be applied or tabs can be
  reloaded from the settings UI.
- `alarms` - checks for updates on a daily schedule.
- `notifications` - shows an unpacked-version update reminder when a newer
  GitHub version is available.
- `https://*.edupage.org/*` host access - injects the extension scripts only on
  Edupage pages and reads timetable/attendance data already present in Edupage.
- `https://edublurtesting.ct.ws/*` - testing purposes
- `https://raw.githubusercontent.com/Alexosavrua/Edupage-Extras/*` host access -
  reads the public project manifest for update checks.

The extension does not request access to all websites.

## Privacy

- No backend server.
- No analytics.
- No external requests made by the extension except the optional public GitHub
  manifest update check.
- No Edupage credentials are collected.
- Settings are stored locally with `chrome.storage.local`.
- Grade enhancements are generated from data already present in the currently
  loaded Edupage page.
- Attendance percentages are generated from Edupage's existing attendance page
  data and do not use an external API.
- Timetable export generates a calendar file locally in the browser; nothing
  is uploaded anywhere.

## Main Files

- `manifest.json` - extension manifest, permissions, and content script setup.
- `scripts/background.js` - GitHub update checks, update reminders, and
  timetable `.ics` export.
- `scripts/content.js` - themes, layout cleanup, and visual fixes.
- `scripts/grades-enhancer.js` - grade badges, average bars, the overall
  average row, and the Virtual Grade Calculator.
- `scripts/attendance-enhancer.js` - injects current halfyear absence
  percentages into Edupage's attendance summary.
- `scripts/timetable-enhancer.js` - substitution/room-change highlights on the
  homepage timetable widget.
- `scripts/timetable-sync.js` - reads the EduPage timetable page, used by the
  `.ics` export.
- `menu/settings.html` - normal user-facing settings.
- `menu/experimental.html` - experimental features that are kept
  separate from normal settings.
- `menu/i18n.js` - shared localization helper for the extension's own pages.

## Development Notes

This is a plain browser extension with an `npm`-based toolchain for the
Firefox side (linting, packaging, and publishing). There's no build step for
loading it unpacked in Chrome/Edge — that still works directly from source.

Recommended checks before publishing:

```sh
npm install
npm test                # runs every tests/*.test.js file
npm run lint:firefox    # web-ext lint — should report 0 errors
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
node -e "['en','sk','cs'].forEach(l=>JSON.parse(require('fs').readFileSync('_locales/'+l+'/messages.json','utf8'))); console.log('locales ok')"
```

To build and sanity-check a Firefox package locally:

```sh
npm run build:firefox   # produces a .zip in web-ext-artifacts/
npm run verify:package  # fails if the package contains anything it shouldn't
npm run run:firefox     # launches Firefox with the extension loaded
```

See [FIREFOX_RELEASE.md](FIREFOX_RELEASE.md) for the full AMO publishing setup
(one-time manual listing, then automatic releases via GitHub Actions on every
version tag).

## Compatibility

Edupage changes its HTML, CSS, and JavaScript over time. Some selectors or data
formats may need updates when Edupage changes its pages.

If a feature stops working:

1. Reload the extension.
2. Reload the Edupage tab.
3. Check whether the feature is enabled in Settings or Experimental.
4. Open the browser console and look for Edupage Extras errors.

## License

MIT
