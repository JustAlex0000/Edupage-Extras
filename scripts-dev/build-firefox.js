#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT,
  ARTIFACTS_DIR,
  createPackageStaging,
} = require("./package-policy");

const staging = createPackageStaging("ee-firefox-");
const webExt = path.join(ROOT, "node_modules", ".bin", "web-ext");

try {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  execFileSync(webExt, [
    "build",
    "--source-dir", staging,
    "--artifacts-dir", ARTIFACTS_DIR,
    "--overwrite-dest",
    "--no-config-discovery",
  ], { cwd: ROOT, stdio: "inherit" });
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
