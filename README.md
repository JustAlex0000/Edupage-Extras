# Edupage Extras

Edupage Extras is a Chromium Manifest V3 browser extension that improves the
Edupage web portal with small quality-of-life features. It runs only on
`https://*.edupage.org/*` pages and changes Edupage's existing interface in
place.

This project is not affiliated with Edupage, aSc Applied Software Consultants,
or any school using Edupage.

## Features

### Appearance

- **Themes** for Edupage pages and extension menus.
- **Theme picker** with Midnight Blue, Ocean Cyan, Forest Green, Emerald Green,
  Rose Pink, Royal Purple, and Light themes.
- **Centered layout** option for a cleaner main page layout.
- **Help text cleanup** for hiding the top-right Edupage help greeting.

### Grades

- **Grade badges** on the Edupage grades page.
- **Color-coded average bars** for subject averages.
- **Overall average row** based on the averages Edupage already renders.

### Attendance

- **Halfyear absence percentage** inside Edupage's existing attendance summary.
- Uses the official attendance data already embedded in the loaded Edupage page.
- Highlights the currently active halfyear and shows the raw absent/total lesson ratio.

The extension reads the values from Edupage's existing grade table. It does not
log in, fetch grades from a server, or calculate hidden grade data.

### Experimental

The Experimental page contains **Stay Active Mode**. This is an Edupage-only
experimental feature that reduces page interruptions caused by common browser
activity signals such as:

- tab visibility changes
- hidden-tab state
- focus and blur events
- mouse leaving the page
- clipboard, selection, drag, and drop events
- background animation throttling

This feature is intentionally kept in the Experimental page. It may not affect
every Edupage behavior, and some Edupage features can still depend on server-side
state, timing, full-screen behavior, or other browser mechanisms.

### Updates

- **Update reminders** check the public GitHub project manifest and compare it
  with the installed unpacked extension version.
- If a newer version is available, the extension shows a reminder to pull the
  latest project from GitHub.
- Update checks do not send Edupage data anywhere.

## Installation

### Load unpacked in Chrome or Edge

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder: `Edupage-Extras/`.
6. Open an Edupage page such as `https://your-school.edupage.org/`.

After changing `manifest.json` or content scripts, reload the extension from the
extensions page.

## Usage

- Click the extension icon to quickly toggle themes or open settings.
- Open **Settings** for appearance and grade options.
- Choose **Custom** in the theme picker to build your own colors.
- Use **Check For Updates** in Settings to manually check the public GitHub
  version.
- Open **Experimental** from Settings for Stay Active Mode controls.
- If Experimental settings were changed while Edupage tabs are already open, use
  **Reload Edupage Tabs** from the Experimental page for the cleanest result.

## Permissions

Edupage Extras requests:

- `storage` - saves extension settings locally in the browser.
- `tabs` - finds open Edupage tabs so settings can be applied or tabs can be
  reloaded from the settings UI.
- `alarms` - checks for updates on a daily schedule.
- `notifications` - shows an unpacked-version update reminder when a newer
  GitHub version is available.
- `https://*.edupage.org/*` host access - injects the extension scripts only on
  Edupage pages.
- `https://raw.githubusercontent.com/Alexosavrua/Edupage-Extras/*` host access -
  reads the public project manifest for update checks.

The extension does not request access to all websites.

## Privacy

- No backend server.
- No analytics.
- No external requests made by the extension except the optional public GitHub
  manifest update check.
- No credentials are collected.
- Settings are stored locally with `chrome.storage.local`.
- Grade enhancements are generated from data already present in the currently
  loaded Edupage page.
- Attendance percentages are generated from Edupage's existing attendance page
  data and do not use an external API.

## Project Structure

```text
Edupage-Extras/
|-- manifest.json
|-- README.md
|-- images/
|   `-- placeholder_icon.png
|-- menu/
|   |-- menu.html
|   |-- menu.css
|   |-- menu.js
|   |-- settings.html
|   |-- settings.css
|   |-- settings.js
|   |-- experimental.html
|   |-- experimental.css
|   `-- experimental.js
`-- scripts/
    |-- background.js
    |-- instant-theme.css
    |-- content.js
    |-- grades-enhancer.js
    |-- attendance-enhancer.js
    |-- activity-shield-main.js
    `-- activity-shield-bridge.js
```

## Main Files

- `manifest.json` - extension manifest, permissions, and content script setup.
- `scripts/background.js` - GitHub update checks and update reminders.
- `scripts/content.js` - themes, layout cleanup, and visual fixes.
- `scripts/grades-enhancer.js` - grade badges, average bars, and the overall
  average row.
- `scripts/attendance-enhancer.js` - injects current halfyear absence
  percentages into Edupage's attendance summary.
- `scripts/activity-shield-main.js` - page-world Experimental activity controls.
- `scripts/activity-shield-bridge.js` - storage bridge for Experimental activity
  settings.
- `menu/settings.html` - normal user-facing settings.
- `menu/experimental.html` - experimental features that are intentionally kept
  separate from normal settings.

## Development Notes

This is a plain browser extension. There is no build step required for the
current version.

Recommended checks before publishing:

```powershell
node --check menu\menu.js
node --check menu\settings.js
node --check menu\experimental.js
node --check scripts\background.js
node --check scripts\content.js
node --check scripts\grades-enhancer.js
node --check scripts\attendance-enhancer.js
node --check scripts\activity-shield-main.js
node --check scripts\activity-shield-bridge.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

## Compatibility

Edupage changes its HTML, CSS, and JavaScript over time. Some selectors or data
formats may need updates when Edupage changes its pages.

If a feature stops working:

1. Reload the extension.
2. Reload the Edupage tab.
3. Check whether the feature is enabled in Settings or Experimental.
4. Open the browser console and look for Edupage Extras errors.

## License

ISC
