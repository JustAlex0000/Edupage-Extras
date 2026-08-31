#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT,
  ARTIFACTS_DIR,
  createFirefoxPackageStaging,
} = require("./package-policy");

const apiKey = process.env.WEB_EXT_API_KEY;
const apiSecret = process.env.WEB_EXT_API_SECRET;
if (!apiKey || !apiSecret) {
  console.error("WEB_EXT_API_KEY and WEB_EXT_API_SECRET are required to sign the Firefox package.");
  process.exit(1);
}

const staging = createFirefoxPackageStaging("ee-firefox-sign-");
const webExt = path.join(ROOT, "node_modules", ".bin", "web-ext");

try {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  execFileSync(webExt, [
    "sign",
    "--source-dir", staging,
    "--artifacts-dir", ARTIFACTS_DIR,
    "--channel", "listed",
    "--no-config-discovery",
    "--api-key", apiKey,
    "--api-secret", apiSecret,
  ], { cwd: ROOT, stdio: "inherit" });
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
