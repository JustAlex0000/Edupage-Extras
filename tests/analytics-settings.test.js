const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "menu", "settings.js"), "utf8");
const start = source.indexOf("function renderAnalyticsToggle() {");
const end = source.indexOf("initializeAnalyticsPermission();", start);
assert.ok(start >= 0 && end > start, "analytics settings handler must exist");
const handler = source.slice(start, end + "initializeAnalyticsPermission();".length);

async function setup({ firefox = true, granted = false, requestResult = false, unsupported = false, missingApi = false } = {}) {
  const callbacks = {};
  const writes = [];
  let requests = 0;
  const toggle = { checked: false, disabled: true, addEventListener: (_, fn) => { callbacks.change = fn; } };
  const permissions = {
    getAll: async () => unsupported ? {} : ({ data_collection: granted ? ["technicalAndInteraction"] : [] }),
    request: () => { requests++; return Promise.resolve(requestResult); },
    onRemoved: { addListener: (fn) => { callbacks.removed = fn; } },
    onAdded: { addListener: (fn) => { callbacks.added = fn; } },
  };
  const context = {
    window: { eeI18n: { isFirefox: firefox } }, browser: missingApi ? {} : { permissions },
    chrome: { storage: { local: { set: (value) => writes.push(value) } } },
    analyticsToggle: toggle, analyticsPermissionStatus: { textContent: "" },
    t: (key) => key,
  };
  vm.runInNewContext(`
    let analyticsPreference = true;
    let analyticsPermissionSupported = false;
    let analyticsPermissionGranted = true;
    let analyticsPermissionAvailable = true;
    let analyticsSettingsLoaded = true;
    let analyticsPermissionLoaded = false;
    const ANALYTICS_ENABLED_KEY = "eeAnalyticsEnabled";
    ${handler}
  `, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { toggle, callbacks, writes, context, get requests() { return requests; } };
}

test("Firefox analytics requires browser permission, and denial keeps it off", async () => {
  const state = await setup();
  assert.equal(state.toggle.checked, false);
  state.toggle.checked = true;
  state.callbacks.change();
  assert.equal(state.requests, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.toggle.checked, false);
  assert.equal(state.writes.at(-1).eeAnalyticsEnabled, false);
  assert.equal(state.context.analyticsPermissionStatus.textContent, "analyticsPermissionDenied");
});

test("Firefox grant enables analytics and revocation disables it", async () => {
  const state = await setup({ requestResult: true });
  state.toggle.checked = true;
  state.callbacks.change();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.toggle.checked, true);
  assert.equal(state.writes.at(-1).eeAnalyticsEnabled, true);
  state.callbacks.removed({ data_collection: ["technicalAndInteraction"] });
  assert.equal(state.toggle.checked, false);
  assert.equal(state.writes.at(-1).eeAnalyticsEnabled, false);
});

test("turning analytics off saves the preference without requesting permission", async () => {
  const state = await setup({ granted: true });
  assert.equal(state.toggle.checked, true);
  state.toggle.checked = false;
  state.callbacks.change();
  assert.equal(state.requests, 0);
  assert.equal(state.writes.at(-1).eeAnalyticsEnabled, false);
});

test("other browsers default to the enabled local preference", async () => {
  const state = await setup({ firefox: false });
  assert.equal(state.toggle.checked, true);
  state.toggle.checked = false;
  state.callbacks.change();
  assert.equal(state.writes.at(-1).eeAnalyticsEnabled, false);
});

test("Firefox displays analytics as unavailable when its data consent API is missing", async () => {
  for (const options of [{ unsupported: true }, { missingApi: true }]) {
    const state = await setup(options);
    assert.equal(state.toggle.checked, false);
    assert.equal(state.toggle.disabled, true);
    assert.equal(state.context.analyticsPermissionStatus.textContent, "analyticsPermissionUnavailable");
    assert.equal(state.requests, 0);
  }
});

test("opening the Stay Active test page reports only its fixed feature name", () => {
  const start = source.indexOf('document.getElementById("ee-test-shields")?.addEventListener');
  const end = source.indexOf("\nif (resetActivityShieldButton)", start);
  assert.ok(start >= 0 && end > start);
  let onClick;
  const sent = [];
  let lastErrorRead = false;
  const runtime = {
    sendMessage(message, callback) { sent.push(message); callback(); },
    get lastError() { lastErrorRead = true; return { message: "unavailable" }; },
  };
  vm.runInNewContext(source.slice(start, end), {
    document: { getElementById: () => ({ addEventListener: (type, fn) => { assert.equal(type, "click"); onClick = fn; } }) },
    chrome: { runtime },
  });
  let prevented = false;
  onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ type: "ee-analytics-feature", name: "stay_active_test_opened" }]);
  assert.equal(lastErrorRead, true);
  runtime.sendMessage = () => { throw new Error("extension context invalidated"); };
  assert.doesNotThrow(() => onClick());
});
