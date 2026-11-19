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

- **Category and event weights** — enable in Settings → Grades to show an
  compact **Weights** panel in the existing Grades toolbar. Choose a subject
  to see its definitions, including entries with no grades yet. Subject options
  show the subject name without the teacher label. The panel
  closes with Escape or a click outside and leaves grade rows unchanged.
  Weights come from the currently loaded viewer and use EduPage's
  display units (server weight divided by 20). Off by default; nothing is saved
  or requested from another server.

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

- **Saved tests (Experimental, off by default)** — Settings → Experimental →
  eTest tools → Save tests for review automatically keeps opened eTest questions and the latest
  answers recorded on this device, independently of Copy and AI. Review and
  copy or delete them in the same settings section. Test names are read automatically
  from the native name field, excluding accessibility instructions and counters. New captures
  store each KaTeX formula once as readable text. Previously flattened formulas
  cannot be reconstructed from old saves and need a new capture. Turning recording off retains saved
  tests; deleting all also turns recording off.
  Only loaded questions are captured: unvisited questions may be missing, and
  recorded answers do not confirm submission or correctness. Each opening or
  player replacement is a separate capture. Readable raster images are copied
  locally at reduced resolution; inaccessible images, SVGs, and canvases are
  marked as omitted. The viewer never reloads original image URLs.
  Storage is limited to 50 tests, 300 questions per test, and 3 MiB total. Full
  storage or unsupported content leaves previous saves intact and shows a notice
  in Experimental settings. Saves use the current browser profile, are not
  synced, and remain until deleted or the extension is removed.

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
  It uses EduPage's native login form and does not save credentials. It stops
  when you type, and cancels a queued login if the autofilled credentials change
  before submission. A preferred account can be chosen in settings.

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
  current/next lesson, both finish times, and the difference. Its arrow reveals
  horizontal lesson columns with times, rooms and groups, without a shared-gap
  sentence. With comparison enabled, the weekly page shows both schedules
  together on a shared clock-time grid, without opening individual days. Overlapping
  groups remain visible. **Normal EduPage view** restores the original grid;
  **Comparison view** returns to the comparison. Native week navigation stays
  available. Both plain and
  encoded timetable links work.
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

**Show answer length (WIP, off by default)** in eTest tools shows an estimated
character count on hover or keyboard focus over answer inputs, calculated from
their width in `ch`. This is a width-based estimate, not the correct answer
length.

Experimental settings include a **Test Stay Active Mode** button below the Stay Active
master switch. It opens https://test.nop.wtf in a new tab. The reload action reloads both
EduPage and test.nop.wtf tabs.

Use **Additional sites** under Settings → Experimental → Stay Active to add a
domain or HTTP(S) URL. A bare domain defaults to HTTPS. The browser asks for
access to that exact hostname (on all ports). Stay Active's master switch and
shield preferences apply there too; other EduPage features do not. Reload or
navigate an open site after adding or removing it for the change to take effect.
Removing a site also removes its optional access unless another feature uses it.

The optional bottom-right status dot toggles the Stay Active master switch
across open tabs when clicked, preserving individual shield preferences. Blue
means enabled; red means paused. The dot stays visible in both states while its
visual indicator setting is on. There is no separate panic button.
Already removed jQuery handlers cannot be restored without reloading.

Stay Active changes selected page-visible activity signals. Its jQuery Sweep directly
removes `.etestplayeral` and `.etestaplayer` handlers from `window` and `document`,
including later registrations during enabled sweeps. Disabling stops further
removal; already removed handlers are intentionally not restored. Pending animation frames
move between visible and hidden scheduling without losing their cancellation handles.
Preferences are not stored in page DOM. Page scripts can still observe or interfere
with browser hooks and the initial bridge handshake; undetectability is not guaranteed.
Browser throttling, freezing, tab discard, and machine sleep can pause all page work.
The testing page does not verify school-side monitoring or session timeouts.

