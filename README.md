# Edupage Extras

A bunch of quality-of-life extras for EduPage: themes, grade tools, attendance
stats and timetable comparisons. Pick what you need in Settings.

[Install for Chrome / Edge](https://chromewebstore.google.com/detail/edupage-extras/ljakjcljhfkjgndmopmpaakklgnkccca)
· [Releases](https://github.com/JustAlex0000/Edupage-Extras/releases)
· [Discord](https://discord.gg/eNZXHesA9j)

## Features

### Appearance

- Dark mode, several color themes and a custom theme builder.
- Centered layout and controls for hiding page clutter.
- A keyboard shortcut to toggle themes.

### Grades

- Color-coded averages, subject sorting and filtering.
- A Weights panel for subject categories and individual assessments.
- A Virtual Grade Calculator. Add hypothetical grades and see how your average
  would change, using EduPage's weights. Numeric and percentage grading are supported.
- Export to CSV, JSON or text.

### Attendance

- Per-subject absence percentages and lesson counts.
- Current-halfyear absence percentages.
- End-of-halfyear estimates, assuming you miss no more lessons.

These figures depend on your school's data. Predictions are estimates, not
changes to your school records.

### Timetable

- Different colors for substitutions and classroom changes.
- Export a week or half-year to an `.ics` calendar file.
- Compare your timetable with another class available to your account, or an
  imported weekly or alternating A/B timetable.
- Save several comparison schedules and switch between them in Settings.
- See both finish times and expandable lesson columns on Home, or compare the
  whole week on a shared time grid.

Imported templates repeat regularly; they do not automatically account for
holidays, substitutions or cancellations. Shared gaps mean no scheduled lessons,
not guaranteed availability.

### Curriculum and languages

- Export curriculum topics and taught dates to CSV or text.
- English, Slovak and Czech. Follow your browser's language or choose one in Settings.

## Installation

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/edupage-extras/ljakjcljhfkjgndmopmpaakklgnkccca).
Store installations update through the browser.

Firefox store publication is paused. Firefox development setup is described in
[CONTRIBUTING.md](CONTRIBUTING.md).

To load the source in Chrome or Edge:

1. Clone or download this repository.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Open EduPage and configure the extension in Settings.

Source installations need manual updates. Pull the latest code, reload the
extension, then refresh open EduPage tabs when it is safe to do so.

## Privacy

See the [Privacy Policy](PRIVACY.md). The extension also includes the policy in
English, Slovak, and Czech under Settings → Privacy and in the popup footer.

Settings and school-data caches are stored in your browser profile. The extension
uses your existing EduPage session to load the school data needed by its tools.

Usage analytics are enabled by default in Chrome. Turn them off in
**Settings → Privacy**. They send fixed usage events to `analytics.kryptosss.xyz`,
without school URLs, account details or page content in the payload. The server
receives normal connection information, including your IP address and browser
user agent.

Optional service connections and their data flows are documented in the
[architecture guide](ARCHITECTURE.md#data-handling). This README is a feature
overview, not a complete privacy policy.

## Development and support

The extension uses plain JavaScript. No build step is needed to load it from source.
See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests and releases, and
[ARCHITECTURE.md](ARCHITECTURE.md) for the code layout and optional tools.
Changes are listed in [CHANGELOG.md](CHANGELOG.md).

EduPage changes its pages over time, and school layouts differ. If something
breaks, report it on [GitHub Issues](https://github.com/JustAlex0000/Edupage-Extras/issues)
or [Discord](https://discord.gg/eNZXHesA9j). Include your browser, extension version
and steps to reproduce it. Keep passwords, API keys and private school data out
of public reports.

## License

[AGPL-3.0-only](LICENSE), with retained [MIT notices](NOTICE) for earlier code.

This is an independent community project, not affiliated with EduPage,
aSc Applied Software Consultants or any school.
