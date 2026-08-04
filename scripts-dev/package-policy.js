const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(ROOT, "web-ext-artifacts");
const SHIP_ROOTS = ["manifest.json", "_locales", "images", "menu", "scripts", "LICENSE"];
const EXCLUDED_ENTRIES = new Set(["scripts/_template-enhancer.js"]);

function createPackageStaging(prefix) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    for (const entry of SHIP_ROOTS) {
      fs.cpSync(path.join(ROOT, entry), path.join(staging, entry), { recursive: true });
    }
    for (const entry of EXCLUDED_ENTRIES) {
      fs.rmSync(path.join(staging, entry), { force: true });
    }
    return staging;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function isShippableEntry(entry) {
  const normalized = String(entry || "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || EXCLUDED_ENTRIES.has(normalized)) return false;
  return SHIP_ROOTS.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

module.exports = {
  ROOT,
  ARTIFACTS_DIR,
  SHIP_ROOTS,
  EXCLUDED_ENTRIES,
  createPackageStaging,
  isShippableEntry,
};
