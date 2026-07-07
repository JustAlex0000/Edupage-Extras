#!/usr/bin/env node
/**
 * Builds the Chrome Web Store .zip. Chrome can't use the manifest as-is:
 *  - `background.scripts` is the Firefox MV3 event-page form; the Web Store
 *    validator rejects it (Chrome only wants `background.service_worker`).
 *  - `browser_specific_settings` is Firefox-only and triggers warnings.
 * So this stages an allowlist of shippable paths into a temp dir, rewrites the
 * manifest without those keys, and zips it into web-ext-artifacts/ (same place
 * the Firefox build lands, so verify-firefox-package.js checks it too).
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const artifactsDir = path.join(root, "web-ext-artifacts");

// Everything the extension actually ships — anything not listed here never
// reaches the zip, so gitignored/analysis dirs can't leak in by accident.
const SHIP = ["manifest.json", "_locales", "images", "menu", "scripts", "LICENSE"];

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "ee-chrome-"));
for (const entry of SHIP) {
  fs.cpSync(path.join(root, entry), path.join(staging, entry), { recursive: true });
}

const manifestPath = path.join(staging, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
delete manifest.browser_specific_settings;
delete manifest.background.scripts; // keep only service_worker for Chrome
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

fs.mkdirSync(artifactsDir, { recursive: true });
const zipName = `edupage_extras-${manifest.version}-chrome.zip`;
const zipPath = path.join(artifactsDir, zipName);
fs.rmSync(zipPath, { force: true });
execSync(`zip -r -X ${JSON.stringify(zipPath)} .`, { cwd: staging, stdio: "pipe" });
fs.rmSync(staging, { recursive: true, force: true });

console.log(`Built ${path.relative(root, zipPath)} (Chrome manifest: Firefox-only keys stripped).`);
