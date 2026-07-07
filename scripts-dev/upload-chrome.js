#!/usr/bin/env node
// Uploads the Chrome zip built by build-chrome.js to the Chrome Web Store.
// Credentials come from env vars (EXTENSION_ID, CLIENT_ID, CLIENT_SECRET,
// REFRESH_TOKEN) — see CHROME_RELEASE.md. Exists as a script (rather than an
// inline npm command) so the versioned zip path doesn't need shell quoting.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const { version } = require("../package.json");
const zipPath = path.join(__dirname, "..", "web-ext-artifacts", `edupage_extras-${version}-chrome.zip`);

// npm run puts node_modules/.bin on PATH, so the CLI resolves from there.
execFileSync("chrome-webstore-upload", ["upload", "--source", zipPath, "--auto-publish"], {
  stdio: "inherit",
});
