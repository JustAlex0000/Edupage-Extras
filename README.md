# Edupage Extras

Edupage Extras is a Chromium browser extension that improves the
Edupage web portal with small (and big) quality-of-life features. 

**This project is not affiliated with Edupage, aSc Applied Software Consultants,
or any school using Edupage.**

## Installation

### Load unpacked in Chrome or Edge

1. Download or clone this repository. (Do not forget to extract it if downloading directly)
2. Open `chrome://extensions` in any Chromium browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder: `Edupage-Extras/`.
6. Open an Edupage page such as `https://your-school.edupage.org/`, or reload an already opened page.

## Features

### Appearance

- **Themes** for Edupage pages and extension menus.
- **Theme hotkey** support for toggling themes on or off through Chrome's
  extension shortcuts page.
- **Theme picker** with Midnight Blue, Ocean Cyan, Forest Green, Emerald Green,
  Rose Pink, Royal Purple, and Light themes.
- **Centered layout** option for a cleaner main page layout.
- **Help text cleanup** for hiding the top-right Edupage help greeting.

### Grades

- **Grade badges** on the Edupage grades page.
- **Color-coded average bars** for subject averages.
- **Overall average row** based on the averages Edupage already renders.
- **JSON export** of the grades table (subject, average, and attendance fields
  when enabled) via an Export JSON button above the table. The file is
  human-readable, self-documenting, and easy to feed back into scripts.

### Attendance

- **Subject attendance** inside the Edupage grades table.
- **Halfyear absence percentage** inside Edupage's existing attendance summary.
- **Second halfyear start date override** in Settings for attendance
  calculations when EduPage's default date needs adjustment.
- Uses the official attendance data already embedded in the loaded Edupage page.
- Highlights the currently active halfyear and shows the raw absent/total lesson ratio.

The extension reads the values from Edupage's existing grade table. It does not
log in, use credentials, fetch grades from a server, or calculate hidden grade data.

### Languages

- **Localized interface** for the popup, Settings, and Experimental pages, plus
  the injected grades columns. English, Slovak, and Czech are bundled.
- The language follows the browser UI language automatically (Chrome's
  `chrome.i18n`), falling back to English.

### Updates

- **Update reminders** checks the public GitHub project manifest and compares it
  with the installed unpacked extension version.
- If a newer version is available, the extension shows a reminder to pull the
  latest project from GitHub and reload the unpacked extension from
  `chrome://extensions/`.
- Update checks do not send Edupage data anywhere.

### Google Calendar Sync

- **Google Calendar sync** can mirror the current EduPage timetable to a
  dedicated Google Calendar.
- Supports **current week** sync or **current halfyear** sync.
- Uses a user-provided Google OAuth client and browser-based sign-in.
- Stores Google OAuth tokens locally in the browser for background sync.
- **This feature is WIP**

## Usage

- Click the extension icon to quickly toggle themes or open settings.
- Open **Settings** for appearance and grade options.
- Assign a shortcut in Chrome's extension shortcuts page if you want to toggle
  themes without opening Settings.
- Choose **Custom** in the theme picker to build your own colors.
- Use **Check For Updates** in Settings to manually check the public GitHub
  version. If an update is available, pull the latest project and reload the
  unpacked extension in `chrome://extensions/`.

## Permissions

Edupage Extras requests:

- `storage` - saves extension settings locally in the browser.
- `tabs` - finds open Edupage tabs so settings can be applied or tabs can be
  reloaded from the settings UI.
- `alarms` - checks for updates on a daily schedule.
- `notifications` - shows an unpacked-version update reminder when a newer
  GitHub version is available.
- `identity` - completes the optional Google OAuth sign-in flow for Google
  Calendar sync.
- `https://*.edupage.org/*` host access - injects the extension scripts only on
  Edupage pages and reads timetable/attendance data already present in Edupage.
- `https://edublurtesting.ct.ws/*` - testing purposes
- `https://raw.githubusercontent.com/Alexosavrua/Edupage-Extras/*` host access -
  reads the public project manifest for update checks.
- `https://accounts.google.com/*` host access - opens the Google sign-in and
  consent screens for the optional Google Calendar feature. - not mandatory only used when google sync is used you can turn it off manually.
- `https://oauth2.googleapis.com/*` host access - exchanges and refreshes
  Google OAuth tokens for the optional Google Calendar feature. - not mandatory only used when google sync is used you can turn it off manually.
- `https://www.googleapis.com/*` host access - creates and updates Google
  Calendar events for the optional Google Calendar feature. - not mandatory only used when google sync is used you can turn it off manually.

The extension does not request access to all websites.

## Privacy

- No backend server.
- No analytics.
- No external requests made by the extension except the optional public GitHub
  manifest update check and the optional Google Calendar sync flow.
- No Edupage credentials are collected.
- Settings are stored locally with `chrome.storage.local`.
- Grade enhancements are generated from data already present in the currently
  loaded Edupage page.
- Attendance percentages are generated from Edupage's existing attendance page
  data and do not use an external API.
- Google Calendar OAuth tokens, if configured, are stored locally in the
  browser profile to support manual and scheduled sync.
- Google OAuth client details, if configured for Calendar sync, are also stored
  locally in the browser profile.


## Main Files

- `manifest.json` - extension manifest, permissions, and content script setup.
- `scripts/background.js` - GitHub update checks and update reminders.
- `scripts/content.js` - themes, layout cleanup, and visual fixes.
- `scripts/grades-enhancer.js` - grade badges, average bars, and the overall
  average row.
- `scripts/attendance-enhancer.js` - injects current halfyear absence
  percentages into Edupage's attendance summary.
- `menu/settings.html` - normal user-facing settings.
- `menu/experimental.html` - experimental features that are kept
  separate from normal settings.

## Development Notes

This is a plain browser extension. There is no build step required for the
current version.

Recommended checks before publishing:

```powershell
node --check menu\menu.js
node --check menu\settings.js
node --check menu\experimental.js
node --check menu\i18n.js
node --check scripts\background.js
node --check scripts\content.js
node --check scripts\grades-enhancer.js
node --check scripts\attendance-enhancer.js
node --check scripts\timetable-sync.js
node tests\grades-enhancer.test.js
node tests\attendance-enhancer.test.js
node tests\background.test.js
node tests\timetable-sync.test.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
node -e "['en','sk','cs'].forEach(l=>JSON.parse(require('fs').readFileSync('_locales/'+l+'/messages.json','utf8'))); console.log('locales ok')"
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
