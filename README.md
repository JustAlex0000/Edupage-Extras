# Edupage Extras

Edupage Extras is a browser extension that improves the
Edupage web portal with small (and big) quality-of-life features. 

**This project is not affiliated with Edupage, aSc Applied Software Consultants,
or any school using Edupage.**

## Installation

### Installation in Chrome / Edge

Install directly from the
[Chrome Web Store](https://chromewebstore.google.com/detail/edupage-extras/ljakjcljhfkjgndmopmpaakklgnkccca).

### Installation in Firefox

Install directly from the
[the AMO listing](https://addons.mozilla.org/en-US/firefox/addon/edupage-extras/).
Also available for Android through the same listing.

Edupage Extras is Chromium-first. If something does
not work on your school's EduPage, make a github issue or report it on my [Discord](https://discord.gg/eNZXHesA9j).

### Load unpacked in Chrome or Edge (development)

[Full Contributor guide here](CONTRIBUTING.md)

1. Clone the repository.
2. Open `about://extensions` in any chromium browser, or `about://addons` in any firefox browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder: `Edupage-Extras/`.
6. Configure settings.
7. Automatic updating does not work on cloned repositories, git pull is needed to update.

## Features

### Appearance

- **Themes** for Edupage pages and extension menus, custom themes supported.
- **Centered layout** centers the page layout.
- **Help text hide** for hiding the annoying top-right Edupage help greeting.
- **Mobile-responsive home layout** (WIP) — adapts the legacy authenticated
  `/user/` home for mobile and tablet screens. Other EduPage modules and the dedicated
  `/app/*` mobile client keep their native layouts.

### Grades

- **Color-coded average bars** for subject averages.
- **Subject sorting and filtering** Search by subject, name, grade count, or average, and hide subjects without grades.
- **Virtual Grade Calculator** — add grades to any subject and
  see the projected average, using EduPage's grade weights to calculate "future" grades.
- **Grades export** to `.json`, `.csv`, or `.txt` via an export button.
  One row per grade with subject, date, value, weight, title, and
  the subject's average. CSV includes a UTF-8 BOM so Excel renders diacritics
  correctly.

### Attendance

- **Subject attendance** shows attendance for individual subjects calculated from the Attednance page.
- **Halfyear absence percentage** overall absence percentage inside Edupage's existing attendance page.

### Učivo / Curriculum

- **Curriculum export** — on a subject's topic plan page, export the
  full year's chapters, topics, and taught dates as `.txt` or `.csv`.

### Experimental AI

- **Test Question Helper** (opt-in) — asks a configured Ollama, LM Studio,
  NVIDIA, or OpenRouter model about the current eTest question. It fills only
  an untouched question and never submits an answer.

### Login

- **Auto-login** (off by default) — clicks through EduPage's
  multi-step login (account picker included) and submits to log in.
  No credentials are ever stored or read by the
  extension, and it stops the moment you type anything yourself. A preferred
  account can be chosen in settings.

### Timetable

- **Substitution and room-change highlights**, colored by change type instead
  of EduPage's single generic color, so you can tell at a glance what changed.
- **Export to .ics** — download the current week or the whole half-year as a
  standard calendar file, importable into calendar apps.

### Keyboard shortcuts

Some features can be bound on the browser's extension-shortcuts page.
(`chrome://extensions/shortcuts`, or Add-ons Manager on Firefox)

### Languages

- **Localized interface** Extension is translated into English, Slovak, and Czech.
- The language follows the browser UI language automatically
  (`chrome.i18n`/`browser.i18n`), falling back to English.

### Updates

- **Chrome Web Store / AMO installs:** update automatically through the
  browser's store.
- **Chrome/Edge (unpacked/development installs):** an update reminder
  checks the public GitHub project manifest and compares it with the
  installed version. If a newer version is available, it prompts you to git pull
  the latest project and reload the unpacked extension from
  `chrome://extensions/`.

See [CHANGELOG.md](CHANGELOG.md) for what changed in recent versions.

## Permissions

Edupage Extras requests:

- `storage` - saves extension settings locally in the browser.
- `alarms` - checks for updates on a daily schedule.
- `notifications` - shows an unpacked-version update reminder when a newer
  GitHub version is available.
- `https://*.edupage.org/*` host access - injects the extension scripts only on
  Edupage pages, reads timetable/attendance data already present in Edupage,
  and lets the settings UI find and reload open Edupage tabs (no separate
  `tabs` permission is requested).
- `https://edublurtesting.ct.ws/*` - testing purposes
- `https://raw.githubusercontent.com/JustAlex0000/Edupage-Extras/*` host access -
  reads the public project manifest for update checks.
- Optional access to `localhost`, `127.0.0.1`, `integrate.api.nvidia.com`, or
  `openrouter.ai` is requested
  only when the user tests the matching AI provider connection.

The extension does not request access to all websites.

## Privacy

- No backend server.
- No analytics.
- External requests are limited to the optional public GitHub update check and
  user-triggered Test Question Helper requests. Ollama and LM Studio stay on
  the local computer; NVIDIA and OpenRouter receive the current question text
  and any responses already chosen in that question.
- No Edupage credentials are collected.
- Settings are stored locally.
- Structured attendance and timetable data used by enhancements is cached
  locally.
- Grade enhancements are generated from data already present in the currently
  loaded Edupage page.
- Attendance percentages are generated from Edupage's existing attendance page
  data and do not use an external API.
- Timetable export generates a calendar file locally.

## Development Notes

This is a plain browser extension with an `npm`-based toolchain for the
Firefox side (linting, packaging, and publishing). There's no build step for
loading it unpacked in Chrome/Edge — that still works directly from source.

See the [documentation index](docs/README.md), [architecture guide](ARCHITECTURE.md),
and [contributor workflow](CONTRIBUTING.md) for development details.

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
npm run verify:package  # enforces the exact extension shipping allowlist
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
5. Report it as an issue or through Discord.

## License

MIT
