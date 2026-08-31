#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, createFirefoxPackageStaging } = require("./package-policy");

const command = process.argv[2];
if (!new Set(["lint", "run"]).has(command)) {
  console.error("Use lint or run.");
  process.exit(1);
}

const staging = createFirefoxPackageStaging(`ee-firefox-${command}-`);
const webExt = path.join(ROOT, "node_modules", ".bin", "web-ext");
const args = [command, "--source-dir", staging, "--no-config-discovery"];
if (command === "run") args.push("--target", "firefox-desktop");

try {
  execFileSync(webExt, args, { cwd: ROOT, stdio: "inherit" });
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
