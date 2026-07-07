#!/usr/bin/env node
/**
 * Safety net for the Firefox build: lists the contents of the most recently
 * built .xpi/.zip in web-ext-artifacts/ and fails loudly if anything that
 * should never ship is present.
 *
 * Exists because of a real incident: an earlier version of the build setup
 * disabled web-ext's ignore-files for docs/ (gitignored on purpose — it
 * contains real-school-data references) and it ended up packaged into a
 * built .xpi. This script re-checks the *actual built artifact*, not just the
 * build command's flags, so a future change to those flags can't silently
 * regress this again without the check catching it.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const artifactsDir = path.join(__dirname, "..", "web-ext-artifacts");
const FORBIDDEN_PREFIXES = [
  "docs/",
  "graphify-out/",
  "tests/",
  ".github/",
  ".claude/",
  "node_modules/",
];
const FORBIDDEN_EXACT = ["package.json", "package-lock.json", "FIREFOX_RELEASE.md", "CHROME_RELEASE.md"];

function findLatestZip() {
  if (!fs.existsSync(artifactsDir)) return null;
  const zips = fs.readdirSync(artifactsDir).filter((name) => name.endsWith(".zip") || name.endsWith(".xpi"));
  if (zips.length === 0) return null;
  return zips
    .map((name) => ({ name, mtime: fs.statSync(path.join(artifactsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
}

const zipName = findLatestZip();
if (!zipName) {
  console.error("No .zip/.xpi found in web-ext-artifacts/ — run `npm run build:firefox` first.");
  process.exit(1);
}

const zipPath = path.join(artifactsDir, zipName);
const listing = execSync(`unzip -l ${JSON.stringify(zipPath)}`, { encoding: "utf8" });
const entries = listing
  .split("\n")
  .map((line) => line.trim().match(/\d{2}:\d{2}\s+(\S.*)$/))
  .filter(Boolean)
  .map((match) => match[1]);

const offenders = entries.filter((entry) =>
  FORBIDDEN_PREFIXES.some((prefix) => entry.startsWith(prefix))
  || FORBIDDEN_EXACT.includes(entry));

if (offenders.length > 0) {
  console.error(`FAILED: ${zipName} contains files that must never ship:`);
  offenders.forEach((entry) => console.error(`  - ${entry}`));
  process.exit(1);
}

console.log(`OK: ${zipName} (${entries.length} files) — no forbidden paths found.`);