The AI shortcut targets the question under the mouse pointer, before falling
back to the last clicked/focused question or the only question on the page.
Choose **Shortcut** or **Both** in Answer controls to enable it.

AI settings also offer **Delay before filling** (0–60 seconds, default 0) and
**Fill answers one at a time** (off by default). The latter applies one field,
choice, dropdown, ordering move or matching pair with a configurable **0.1–10 second**
pause (default 0.5). These are
local actions: the provider request and answer format stay the same, with no
extra requests or tokens. Escape, manual edits, page/player changes, or changed
AI configuration cancel remaining fills. Earlier applied fields remain as they
are; answers are never submitted automatically.

**Automatic test filling** is a separate off-by-default AI feature. Enable it
independently of Test Question Helper and assign **Start or stop filling the
loaded eTest** in your browser's extension shortcut settings. In a test showing
all questions together, press that shortcut to start or stop; Escape also stops.
It processes only questions rendered when started, one request at a time, skips
answered or manually edited questions, and holds answers while their question is
hovered or focused. It never navigates or submits. There are no queue controls,
progress, spinners, suggestion notes or error messages on the test page; use the
AI activity log in Settings afterwards. Provider failures stop the queue.
Provider configuration, notes and filling timing are shared with the individual
helper. Each processed question consumes its normal request; stopping prevents
remaining work but cannot recall a request already sent to the provider.

**Use reference text** is off by default. Enable it to show the editor and file
controls. Paste text or load a UTF-8 `.txt`/`.md` file up to 128 KB and 20,000
characters, review it and choose **Save text**. Only the text is saved locally,
without the original file or its name. When enabled, saved text is included in
each explicitly requested question sent to the selected provider, consuming more
input tokens and potentially increasing cost. Turning this off hides the editor
and retains the saved text; **Clear text and disable** deletes it and stops
sending it. Reference text is excluded from AI activity logs and both diagnostic
report modes. PDF, Word, images and other files are not supported by this import.

**Restore test fullscreen** is an independent, off-by-default option beneath
**Block Escape Key** in Stay Active settings. When both parent switches are on,
it remembers a fullscreen element containing the current test's visible question view.
After exiting fullscreen, the next genuine click or ordinary keypress inside
those questions requests fullscreen again. It never intercepts Alt-Tab, brings
an unfocused app forward, locks the keyboard, or prevents the browser's own
fullscreen exit. A denied request is not repeatedly retried. Closing/replacing or hiding
the question view, leaving the page or disabling a parent resets it. This is
normal page fullscreen, not a guarantee that the browser/OS cannot leave it.

AI request failures are always shown beside the affected question, even when
Helper messages is off. The preference controls optional suggestion notes and
raw model-response details.

The shared AI configuration in Settings → Experimental contains an **AI activity
log** for both Test Question Helper and Automatic test filling. Logging defaults
on when either feature is enabled; an explicit logging opt-out is preserved.
Entries identify the feature, request stage, provider, public OpenAI model preset,
safe error code, HTTP status and elapsed time when available. Custom model names
are replaced with `custom`. Shortcut delivery distinguishes a missing receiver
from a closed message connection. HTTP guidance helps identify key, permission,
endpoint/model and rate/quota errors. These details do not confirm provider
account state or answer correctness.

**Copy log** copies the displayed safe event details with version information
and UTC timestamps. If clipboard access is denied, a selected read-only text box
allows manual copying. Clear removes the log and any local copy fallback;
turning logging off erases entries and stops recording. Up to 80 events are kept
locally for seven days, pruned on new activity or opening the log. Questions,
answers, reference text, keys, school URLs and raw provider responses are excluded,
as is the entire log from diagnostic reports. No log is uploaded automatically.
A saved page cannot reconstruct past provider errors.

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
- `https://analytics.kryptosss.xyz/*` host access - sends usage analytics to the
  self-hosted Umami server when analytics are enabled.
