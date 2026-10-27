const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.join(__dirname, "..");
const catalogs = Object.fromEntries(["en", "sk", "cs"].map(language => [language, JSON.parse(fs.readFileSync(path.join(root, "_locales", language, "messages.json")))]));

function load({ preference = "auto", browser = "en-US", content = false, firefoxBackground = false } = {}) {
  const stored = { eeLanguage: preference }, changes = [], handlers = [], requests = [];
  const failures = new Set(), delayed = new Map();
  let storageError = false;
  const context = {
    chrome: {
      i18n: { getUILanguage: () => browser, getMessage: key => `native:${key}` },
      runtime: {
        id: "fixture", lastError: null, getURL: file => `chrome-extension://fixture/${file}`,
        onMessage: { addListener: fn => handlers.push(fn) },
        sendMessage(message, callback) { requests.push(message); callback({ ok: true, catalog: catalogs[message.language] }); },
      },
      storage: {
        local: {
          get(keys, callback) { callback(stored); },
          set(values, callback) {
            context.chrome.runtime.lastError = storageError ? { message: "Storage failed" } : null;
            if (!storageError) Object.assign(stored, values);
            callback(); context.chrome.runtime.lastError = null;
          },
        },
        onChanged: { addListener: fn => changes.push(fn) },
      },
    },
    async fetch(url) {
      assert.match(url, /^chrome-extension:\/\/fixture\/_locales\/(en|sk|cs)\/messages\.json$/);
      const language = url.split("/").at(-2);
      if (delayed.has(language)) await delayed.get(language);
      if (failures.has(language)) throw new Error("Catalog unavailable");
      return { ok: true, json: async () => catalogs[language] };
    },
  };
  if (content || firefoxBackground) context.document = {};
  vm.createContext(context);
  if (firefoxBackground) vm.runInContext(fs.readFileSync(path.join(root, "scripts/background-context.js"), "utf8"), context);
  for (const file of ["scripts/lib/ee-common.js", "scripts/lib/ee-i18n.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return { api: context.EE.i18n, context, stored, handlers, requests, failures, delayed,
    change(value, area = "local") { changes.forEach(fn => fn({ eeLanguage: { newValue: value } }, area)); },
    failStorage() { storageError = true; },
  };
}

test("automatic language follows supported browser locales and otherwise uses English", async () => {
  for (const [browser, expected] of [["sk-SK", "sk"], ["cs", "cs"], ["en-GB", "en"], ["de-DE", "en"]]) {
    const f = load({ browser }); await f.api.ready;
    assert.equal(f.api.preference, "auto"); assert.equal(f.api.locale, expected);
    assert.equal(f.context.EE.getMessage("settingsHeading"), catalogs[expected].settingsHeading.message);
  }
});

test("Firefox event pages serve catalogs directly despite having a document", async () => {
  const f = load({ firefoxBackground: true, preference: "sk" });
  await f.api.ready;
  assert.equal(f.requests.length, 0);
  assert.equal(f.api.msg("settingsHeading"), catalogs.sk.settingsHeading.message);
  assert.equal(f.handlers.length, 1);
  const response = await new Promise(resolve => f.handlers[0]({ type: "ee-language-catalog", language: "cs" }, { id: "fixture" }, resolve));
  assert.equal(response.catalog.settingsHeading.message, catalogs.cs.settingsHeading.message);
  const { createFirefoxPackageStaging } = require("../scripts-dev/package-policy.js");
  const staging = createFirefoxPackageStaging("ee-i18n-test-");
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(staging, "manifest.json"), "utf8"));
    assert.ok(manifest.background.scripts.indexOf("scripts/background-context.js") < manifest.background.scripts.indexOf("scripts/lib/ee-i18n.js"));
    assert.ok(manifest.background.scripts.includes("scripts/background-context.js"));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
});

test("explicit selection overrides browser language, persists and survives a new context", async () => {
  const f = load({ browser: "en-US" }); await f.api.ready;
  await f.api.setPreference("sk");
  assert.equal(f.api.locale, "sk"); assert.equal(f.stored.eeLanguage, "sk");
  assert.equal(f.api.msg("settingsHeading"), catalogs.sk.settingsHeading.message);
  const reopened = load({ preference: f.stored.eeLanguage, browser: "en-US" }); await reopened.api.ready;
  assert.equal(reopened.api.locale, "sk");
  await f.api.setPreference("auto"); assert.equal(f.api.locale, "en");
  await f.api.setPreference("../secret"); assert.equal(f.stored.eeLanguage, "auto");
});

