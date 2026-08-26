const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const { isShippableEntry } = require("../scripts-dev/package-policy");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

test("manifest version and referenced package files stay valid", () => {
  const manifest = readJson("manifest.json");
  const packageJson = readJson("package.json");
  const references = new Set([
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...(manifest.background?.scripts || []),
  ]);

  for (const contentScript of manifest.content_scripts || []) {
    for (const file of contentScript.css || []) references.add(file);
    for (const file of contentScript.js || []) references.add(file);
  }

  assert.equal(manifest.version, packageJson.version);
  for (const relativePath of references) {
    assert.ok(relativePath, "manifest contains an empty file reference");
    assert.ok(
      fs.existsSync(path.join(ROOT, relativePath)),
      `manifest references missing file: ${relativePath}`,
    );
  }
});

test("AI providers use optional, narrowly scoped host access", () => {
  const manifest = readJson("manifest.json");
  const optionalHosts = manifest.optional_host_permissions || [];
  assert.deepEqual(optionalHosts.sort(), [
    "http://127.0.0.1/*",
    "http://localhost/*",
    "https://integrate.api.nvidia.com/*",
    "https://openrouter.ai/*",
  ].sort());
  assert.ok(!manifest.host_permissions.includes("https://integrate.api.nvidia.com/*"));
  assert.ok(!manifest.host_permissions.includes("https://openrouter.ai/*"));
});

test("AI suggestion command is declared without a browser-assigned default", () => {
  const manifest = readJson("manifest.json");
  assert.equal(manifest.commands["suggest-test-question"].description, "Suggest an eTest answer");
  assert.equal(Object.hasOwn(manifest.commands["suggest-test-question"], "suggested_key"), false);
});

test("eTest copy commands are declared without browser-assigned defaults", () => {
  const manifest = readJson("manifest.json");
  for (const command of ["copy-test-question", "copy-whole-test"]) {
    assert.ok(manifest.commands[command]);
    assert.equal(Object.hasOwn(manifest.commands[command], "suggested_key"), false);
  }
});

test("locale catalogs have aligned, non-empty messages", () => {
  const locales = Object.fromEntries(
    ["en", "sk", "cs"].map((locale) => [locale, readJson(`_locales/${locale}/messages.json`)]),
  );
  const expectedKeys = Object.keys(locales.en).sort();

  for (const [locale, catalog] of Object.entries(locales)) {
    assert.deepEqual(Object.keys(catalog).sort(), expectedKeys, `${locale} locale keys differ from English`);
    for (const [key, entry] of Object.entries(catalog)) {
      assert.equal(typeof entry?.message, "string", `${locale}.${key} has no string message`);
      assert.ok(entry.message.trim(), `${locale}.${key} has an empty message`);
    }
  }
});

test("settings markup only uses defined English locale keys", () => {
  const english = readJson("_locales/en/messages.json");
  const html = fs.readFileSync(path.join(ROOT, "menu/settings.html"), "utf8");
  const referencedKeys = new Set();

  for (const match of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) {
    referencedKeys.add(match[1]);
  }
  for (const match of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const binding of match[1].split(",")) {
      const separator = binding.indexOf(":");
      if (separator >= 0) referencedKeys.add(binding.slice(separator + 1).trim());
    }
  }

  for (const key of referencedKeys) {
    assert.ok(english[key], `settings.html references missing locale key: ${key}`);
  }
});

test("store package allowlist rejects repository and ignored local files", () => {
  for (const entry of [
    "manifest.json",
    "LICENSE",
    "_locales/en/messages.json",
    "images/icon-128.png",
    "menu/settings.html",
    "scripts/lib/ee-common.js",
  ]) {
    assert.equal(isShippableEntry(entry), true, `expected shippable entry: ${entry}`);
  }
  for (const entry of [
    "AGENTS.md",
    "PROJECT_CONTEXT.md",
    "local-experiments/playwright/test-settings.png",
    "docs/private/capture.html",
    "tests/background.test.js",
    "scripts/_template-enhancer.js",
  ]) {
    assert.equal(isShippableEntry(entry), false, `expected rejected entry: ${entry}`);
  }
});

