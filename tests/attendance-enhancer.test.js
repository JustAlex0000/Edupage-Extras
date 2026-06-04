const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAttendanceEnhancerInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "attendance-enhancer.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    'if (document.readyState === "loading") {',
    'globalThis.__eeAttendanceTest = { parseDateOnly, normalizeDateInput, resolveSecondHalfStartDate }; if (document.readyState === "loading") {',
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
