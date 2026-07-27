const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

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
});

test("mobile redirect remains an explicit storage-backed opt-in", () => {
  const content = fs.readFileSync(path.join(ROOT, "scripts/content.js"), "utf8");
  const background = fs.readFileSync(path.join(ROOT, "scripts/background.js"), "utf8");

  assert.doesNotMatch(content, /eeMobileRedirectEnabledCache/, "mobile redirect must not trust a stale page-local cache");
  assert.doesNotMatch(background, /seedMobileRedirectDefault/, "Android installs must not silently enable mobile redirect");
});