test("settings exposes a cache clear action for reconstructible school data", () => {
  const html = fs.readFileSync(path.join(ROOT, "menu/settings.html"), "utf8");
  const settings = fs.readFileSync(path.join(ROOT, "menu/settings.js"), "utf8");

  assert.match(html, /id="ClearCachedSchoolDataButton"[^>]*type="button"/);
  assert.match(html, /id="ClearCachedSchoolDataStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(settings, /GRADES_ATTENDANCE_CACHE_KEY,\s*TIMETABLE_SYNC_CACHE_KEY,/);
});

test("eTest protections use enabled defaults while remaining master-gated", () => {
  const html = fs.readFileSync(path.join(ROOT, "menu/settings.html"), "utf8");
  const settings = fs.readFileSync(path.join(ROOT, "menu/settings.js"), "utf8");
  const bridge = fs.readFileSync(path.join(ROOT, "scripts/activity-shield-bridge.js"), "utf8");
  const main = fs.readFileSync(path.join(ROOT, "scripts/activity-shield-main.js"), "utf8");
  const appearanceStart = html.indexOf('id="panel-appearance"');
  const appearanceEnd = html.indexOf("</section>", appearanceStart);
  const appearanceMarkup = html.slice(appearanceStart, appearanceEnd);
  const experimentalStart = html.indexOf('id="panel-experimental"');
  const experimentalEnd = html.indexOf("</section>", experimentalStart);
  const experimentalMarkup = html.slice(experimentalStart, experimentalEnd);

  assert.ok(appearanceStart >= 0, "expected Appearance settings panel");
  assert.ok(experimentalStart >= 0, "expected Experimental settings panel");
  assert.ok(
    appearanceMarkup.includes('id="EtestAutoThemeOffCheckbox"'),
    "automatic eTest theme suppression must live in Appearance",
  );
  assert.ok(
    !experimentalMarkup.includes('id="EtestAutoThemeOffCheckbox"'),
    "automatic eTest theme suppression must not stay in Experimental",
  );
  for (const controlId of [
    "ActivityBlockEsc",
    "ActivityJquerySweep",
    "ActivityFullscreenSpoof",
  ]) {
    assert.ok(experimentalMarkup.includes(`id="${controlId}"`), `${controlId} must stay in Experimental`);
    assert.equal(html.indexOf(`id="${controlId}"`), html.lastIndexOf(`id="${controlId}"`), `${controlId} must be unique`);
  }

  for (const key of [
    "eeActivityShieldBlockEsc",
    "eeActivityShieldJquerySweep",
    "eeActivityShieldFullscreenSpoof",
  ]) {
    const enabledDefault = new RegExp(`${key}: true`);
    assert.match(settings, enabledDefault, `${key} must default on in settings`);
    assert.match(bridge, enabledDefault, `${key} must default on in the page bridge`);
  }
  assert.match(
    settings,
    /chrome\.storage\.local\.get\(\{ \[ETEST_AUTO_THEME_OFF_KEY\]: true \}/,
    "automatic eTest theme suppression must default on",
  );
  assert.match(main, /if \(!strictActive\("blockEsc"\)\) return;/, "Escape blocking must require an explicit true value");
  assert.match(main, /if \(!strictActive\("jquerySweep"\)\) return;/, "listener removal must require an explicit true value");
  assert.match(main, /if \(!strictActive\("fullscreenSpoof"\)\) return;/, "fullscreen blocking must require an explicit true value");
  assert.match(
    main,
    /type\.includes\("\.etestplayeral"\) \|\| type\.includes\("\.etestaplayer"\)/,
    "phone-specific eTest jQuery handlers must be gated by namespace",
  );
  assert.match(
    main,
    /if \(strictActive\("jquerySweep"\)\) return undefined;/,
    "the jQuery listener gate must remain controlled by the existing master-gated preference",
  );
});

test("Activity Shield avoids permanent high-frequency polling and cancels synthetic frames reliably", () => {
  const main = fs.readFileSync(path.join(ROOT, "scripts/activity-shield-main.js"), "utf8");

  assert.match(main, /jqueryGateAttempts >= 400/);
  assert.match(main, /clearInterval\(jqueryGateTimer\)/);
  assert.match(main, /if \(syntheticFrames\.has\(id\)\)/);
  assert.doesNotMatch(main, /active\("animationFrame"\) && readNativeHidden\(\) && syntheticFrames\.has\(id\)/);
});

test("route-specific and short-lived enhancers do not leave unrelated observers running", () => {
  const bootstrap = fs.readFileSync(path.join(ROOT, "scripts/grades-bootstrap.js"), "utf8");
  const autologin = fs.readFileSync(path.join(ROOT, "scripts/autologin.js"), "utf8");

  assert.match(bootstrap, /\^\\\/znamky\(\?:\\\/\|\$\)/);
  assert.match(bootstrap, /if \(!isGradesPage\(\)\) return;/);
  assert.match(autologin, /observer\?\.disconnect\(\)/);
  assert.match(autologin, /attempts >= maxAttempts/);
});

test("virtual grade popover exposes accessible semantics and viewport handling", () => {
  const virtual = fs.readFileSync(path.join(ROOT, "scripts/grades-virtual.js"), "utf8");

  assert.match(virtual, /setAttribute\("role", "dialog"\)/);
  assert.match(virtual, /setAttribute\("aria-labelledby", "ee-vg-popover-title"\)/);
  assert.match(virtual, /event\.key !== "Escape"/);
  assert.match(virtual, /restoreFocus: true/);
  assert.match(virtual, /computeVirtualPopoverPosition/);
});