test("named, indexed, repeated and literal-dollar placeholders match extension semantics", async () => {
  const f = load(); await f.api.ready;
  assert.equal(f.api.msg("menuUpdateNotice", ["1.0", "2.0"]), "Downloaded version: 1.0. Latest GitHub version: 2.0. Pull the latest project from GitHub.");
  assert.equal(f.api.msg("attHoursShort", ["3", "10"]), "3/10 les.");
  catalogs.en.fixturePlaceholders = { message: "$WHO$ $$ $1 $1", placeholders: { who: { content: "$2" } } };
  assert.equal(f.api.msg("fixturePlaceholders", ["$&", "<name>"]), "<name> $ $& $&");
  delete catalogs.en.fixturePlaceholders;
});

test("missing selected keys fall back to English, and missing catalogs or failed writes keep the old language", async () => {
  const f = load(); await f.api.ready;
  catalogs.en.fixtureEnglish = { message: "English fallback" };
  await f.api.setPreference("cs");
  assert.equal(f.api.msg("fixtureEnglish"), "English fallback");
  assert.equal(f.api.msg("missing-everywhere"), "native:missing-everywhere");
  f.failures.add("sk"); await assert.rejects(f.api.setPreference("sk"));
  assert.equal(f.api.locale, "cs"); assert.equal(f.stored.eeLanguage, "cs");
  f.failStorage(); await assert.rejects(f.api.setPreference("en"));
  assert.equal(f.api.locale, "cs"); assert.equal(f.stored.eeLanguage, "cs");
  delete catalogs.en.fixtureEnglish;
});

test("storage changes refresh subscribers and stale catalog responses cannot undo a newer selection", async () => {
  const f = load(); await f.api.ready;
  let release;
  f.delayed.set("sk", new Promise(resolve => { release = resolve; }));
  const changed = new Promise(resolve => f.api.subscribe(resolve));
  f.change("sk"); f.change("cs"); await changed;
  assert.equal(f.api.locale, "cs");
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.api.locale, "cs");
  f.change("en", "sync"); assert.equal(f.api.locale, "cs");
});

test("content scripts request only bundled catalogs through the worker, which rejects invalid paths", async () => {
  const f = load({ content: true, preference: "sk" }); await f.api.ready;
  assert.deepEqual(f.requests.map(message => message.language).sort(), ["en", "sk"]);
  assert.equal(f.api.msg("settingsHeading"), catalogs.sk.settingsHeading.message);
  const worker = load(); await worker.api.ready;
  let response;
  assert.equal(worker.handlers[0]({ type: "ee-language-catalog", language: "../../secret" }, { id: "fixture" }, value => { response = value; }), false);
  assert.equal(response.ok, false);
  worker.handlers[0]({ type: "ee-language-catalog", language: "cs" }, { id: "other-extension" }, value => { response = value; });
  assert.equal(response.ok, false);
  const valid = await new Promise(resolve => worker.handlers[0]({ type: "ee-language-catalog", language: "cs" }, { id: "fixture" }, resolve));
  assert.equal(valid.catalog.settingsHeading.message, catalogs.cs.settingsHeading.message);
});

test("language selector leads Appearance and both menu pages load the shared service", () => {
  const html = fs.readFileSync(path.join(root, "menu/settings.html"), "utf8");
  const appearance = html.slice(html.indexOf('id="panel-appearance"'), html.indexOf('id="panel-cleanup"'));
  assert.ok(appearance.indexOf('id="ee-language-select"') < appearance.indexOf('data-i18n="themesLabel"'));
  for (const language of ["auto", "sk", "cs", "en"]) assert.ok(appearance.includes(`value="${language}"`));
  for (const page of ["settings", "menu"]) {
    const source = fs.readFileSync(path.join(root, `menu/${page}.html`), "utf8");
    assert.ok(source.indexOf('src="../scripts/lib/ee-i18n.js"') < source.indexOf('src="i18n.js"'));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
  for (const entry of manifest.content_scripts.filter(entry => entry.js?.includes("scripts/activity-shield-bridge.js"))) {
    assert.ok(entry.js.indexOf("scripts/lib/ee-common.js") >= 0);
    assert.ok(entry.js.indexOf("scripts/lib/ee-i18n.js") < entry.js.indexOf("scripts/activity-shield-bridge.js"));
  }
});
