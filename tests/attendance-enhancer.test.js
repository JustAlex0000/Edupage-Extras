const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAttendanceEnhancerInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "attendance-enhancer.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    'if (document.readyState === "loading") {',
    'globalThis.__eeAttendanceTest = { parseDateOnly, normalizeDateInput, resolveSecondHalfStartDate, computeHalfStats }; if (document.readyState === "loading") {',
  );

  const context = {
    console,
    document: {
      readyState: "loading",
      addEventListener() {},
      documentElement: {},
    },
  };

  context.window = context;
  context.window.top = context.window;
  context.globalThis = context;

  vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });
  return context.__eeAttendanceTest;
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

runTest("attendance date inputs reject calendar overflow dates", () => {
  const { parseDateOnly, normalizeDateInput } = loadAttendanceEnhancerInternals();

  assert.equal(parseDateOnly("2026-02-31"), null);
  assert.equal(parseDateOnly("2026-04-31"), null);
  assert.equal(normalizeDateInput("2026-02-31"), "");
  assert.equal(normalizeDateInput("2026-04-30"), "2026-04-30");
});

function formatLocalDate(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

runTest("second-half override ignores invalid calendar dates", () => {
  const { resolveSecondHalfStartDate } = loadAttendanceEnhancerInternals();
  const turnover = new Date(2025, 8, 1);

  // resolveSecondHalfStartDate returns a local-time Date, so compare with a
  // local formatter rather than toISOString() (which would shift across the
  // UTC boundary in non-UTC timezones and make this assertion flaky).
  assert.equal(formatLocalDate(resolveSecondHalfStartDate(turnover, "2026-02-31")), "2026-02-01");
  assert.equal(formatLocalDate(resolveSecondHalfStartDate(turnover, "2026-02-02")), "2026-02-02");
});

runTest("computeHalfStats excludes distant lessons from the absence % denominator", () => {
  const { computeHalfStats } = loadAttendanceEnhancerInternals();
  // School activities ("distant") inflate the recorded lesson count but are
  // not counted as absences by the school. The previous formula included them
  // in the denominator, which made our reported % smaller than the school's.
  const result = computeHalfStats({
    "1": { present: 80, distant: 10, absent: 20 },
  });

  assert.equal(result["1"].attendedTotal, 100);
  assert.equal(result["1"].recordedTotal, 110);
  assert.equal(result["1"].total, 100, "legacy .total alias should equal attendedTotal");
  // 20 / 100 = 20 %, matching school report. Old (broken) value was 18.18 %.
  assert.equal(result["1"].percent, 20);
  assert.equal(result["1"].distant, 10);
});

runTest("computeHalfStats handles empty halves without dividing by zero", () => {
  const { computeHalfStats } = loadAttendanceEnhancerInternals();
  const result = computeHalfStats({
    "1": { present: 0, distant: 0, absent: 0 },
    "2": null,
  });

  assert.equal(result["1"].attendedTotal, 0);
  assert.ok(Number.isNaN(result["1"].percent), "percent must be NaN when no attended lessons");
  // Halves with no data still get a zero-filled entry rather than throwing.
  assert.equal(result["2"].recordedTotal, 0);
});

runTest("computeHalfStats keeps a populated half visible even when only distant lessons exist", () => {
  const { computeHalfStats } = loadAttendanceEnhancerInternals();
  // A trip-heavy half (all distant, nothing else) must not be silently dropped
  // by the populated-half selector; recordedTotal is what proves data exists.
  const result = computeHalfStats({
    "2": { present: 0, distant: 40, absent: 0 },
  });

  assert.equal(result["2"].recordedTotal, 40);
  assert.equal(result["2"].attendedTotal, 0);
  assert.ok(Number.isNaN(result["2"].percent));
});
