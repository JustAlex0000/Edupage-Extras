const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadGradesEnhancerInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "grades-enhancer.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    'if (document.readyState === "loading") {',
    'globalThis.__eeTest = { parseAverage, gradeColor, gradePercentage, parseSubjectMap, computeSubjectAbsences, summarizeAttendance, summarizeRenderableAttendance, finalizeSubjectStats, resolveAttendanceBreakdown, matchSubjectStats }; if (document.readyState === "loading") {',
  );

  const context = {
    console,
    navigator: { language: "en-US" },
    document: {
      readyState: "loading",
      addEventListener() {},
      documentElement: { lang: "en-US" },
    },
  };

  context.window = context;
  context.window.top = context.window;
  context.globalThis = context;

  vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });
  return context.__eeTest;
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

runTest("percentage averages keep their actual percentage fill and good-grade color", () => {
  const { parseAverage, gradeColor, gradePercentage } = loadGradesEnhancerInternals();
  const average = parseAverage("87 %");

  assert.equal(average, 87);
  assert.equal(gradePercentage(average), 87);
  assert.equal(gradeColor(average), "#558b2f");
});

runTest("numeric averages still use the existing 1-5 grading scale", () => {
  const { parseAverage, gradeColor, gradePercentage } = loadGradesEnhancerInternals();
  const average = parseAverage("2.13");

  assert.equal(average, 2.13);
  assert.equal(gradePercentage(average), 72.88);
  assert.equal(gradeColor(average), "#558b2f");
});

runTest("subject absences can be assigned directly from attendance subject ids", () => {
  const { computeSubjectAbsences, parseSubjectMap } = loadGradesEnhancerInternals();
  const attendancePayload = {
    order: ["student-1"],
    students: {
      "student-1": {
        "2026-05-05": {
          "3": {
            presence: "A",
            subjectid: "42",
            studentabsent_typeid: "n",
          },
        },
      },
    },
  };
  const absenceTypeMap = new Map([
    ["n", { id: "n", et: "N", short: "N", name: "Neospravedlnena absencia" }],
  ]);
  const classbookData = { dates: {} };
  const subjectMap = parseSubjectMap({
    42: { name: "dejepis", short: "DEJ" },
  });
  const halfWindow = {
    startDate: "2026-02-01",
    endDate: "2026-05-31",
    currentDate: "2026-05-07",
    nowMinutes: 24 * 60,
  };

  const entries = computeSubjectAbsences(
    attendancePayload,
    absenceTypeMap,
    classbookData,
    subjectMap,
    halfWindow,
    [],
  );
  const dejepis = entries.get("id:42");

  assert.ok(dejepis);
  assert.equal(dejepis.displayName, "dejepis");
  assert.equal(dejepis.absent, 1);
});

runTest("attendance breakdown keeps official totals and exposes unmatched lessons", () => {
  const { resolveAttendanceBreakdown } = loadGradesEnhancerInternals();
  const renderedSummary = {
    absent: 37,
    total: 348,
    percent: (37 / 348) * 100,
  };
  const officialHalfSummary = {
    absent: 43,
    total: 529,
    percent: (43 / 529) * 100,
  };

  const breakdown = resolveAttendanceBreakdown(renderedSummary, officialHalfSummary, 43);

  assert.equal(breakdown.summary.absent, 43);
  assert.equal(breakdown.summary.total, 529);
  assert.equal(breakdown.unmatched.absent, 6);
  assert.equal(breakdown.unmatched.total, 181);
});

runTest("row matching prefers EduPage subject ids when aliases are missing", () => {
  const { matchSubjectStats } = loadGradesEnhancerInternals();
  const subjectStats = [
    {
      key: "id:42",
      rawId: "42",
      displayName: "",
      shortName: "",
      absent: 1,
      total: 10,
      percent: 10,
      aliases: [],
    },
  ];

  const matched = matchSubjectStats("dejepis", subjectStats, "42");

  assert.ok(matched);
  assert.equal(matched.absent, 1);
  assert.equal(matched.total, 10);
});

runTest("row matching merges exact-id totals with alias-matched absences", () => {
  const { matchSubjectStats } = loadGradesEnhancerInternals();
  const subjectStats = [
    {
      key: "id:34704",
      rawId: "34704",
      displayName: "dejepis",
      shortName: "DEJ",
      absent: 0,
      total: 10,
      percent: 0,
      aliases: ["dejepis", "dej"],
    },
    {
      key: "id:legacy-42",
      rawId: "legacy-42",
      displayName: "dejepis",
      shortName: "DEJ",
      absent: 1,
      total: 0,
      percent: Number.NaN,
      aliases: ["dejepis", "dej"],
    },
  ];

  const matched = matchSubjectStats("dejepis", subjectStats, "34704");

  assert.ok(matched);
  assert.equal(matched.absent, 1);
  assert.equal(matched.total, 10);
});

runTest("attendance-only events stay unmatched instead of pretending to belong to a grades row", () => {
  const { summarizeRenderableAttendance, resolveAttendanceBreakdown } = loadGradesEnhancerInternals();
  const subjects = [
    {
      key: "id:34704",
      rawId: "34704",
      displayName: "dejepis",
      shortName: "DEJ",
      absent: 0,
      total: 10,
      percent: 0,
      aliases: ["dejepis", "dej"],
    },
    {
      key: "id:event-1",
      rawId: "Online nasilie",
      displayName: "Online nasilie",
      shortName: "",
      absent: 6,
      total: 0,
      percent: Number.NaN,
      aliases: ["online nasilie"],
    },
  ];

  const renderedSummary = summarizeRenderableAttendance(subjects);
  const breakdown = resolveAttendanceBreakdown(
    renderedSummary,
    { absent: 6, total: 10, percent: 60 },
    6,
  );

  assert.equal(renderedSummary.absent, 0);
  assert.equal(renderedSummary.total, 10);
  assert.equal(breakdown.unmatched.absent, 6);
});
