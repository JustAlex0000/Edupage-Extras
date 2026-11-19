# Edupage Extras Privacy Policy

Last updated November 19, 2026.

## Usage analytics

Edupage Extras uses a self-hosted Umami server at `analytics.kryptosss.xyz`
to measure extension usage. When analytics are enabled, the extension sends an
HTTPS request with a fixed extension identifier and a generic pageview when
an EduPage page loads. It also sends an event when Stay Active Mode is enabled
or disabled or when its test page is opened.

The server receives the request IP address and browser user agent. Analytics
requests omit cookies, credentials, referrers, actual EduPage URLs, school
names, page content, and account details.

You can stop future analytics requests in **Settings → Privacy → Usage
analytics**. On Chromium browsers, analytics are enabled by default. On
Firefox, the extension also requires the optional **Technical and interaction
data** permission before sending analytics.

## Data processed in your browser

The extension reads data already available in EduPage to display grades,
attendance, timetables, and other enhancements. Settings and attendance and
timetable caches are stored locally. Timetable exports are generated locally.
The extension does not collect EduPage login credentials.

If you enable test saving and save a test, the browser profile stores the
question text, recorded answers, readable question images, school origin,
and capture timestamps. You can delete saved tests from the extension.
Diagnostics are generated locally and can be exported or shared by you.

## Optional external requests

- **Update checks.** When enabled, the extension requests public version
  information from GitHub. GitHub receives ordinary network request metadata.
- **Test Question Helper.** When you explicitly request help, the extension
  sends the current question and any choices already selected to the AI provider
  you configured. If you enabled reference notes for AI requests, those notes
  can also be included. Provider credentials are stored in the browser and
  used to authenticate to the selected provider. The cloud providers are
  OpenAI, Google Gemini, NVIDIA, and OpenRouter. Their own privacy and retention
  policies apply to requests they receive. Ollama and LM Studio use a local
  endpoint on your device.

## Questions and data requests

For privacy questions or requests about analytics data, contact the maintainers
through the [Edupage Extras issue tracker](https://github.com/JustAlex0000/Edupage-Extras/issues).
Please keep personal information out of public issues.