- `https://raw.githubusercontent.com/JustAlex0000/Edupage-Extras/*` host access -
  reads the public project manifest for update checks.
- Optional access to `localhost`, `127.0.0.1`, `integrate.api.nvidia.com`, or
  `openrouter.ai` is requested
  only when the user tests the matching AI provider connection.
- Optional access to individual HTTP(S) sites is requested when you add them to
  Stay Active. It is used to run the activity shields on those sites.

The extension does not request access to all websites at once.

## Privacy

See the [Privacy Policy](PRIVACY.md). The extension also includes the policy in
English, Slovak, and Czech under Settings → Privacy and in the popup footer.

- Usage analytics send a fixed extension-use pageview on EduPage page loads and
  events when Stay Active Mode is enabled or disabled or its test page is opened
  to the self-hosted Umami server. Settings → Privacy can turn it off. Firefox
  also requires its optional technical and interaction data permission. The
  events contain no EduPage URLs, school names, page content, or account details;
  the server receives the request IP address and browser user agent.
- Other external requests include the optional public GitHub update check and
  user-triggered Test Question Helper requests. Ollama and LM Studio stay on
  the local computer; OpenAI, Gemini, NVIDIA, and OpenRouter receive the current
  question text and any responses already chosen in that question.
- No Edupage credentials are collected.
- Settings are stored locally.
- Saved tests contain question text, recorded answers, locally copied raster
  images when readable, the school origin, and capture timestamps. They stay in
  this browser profile and are excluded from diagnostics. Saving does not call
  AI providers, navigate questions, fetch hidden answers, or submit tests.
- Structured attendance and timetable data used by enhancements is cached
  locally.
- Grade enhancements are generated from data already present in the currently
  loaded Edupage page.
- Attendance percentages are generated from Edupage's existing attendance page
  data and do not use an external API.
- Timetable export generates a calendar file locally.
- Attendance caches are scoped to a freshly verified student, school, and period.
  Ambiguous student ownership is rejected; old ownerless caches are discarded.
- Redacted diagnostics omit account names, subject names, original tooltips,
  arbitrary text, and URL paths. They retain counts, known structural metadata,
  and masked numeric formats. Unredacted reports are an explicit opt-in.

<details>
<summary>Development notes and publishing checks</summary>

## Development Notes

This is a plain browser extension with an `npm`-based toolchain for the
Firefox side (linting, packaging, and publishing). There's no build step for
loading it unpacked in Chrome/Edge — that still works directly from source.

See the [architecture guide](ARCHITECTURE.md) and [contributor workflow](CONTRIBUTING.md)
for development details.

### Configure Umami

The HTTPS origin and website ID are configured in `scripts/background.js`.
If the server address changes, update `UMAMI_ORIGIN` and its corresponding
host permission in `manifest.json`. The extension sends a fixed event to `/api/send`
without credentials or a referrer. Test the integration and both browser consent
paths against the configured server before release. Update the store listing,
privacy policy, and in-product disclosure to reflect the actual data practices
before enabling collection for users.

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

GNU Affero General Public License version 3 only (**AGPL-3.0-only**).
See [LICENSE](LICENSE) for the full terms and [NOTICE](NOTICE) for the retained
MIT notice covering previously published code and contributions. Earlier MIT
releases retain their original permissions.

Corresponding source: https://github.com/JustAlex0000/Edupage-Extras

The model picker includes GPT-6.1 Terra, GPT-6.1 Sol, GPT-6 Luna and GPT-6 Astra,
plus Gemini 4 Argon, Gemini 4 Carbon and Gemini 3.8 Flash. Existing selections and
custom model IDs are retained. Provider access still depends on your account.

Firefox does not allow extensions to open `about:addons`. Shortcut buttons there
show instructions and a copyable address: open it manually, then use the gear
menu → **Manage Extension Shortcuts**. Chrome buttons open its native shortcuts
page as before.
