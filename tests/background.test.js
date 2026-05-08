const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackgroundInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "background.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    "chrome.runtime.onInstalled.addListener(() => {",
    "globalThis.__eeBackgroundTest = { shouldEnableGoogleCalendarAlarm, buildGoogleCalendarConnectedStatus, normalizeGoogleCalendarSyncMode, normalizeGoogleCalendarHalfyearScope, normalizeGoogleCalendarName }; chrome.runtime.onInstalled.addListener(() => {",
  );

  const noop = () => {};
  const context = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    TextEncoder,
    Intl,
    Date,
    Math,
    Promise,
    fetch: async () => {
      throw new Error("fetch should not be called in unit tests");
    },
    btoa(value) {
      return Buffer.from(String(value), "binary").toString("base64");
    },
    crypto: {
      subtle: {
        digest: async () => new ArrayBuffer(32),
      },
      getRandomValues(array) {
        return array.fill(1);
      },
    },
    chrome: {
      storage: {
        local: {
          get(_keys, callback) {
            callback({});
          },
          set(_values, callback) {
            if (callback) callback();
          },
          remove(_keys, callback) {
            if (callback) callback();
          },
        },
        onChanged: { addListener: noop },
      },
      alarms: {
        clear(_name, callback) {
          if (callback) callback(false);
        },
        create: noop,
        onAlarm: { addListener: noop },
      },
      runtime: {
        getManifest() {
          return { version: "0.0.0" };
        },
        onInstalled: { addListener: noop },
        onStartup: { addListener: noop },
        onMessage: { addListener: noop },
      },
      commands: { onCommand: { addListener: noop } },
      notifications: {
        create(_id, _options, callback) {
          if (callback) callback();
        },
        clear: noop,
        onClicked: { addListener: noop },
        onButtonClicked: { addListener: noop },
      },
      tabs: {
        create: noop,
        onUpdated: { addListener: noop, removeListener: noop },
        get: noop,
        sendMessage: noop,
        remove: noop,
      },
      identity: {
        getRedirectURL() {
          return "https://example.test/redirect";
        },
        launchWebAuthFlow: noop,
      },
    },
  };

  context.globalThis = context;

  vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });
  return context.__eeBackgroundTest;
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}

runTest("google calendar alarm stays off until setup is complete", () => {
  const { shouldEnableGoogleCalendarAlarm } = loadBackgroundInternals();

  assert.equal(shouldEnableGoogleCalendarAlarm({
    enabled: true,
    paused: false,
    clientId: "client-id",
    hasRefreshToken: false,
    lastEdupageOrigin: "https://school.edupage.org",
  }), false);

  assert.equal(shouldEnableGoogleCalendarAlarm({
    enabled: true,
    paused: false,
    clientId: "client-id",
    hasRefreshToken: true,
    lastEdupageOrigin: "",
  }), false);

  assert.equal(shouldEnableGoogleCalendarAlarm({
    enabled: true,
    paused: false,
    clientId: "client-id",
    hasRefreshToken: true,
    lastEdupageOrigin: "https://school.edupage.org",
  }), true);
});

runTest("connected status preserves the selected sync mode and halfyear scope", () => {
  const { buildGoogleCalendarConnectedStatus } = loadBackgroundInternals();

  const status = buildGoogleCalendarConnectedStatus({
    syncMode: "halfyear",
    halfyearScope: "full",
    calendarName: "School Calendar",
  });

  assert.equal(status.state, "connected");
  assert.equal(status.mode, "halfyear");
  assert.equal(status.halfyearScope, "full");
  assert.equal(status.calendarName, "School Calendar");
});
