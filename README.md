<p align="center">
  <img src="images/icon-128.png" alt="Edupage Extras icon" width="112">
</p>

<h1 align="center">Edupage Extras</h1>

<p align="center">
  Edupage Extras is a browser extension that improves the
  Edupage web portal with small (and big) quality-of-life features.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/edupage-extras/ljakjcljhfkjgndmopmpaakklgnkccca"><img alt="Install from the Chrome Web Store" src="https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/edupage-extras/"><img alt="Install from Firefox Add-ons" src="https://img.shields.io/badge/Firefox_Add--ons-Install-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white"></a>
  <a href="https://discord.gg/eNZXHesA9j"><img alt="Join the Discord" src="https://img.shields.io/badge/Discord-Join_the_community-5865F2?style=for-the-badge&logo=discord&logoColor=white"></a>
</p>


<p align="center">
  <strong>This project is not affiliated with Edupage, aSc Applied Software Consultants,
  or any school using Edupage.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> · <a href="#permissions">Permissions</a> · <a href="#privacy">Privacy</a> · <a href="#development-notes">Development</a> · <a href="#compatibility">Compatibility</a>
</p>

## Installation

### Installation in Chrome / Edge

Install directly from the
[Chrome Web Store](https://chromewebstore.google.com/detail/edupage-extras/ljakjcljhfkjgndmopmpaakklgnkccca).

### Installation in Firefox

Install directly from the
[AMO listing](https://addons.mozilla.org/en-US/firefox/addon/edupage-extras/).

Edupage Extras is Chromium-first. If something does not work on your school's
EduPage, open a GitHub issue or report it on [Discord](https://discord.gg/eNZXHesA9j).

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
- **Anonymizer** — the last option in Cleanup replaces the signed-in account's
  full name throughout rendered EduPage text and presentation labels, and hides
  the profile login. Enable it to reveal an autosaved display name, initially
  `Anonymous`. It follows dynamically loaded content, handles names split across
  inline elements, and restores original text when disabled. The account name
  comes from EduPage's `loggedUserName` widget option, with profile text as a
  fallback while it loads. Forms, editors,
  scripts and stored EduPage data are not changed. Account names stay in memory;
  only your chosen alias is saved in extension storage.
  Profile names stay hidden until a usable full name can be replaced.

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

- **Subject attendance** shows attendance for individual subjects calculated from the Attendance page.
- **Halfyear absence percentage** overall absence percentage inside Edupage's existing attendance page.

### Curriculum

- **Curriculum export** — on a subject's topic plan page, export the
  full year's chapters, topics, and taught dates as `.txt` or `.csv`.

### Test results

- **Show My Test Answers (WIP, off by default)** — enable in Settings →
  Enhancements to open Answers / detailed results for your eTests
  when EduPage has already loaded your result but hides the question view,
  regardless of its evaluation status. The setting
  only overrides question visibility. Correct-answer checks and the print
  renderer stay native: unlocked tests without a server-provided answer key
  show your answers without forced green/red correctness marks.
  A banner above the results explains that these are the answers you entered
  during the test, in the extension's UI language.
  It reapplies during navigation and restores the original view when disabled.
  It does not retrieve missing answers, change results, or submit anything.

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
- **Compare timetables** — compare your timetable with one other class at your
  school, or a calendar imported as a repeating weekly or A/B-week template.
  Enable **Compare timetables** in **Settings → Timetable** and configure it
  inline beneath the switch. Save multiple class or imported timetables, then
  choose **Shown comparison** to switch which one appears on EduPage. **Add
  timetable** keeps existing schedules; **Edit / replace** changes the selected
  schedule. It is off by default, and adds no controls or
  prompts to EduPage while off or before a schedule is saved. Preview the next two
  weeks before saving; select included groups and the Monday that anchors week A.
  Home keeps your native timetable and adds one expandable row with their
  current/next lesson, both finish times, and the difference. The weekly page
  keeps EduPage’s grid and adds a compact day-by-day finish strip; expand a day
  for their lessons and shared gaps. Both plain and encoded timetable links work.
  Shared gaps of at least 15 minutes are calculated within the combined school
  day. They mean no scheduled lessons, not guaranteed availability.

Imported `.ics` files stay on your device and must contain individual dated,
timed lessons (up to 1 MB / 4,000 lessons). EduPage Extras exports are supported;
recurrence rules, all-day events, overnight lessons, and named time zones other
than the device's zone are rejected with an explanation. UTC exports are
converted to device-local times before creating the template. Import one file
containing both sample weeks, or separate files for A and B. Templates repeat
until replaced or removed and do not update for holidays, cancellations, or
substitutions. Other classes load live from your signed-in school; expand a day
and use Refresh to check for changes. Turn the Settings switch off to remove
the comparison while retaining every saved schedule. Remove in Settings deletes
only the selected schedule and switches to another saved schedule if available.

### Experimental

Experimental settings include a **Test Stay Active Mode** button below the Stay Active
master switch. It opens https://test.nop.wtf in a new tab. The reload action reloads both
EduPage and test.nop.wtf tabs.

### Keyboard shortcuts

Some features can be bound on the browser's extension-shortcuts page.
(`chrome://extensions/shortcuts`, or Add-ons Manager on Firefox)

### Languages

- **Localized interface** Extension is translated into English, Slovak, and Czech.
- Choose **Language** at the top of **Settings → Appearance**: Browser language,
  Slovenčina, Čeština, or English. Browser language is the default and falls back
  to English when unsupported. The choice is saved locally, updates Settings
  immediately, and is used by the popup and injected extension text. Reload open
  EduPage tabs to refresh all extension labels there.

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
- `scripting` - attaches enabled eTest controls to already-open EduPage tabs
  after enabling or updating the extension, without reloading an active test.
- `notifications` - shows an unpacked-version update reminder when a newer
  GitHub version is available.
- `https://*.edupage.org/*` host access - injects the extension scripts only on
  Edupage pages, reads timetable/attendance data already present in Edupage,
  and lets the settings UI find and reload open Edupage tabs (no separate
  `tabs` permission is requested).
- `https://test.nop.wtf/*` host access - runs the experimental activity shields on the testing site and lets settings reload its tabs.
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
  the local computer; OpenAI, Gemini, NVIDIA, and OpenRouter receive the current
  question text and any responses already chosen in that question.
- No Edupage credentials are collected.
- Settings are stored locally.
- Structured attendance and timetable data used by enhancements is cached
  locally.
- Grade enhancements are generated from data already present in the currently
  loaded Edupage page.
- Attendance percentages are generated from Edupage's existing attendance page
  data and do not use an external API.
- Timetable export generates a calendar file locally.

<details>
<summary>Development notes and publishing checks</summary>

## Development Notes

This is a plain browser extension with an `npm`-based toolchain for the
Firefox side (linting, packaging, and publishing). There's no build step for
loading it unpacked in Chrome/Edge — that still works directly from source.

See the [architecture guide](ARCHITECTURE.md) and [contributor workflow](CONTRIBUTING.md)
for development details.

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

</details>

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
