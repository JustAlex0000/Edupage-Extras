const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBackgroundInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "background.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    "chrome.runtime.onInstalled.addListener(() => {",
    "globalThis.__eeBackgroundTest = { parseDateOnly, toRfc3339, buildTemplateWeekMap, buildHalfyearDesiredEvents, selectTimetableSampleWeeks, buildIcsCalendar }; chrome.runtime.onInstalled.addListener(() => {",
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

runTest("timetable date helpers reject calendar overflow dates", () => {
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

runTest("week sample selection shifts stale weekend weeks and keeps accurate extras", () => {
  const { selectTimetableSampleWeeks } = loadBackgroundInternals();
  const weeks = [
    { weekLabel: "A", classLabel: "3.A", dayHeaders: [{ date: "2026-05-04" }, { date: "2026-05-08" }], lessons: [] },
    { weekLabel: "B", classLabel: "3.A", dayHeaders: [{ date: "2026-05-11" }, { date: "2026-05-15" }], lessons: [] },
    { weekLabel: "A", classLabel: "3.A", dayHeaders: [{ date: "2026-05-18" }, { date: "2026-05-22" }], lessons: [] },
    { weekLabel: "B", classLabel: "3.A", dayHeaders: [{ date: "2026-05-25" }, { date: "2026-05-29" }], lessons: [] },
    { weekLabel: "A", classLabel: "3.A", dayHeaders: [{ date: "2026-06-01" }, { date: "2026-06-05" }], lessons: [] },
  ];

  const selected = selectTimetableSampleWeeks(weeks, {
    syncMode: "halfyear",
    extraHalfyearSampleWeeks: 2,
  }, new Date(2026, 4, 10));

  assert.equal(selected.liveWeek.dayHeaders[0].date, "2026-05-11");
  assert.equal(selected.adjacentWeek.dayHeaders[0].date, "2026-05-18");
  assert.deepEqual(
    Array.from(selected.templateSampleWeeks, (week) => week.dayHeaders[0].date),
    ["2026-05-11", "2026-05-18", "2026-05-25", "2026-06-01"],
  );
});

runTest("buildIcsCalendar emits valid VEVENTs, converts to UTC, escapes text, and skips bad dates", () => {
  const { buildIcsCalendar } = loadBackgroundInternals();

  const events = [
    {
      key: "lesson-1",
      startDateTime: "2026-06-22T08:50:00+02:00",
      endDateTime: "2026-06-22T09:35:00+02:00",
      payload: { summary: "SJL; group, A", location: "012", description: "Class 3.A\nWeek A" },
    },
    {
      key: "lesson-2",
      startDateTime: "not-a-date",
      endDateTime: "2026-06-22T10:30:00+02:00",
      payload: { summary: "MAT" },
    },
  ];

  const { ics, count } = buildIcsCalendar(events, "EduPage Timetable");

  assert.equal(count, 1, "the lesson with an invalid start date is skipped");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"), "uses CRLF line endings");
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  // 08:50+02:00 → 06:50 UTC
  assert.ok(ics.includes("DTSTART:20260622T065000Z"), "DTSTART converted to UTC");
  assert.ok(ics.includes("DTEND:20260622T073500Z"), "DTEND converted to UTC");
  // ; and , in the summary are escaped
  assert.ok(ics.includes("SUMMARY:SJL\\; group\\, A"), "special chars escaped");
  // newline in description escaped to \n
  assert.ok(ics.includes("DESCRIPTION:Class 3.A\\nWeek A"));
  assert.ok(ics.includes("UID:lesson-1@edupage-extras"));
});
