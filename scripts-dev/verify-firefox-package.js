#!/usr/bin/env node
/**
 * Safety net for store packages: lists an explicitly selected current-version
 * archive and fails unless every entry belongs to the shared shipping
 * allowlist.
 *
 * Exists because of a real incident: an earlier version of the build setup
 * disabled web-ext's ignore-files for local docs/private/ captures and they
 * ended up packaged into a
 * built .xpi. This script re-checks the *actual built artifact*, not just the
 * build command's flags, so a future change to those flags can't silently
 * regress this again without the check catching it.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { ARTIFACTS_DIR: artifactsDir, isShippableEntry } = require("./package-policy");

function resolveArtifact(browser) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const suffix = browser === "chrome" ? "-chrome" : "";
  return path.join(artifactsDir, `edupage_extras-${packageJson.version}${suffix}.zip`);
}

const browserIndex = process.argv.indexOf("--browser");
const browser = browserIndex >= 0 ? process.argv[browserIndex + 1] : "firefox";
if (!["firefox", "chrome"].includes(browser)) {
  console.error("Use --browser firefox or --browser chrome.");
  process.exit(1);
}

const zipPath = resolveArtifact(browser);
const zipName = path.basename(zipPath);
if (!fs.existsSync(zipPath)) {
  console.error(`No current ${browser} package found at ${zipPath}. Build it first.`);
  process.exit(1);
}

const listing = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
const entries = listing
  .split("\n")
  .map((line) => line.trim().match(/\d{2}:\d{2}\s+(\S.*)$/))
  .filter(Boolean)
  .map((match) => match[1]);

const offenders = entries.filter((entry) => !isShippableEntry(entry));

if (offenders.length > 0) {
  console.error(`FAILED: ${zipName} contains files that must never ship:`);
  offenders.forEach((entry) => console.error(`  - ${entry}`));
  process.exit(1);
}

for (const required of ["manifest.json", "LICENSE"]) {
  if (!entries.includes(required)) {
    console.error(`FAILED: ${zipName} is missing required entry ${required}.`);
    process.exit(1);
  }
}

console.log(`OK: ${zipName} (${entries.length} entries) — exact shipping allowlist enforced.`);
