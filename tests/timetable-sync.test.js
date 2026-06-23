const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadTimetableInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "timetable-sync.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    '  chrome.runtime.sendMessage({',
    '  window.__eeTimetableSyncTest = { resolveDisplayedDate, resolveDisplayedWeekDates, formatDate }; chrome.runtime.sendMessage({',
  );

  const noop = () => {};
  // waitForTimetableReady's polling loop (timetable-sync.js) keeps scheduling
  // setTimeout calls in the background after the test's assertions are done,
  // which keeps Node's event loop alive for the full ~30s timeout before the
  // process can exit. unref() lets Node exit as soon as the test itself
  // finishes, without changing the timer's actual behavior.
  const unrefSetTimeout = (fn, ms) => {
    const id = setTimeout(fn, ms);
    id?.unref?.();
    return id;
  };
  const window = {
    setTimeout: unrefSetTimeout,
    clearTimeout,
    location: {
      origin: "https://school.edupage.org",
      href: "https://school.edupage.org/dashboard/eb.php?mode=timetable",
    },
  };
  window.top = window;

  const context = {
    console,
    Date,
    Math,
    Promise,
    window,
    document: {
      body: {},
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    chrome: {
      runtime: {
        sendMessage(_payload, callback) {
          if (callback) callback();
        },
        lastError: null,
        onMessage: {
          addListener: noop,
        },
      },
    },
  };

  window.document = context.document;
  context.globalThis = context;

  vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });
  return window.__eeTimetableSyncTest;
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

runTest("resolveDisplayedDate can anchor year selection to the visible timetable week", () => {
  const { resolveDisplayedDate, formatDate } = loadTimetableInternals();
  const anchored = resolveDisplayedDate("2.", "1.", new Date(2027, 11, 31));

  assert.equal(formatDate(anchored), "2028-01-02");
});

runTest("resolveDisplayedWeekDates keeps cross-year week headers in chronological order", () => {
  const { resolveDisplayedWeekDates } = loadTimetableInternals();
  const resolved = resolveDisplayedWeekDates([
    { dayText: "Po", dateText: "30. 12." },
    { dayText: "Ut", dateText: "31. 12." },
    { dayText: "St", dateText: "1. 1." },
    { dayText: "Št", dateText: "2. 1." },
    { dayText: "Pi", dateText: "3. 1." },
  ], new Date(2026, 0, 2));

  assert.deepEqual(
    Array.from(resolved, (entry) => entry.date),
    ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03"],
  );
});
