const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackgroundInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "background.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    "chrome.runtime.onInstalled.addListener(() => {",
    "globalThis.__eeBackgroundTest = { shouldEnableGoogleCalendarAlarm, buildGoogleCalendarConnectedStatus, normalizeGoogleCalendarSyncMode, normalizeGoogleCalendarHalfyearScope, normalizeGoogleCalendarName, parseDateOnly, toRfc3339, buildTemplateWeekMap, buildHalfyearDesiredEvents, buildSchoolEventDesiredEvents }; chrome.runtime.onInstalled.addListener(() => {",
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

runTest("google calendar date helpers reject calendar overflow dates", () => {
  const { parseDateOnly, toRfc3339 } = loadBackgroundInternals();

  assert.equal(parseDateOnly("2026-02-31"), null);
  assert.equal(parseDateOnly("2026-00-10"), null);
  assert.equal(toRfc3339("2026-02-31", "08:00"), null);
  assert.match(toRfc3339("2026-02-28", "08:00"), /^2026-02-28T08:00:00[+-]\d{2}:\d{2}$/);
});

runTest("template weeks prefer a later recurring slot over an earlier one-off variant", () => {
  const { buildTemplateWeekMap } = loadBackgroundInternals();

  const earlyChangedWeek = {
    weekLabel: "A",
    classLabel: "3.A",
    dayHeaders: [{ date: "2026-05-11" }],
    lessons: [{
      date: "2026-05-11",
      dayIndex: 0,
      period: "1",
      startTime: "08:00",
      endTime: "08:45",
      duration: 1,
      title: "Substitute Math",
      group: "",
      room: "101",
      teacher: "Teacher A",
      changed: false,
      slotIndex: 0,
      eventKey: "2026-05-11|1|0|substitute-math|",
    }],
  };

  const laterStaticWeek = {
    weekLabel: "A",
    classLabel: "3.A",
    dayHeaders: [{ date: "2026-05-25" }],
    lessons: [{
      date: "2026-05-25",
      dayIndex: 0,
      period: "1",
      startTime: "08:00",
      endTime: "08:45",
      duration: 1,
      title: "Math",
      group: "",
      room: "101",
      teacher: "Teacher A",
      changed: false,
      slotIndex: 0,
      eventKey: "2026-05-25|1|0|math|",
    }],
  };

  const templates = buildTemplateWeekMap([earlyChangedWeek, laterStaticWeek]);
  const lessons = templates.get("A")?.lessons || [];

  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].title, "Math");
});

runTest("school event desired events stay off until the event toggles are enabled", () => {
  const { buildSchoolEventDesiredEvents } = loadBackgroundInternals();

  const desired = buildSchoolEventDesiredEvents([{
    kind: "test",
    title: "Math test",
    date: "2026-05-20",
  }], {
    schoolEventsEnabled: false,
    testEventsEnabled: true,
  });

  assert.deepEqual(Array.from(desired), []);
});

runTest("school event desired events create managed all-day exam events", () => {
  const { buildSchoolEventDesiredEvents } = loadBackgroundInternals();

  const desired = buildSchoolEventDesiredEvents([{
    kind: "test",
    title: "Math test",
    subject: "Mathematics",
    date: "2026-05-20",
    details: "Chapter 8",
    href: "https://school.edupage.org/event/123",
  }], {
    schoolEventsEnabled: true,
    testEventsEnabled: true,
  });

  assert.equal(desired.length, 1);
  assert.equal(desired[0].key, "school:test:2026-05-20:math-test");
  assert.equal(desired[0].payload.summary, "Test: Math test");
  assert.equal(desired[0].payload.start.date, "2026-05-20");
  assert.equal(desired[0].payload.end.date, "2026-05-21");
  assert.equal(desired[0].payload.extendedProperties.private.eeManaged, "1");
  assert.equal(desired[0].payload.extendedProperties.private.eeType, "school-event");
});
