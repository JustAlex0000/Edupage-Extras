// Single source of truth for the extension version: package.json. This copies
// it into manifest.json's "version" field so they can never drift — npm's
// `version` lifecycle script runs this automatically on `npm version patch/minor/major`,
// and the build/run/sign/lint scripts run it as a safety net in case manifest.json
// was ever hand-edited out of sync.
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const manifestPath = path.join(__dirname, "..", "manifest.json");

const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const manifestRaw = fs.readFileSync(manifestPath, "utf8");

const updated = manifestRaw.replace(
	/"version":\s*"[^"]*"/,
	`"version": "${version}"`,
);

if (updated === manifestRaw) {
	const current = JSON.parse(manifestRaw).version;
	if (current !== version) {
		throw new Error(`Could not find a "version" field to update in manifest.json (package.json is ${version}).`);
	}
} else {
	fs.writeFileSync(manifestPath, updated);
}

console.log(`manifest.json version synced to ${version}`);
