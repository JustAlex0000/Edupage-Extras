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
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT: root,
  ARTIFACTS_DIR: artifactsDir,
  createPackageStaging,
} = require("./package-policy");

const staging = createPackageStaging("ee-chrome-");

try {
  const manifestPath = path.join(staging, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  delete manifest.browser_specific_settings;
  delete manifest.background.scripts; // keep only service_worker for Chrome
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  fs.mkdirSync(artifactsDir, { recursive: true });
  const zipName = `edupage_extras-${manifest.version}-chrome.zip`;
  const zipPath = path.join(artifactsDir, zipName);
  fs.rmSync(zipPath, { force: true });
  execFileSync("zip", ["-r", "-X", zipPath, "."], { cwd: staging, stdio: "pipe" });

  console.log(`Built ${path.relative(root, zipPath)} (Chrome manifest: Firefox-only keys stripped).`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
