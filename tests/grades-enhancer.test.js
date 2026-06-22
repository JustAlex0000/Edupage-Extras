const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadGradesEnhancerInternals() {
  const scriptPath = path.join(__dirname, "..", "scripts", "grades-enhancer.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const instrumentedSource = source.replace(
    'if (document.readyState === "loading") {',
    'globalThis.__eeTest = { parseAverage, gradeColor, gradePercentage, parseDateOnly, normalizeDateInput, parseSubjectMap, computeSubjectAbsences, summarizeAttendance, summarizeRenderableAttendance, finalizeSubjectStats, resolveAttendanceBreakdown, resolveOfficialHalfSummary, matchSubjectStats, parseGradeTitleSegments, buildGradeOriginalTitleHtml, buildGradeTitleOverrideKey, gradeTableRowCount, resolveCurrentHalfWindow, computeProjectedSubjectTotals, buildAttendancePlaceholderState, shouldRenderPredictedAttendance, computeSummaryColumnLayout, calcWeightedAvg, projectAverageWithVirtualGrades, parseGradeWeight, readExistingGradeMass, buildGradeWeightModel }; if (document.readyState === "loading") {',
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

runTest("date-only parsing rejects calendar overflow dates", () => {
  const { parseDateOnly, normalizeDateInput } = loadGradesEnhancerInternals();

  assert.equal(parseDateOnly("2026-02-31"), null);
  assert.equal(parseDateOnly("2026-13-01"), null);
  assert.equal(normalizeDateInput("2026-02-31"), "");
  assert.equal(normalizeDateInput("2026-02-28"), "2026-02-28");
});

runTest("attendance loading placeholders are visibly different from unavailable placeholders", () => {
  const { buildAttendancePlaceholderState } = loadGradesEnhancerInternals();

  const loading = buildAttendancePlaceholderState("loading");
  const unavailable = buildAttendancePlaceholderState("unavailable");

  assert.equal(loading.text, "...");
  assert.equal(loading.empty, true);
  assert.equal(loading.loading, true);
  assert.match(loading.title, /loading/i);

  assert.equal(unavailable.text, "-");
  assert.equal(unavailable.empty, true);
  assert.equal(unavailable.loading, false);
});

runTest("predicted attendance stays hidden while prediction data is still loading", () => {
  const { shouldRenderPredictedAttendance } = loadGradesEnhancerInternals();

  assert.equal(shouldRenderPredictedAttendance({
    predictionState: "loading",
    predictedPercent: 10,
    predictedTotal: 20,
  }), false);

  assert.equal(shouldRenderPredictedAttendance({
    predictionState: "ready",
    predictedPercent: 10,
    predictedTotal: 20,
  }), true);
});

runTest("overall row layout keeps the notes corner while preserving the first two label columns", () => {
  const { computeSummaryColumnLayout } = loadGradesEnhancerInternals();

  const withNotes = computeSummaryColumnLayout(8);
  assert.equal(withNotes.labelSpan, 2);
  assert.equal(withNotes.trailingSpan, 1);

  const manyGradeCells = computeSummaryColumnLayout(12);
  assert.equal(manyGradeCells.labelSpan, 6);
  assert.equal(manyGradeCells.trailingSpan, 1);
});

// When EduPage shows the term-end Vysvedčenie column, the overall row gains one
// metric cell (its average), so labelSpan must shrink by one to stay aligned —
// otherwise the whole row shifts (the bug the published Vysvedčenie introduced).
runTest("overall row layout reserves a column for the Vysvedčenie average when present", () => {
  const { computeSummaryColumnLayout } = loadGradesEnhancerInternals();

  // 9 columns: Predmet, Známky, Priemer, Vysvedčenie, 4× attendance, Poznámky.
  const withVysvedcenie = computeSummaryColumnLayout(9, true);
  assert.equal(withVysvedcenie.labelSpan, 2, "label still spans only Predmet + Známky");
  assert.equal(withVysvedcenie.trailingSpan, 1, "Poznámky stays the trailing corner");

  // Same column count but treated as no Vysvedčenie would mis-span the label.
  const ignored = computeSummaryColumnLayout(9, false);
  assert.equal(ignored.labelSpan, 3);
});

runTest("current half window keeps the projection end at June 30 in the second halfyear", () => {
  const { resolveCurrentHalfWindow } = loadGradesEnhancerInternals();
  const halfWindow = resolveCurrentHalfWindow({
    currentDate: "2026-05-09",
    yearTurnover: "2025-09-01",
    selectedYear: 2025,
    halves: { "1": "1. Polrok", "2": "2. Polrok" },
    secondHalfOverride: "",
  });

  assert.equal(halfWindow.halfKey, "2");
  assert.equal(halfWindow.halfEndDate, "2026-06-30");
});

runTest("current half window honors a custom second-half projection end date", () => {
  const { resolveCurrentHalfWindow } = loadGradesEnhancerInternals();
  const halfWindow = resolveCurrentHalfWindow({
    currentDate: "2026-05-09",
    yearTurnover: "2025-09-01",
    selectedYear: 2025,
    halves: { "1": "1. Polrok", "2": "2. Polrok" },
    secondHalfOverride: "",
    secondHalfEndOverride: "2026-06-19",
  });

  assert.equal(halfWindow.halfKey, "2");
  assert.equal(halfWindow.halfEndDate, "2026-06-19");
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

runTest("projected subject totals extend the denominator while keeping absences fixed", () => {
  const { computeProjectedSubjectTotals, parseSubjectMap, finalizeSubjectStats } = loadGradesEnhancerInternals();
  const classbookData = {
    dates: {
      "2026-02-02": { plan: [{ type: "lesson", subjectid: "42", period: "1" }] },
      "2026-02-04": { plan: [{ type: "lesson", subjectid: "42", period: "2" }] },
      "2026-02-09": { plan: [{ type: "lesson", subjectid: "42", period: "1" }] },
      "2026-02-11": { plan: [{ type: "lesson", subjectid: "42", period: "2" }] },
    },
  };
  const subjectMap = parseSubjectMap({
    42: { name: "dejepis", short: "DEJ" },
  });
  const halfWindow = {
    startDate: "2026-02-01",
    endDate: "2026-02-11",
    currentDate: "2026-02-11",
    halfEndDate: "2026-02-18",
    nowMinutes: 24 * 60,
  };
  const absentEntries = new Map([[
    "id:42",
    {
      key: "id:42",
      rawId: "42",
      displayName: "dejepis",
      shortName: "DEJ",
      absent: 1,
      total: 0,
      aliases: new Set(["dejepis", "dej"]),
    },
  ]]);
  const totalEntries = new Map([[
    "id:42",
    {
      key: "id:42",
      rawId: "42",
      displayName: "dejepis",
      shortName: "DEJ",
      absent: 0,
      total: 4,
      aliases: new Set(["dejepis", "dej"]),
    },
  ]]);

  const projectedTotals = computeProjectedSubjectTotals(classbookData, subjectMap, halfWindow);
  const subjects = finalizeSubjectStats(absentEntries, totalEntries, projectedTotals);
  const dejepis = subjects.find((entry) => entry.rawId === "42");

  assert.ok(dejepis);
  assert.equal(dejepis.total, 4);
  assert.equal(dejepis.predictedTotal, 6);
  assert.equal(Number(dejepis.predictedPercent.toFixed(2)), 16.67);
});

runTest("grade title overrides preserve the date details and replace only the title", () => {
  const { parseGradeTitleSegments, buildGradeOriginalTitleHtml } = loadGradesEnhancerInternals();
  const original = "<b>Písomná odpoveď</b><br>Dátum známky: 12.02.2026";

  const parsed = parseGradeTitleSegments(original);
  const rebuilt = buildGradeOriginalTitleHtml("Esej", parsed.detailHtml);

  assert.equal(parsed.title, "Písomná odpoveď");
  assert.equal(parsed.detailHtml, "Dátum známky: 12.02.2026");
  assert.equal(rebuilt, "<b>Esej</b><br>Dátum známky: 12.02.2026");
});

runTest("grade title override keys stay stable for the same subject, date, grade, column, and default title", () => {
  const { buildGradeTitleOverrideKey } = loadGradesEnhancerInternals();

  const key = buildGradeTitleOverrideKey("34704", "12.02.2026", "2", 3, "Písomná odpoveď");

  assert.equal(key, "34704|12.02.2026|2|3|Písomná odpoveď");
});

runTest("primary grades table scoring prefers the table with subject rows over a header-only clone", () => {
  const { gradeTableRowCount } = loadGradesEnhancerInternals();

  const headerOnlyTable = {
    querySelectorAll(selector) {
      return selector === "tr.predmetRow" ? [] : [];
    },
  };
  const fullTable = {
    querySelectorAll(selector) {
      return selector === "tr.predmetRow" ? [{}, {}, {}] : [];
    },
  };

  assert.equal(gradeTableRowCount(headerOnlyTable), 0);
  assert.equal(gradeTableRowCount(fullTable), 3);
});

// Regression: adding a virtual grade WORSE than the current average must move
// the projection UP toward the new grade, never below the existing average.
// The previous formula tried to re-derive the average from per-cell parsing
// and would silently undercount, producing nonsense like:
//   existing average 2.08, add virtual 3 (weight 1) -> projection 2.00.
// The new formula trusts EduPage's average weighted by grade count.

runTest("projectAverageWithVirtualGrades pulls projection toward the new grade, never past the existing average", () => {
  const { projectAverageWithVirtualGrades } = loadGradesEnhancerInternals();

  // Five existing grades averaging 2.08; add one virtual 3 with weight 1.
  // Correct: (2.08*5 + 3*1) / 6 = 2.2333...
  const projected = projectAverageWithVirtualGrades(2.08, 5, [{ value: 3, weight: 1 }]);
  assert.ok(projected > 2.08, `projection ${projected} must be > existing 2.08`);
  assert.ok(projected < 3, `projection ${projected} must be < new grade 3`);
  assert.equal(Number(projected.toFixed(4)), 2.2333);
});

runTest("projectAverageWithVirtualGrades pulls projection down for a better virtual grade", () => {
  const { projectAverageWithVirtualGrades } = loadGradesEnhancerInternals();

  // Existing average 3.0 across 4 grades, add virtual 1 weight 2.
  // (3*4 + 1*2) / 6 = 14/6 = 2.3333
  const projected = projectAverageWithVirtualGrades(3.0, 4, [{ value: 1, weight: 2 }]);
  assert.ok(projected < 3.0, `projection ${projected} must be < existing 3.0`);
  assert.ok(projected > 1.0, `projection ${projected} must be > new grade 1.0`);
  assert.equal(Number(projected.toFixed(4)), 2.3333);
});

runTest("projectAverageWithVirtualGrades blends existing average and virtual grade by the given mass", () => {
  const { projectAverageWithVirtualGrades } = loadGradesEnhancerInternals();

  // Mass = 1 collapses the existing average to a single weight-1 anchor, so
  // adding one weight-1 grade gives a plain mean of the two values. The
  // wrapper in grades-enhancer (resolveExistingMassForRow) is the one that
  // promotes a zero-cell row to mass 1 before calling this function; the
  // projection function itself stays a pure (avg, mass, virtuals) blender.
  assert.equal(projectAverageWithVirtualGrades(2.0, 1, [{ value: 4, weight: 1 }]), 3.0);
  // Doubling the mass means the existing average dominates twice as much.
  assert.equal(projectAverageWithVirtualGrades(2.0, 2, [{ value: 4, weight: 1 }]), 8 / 3);
});

runTest("projectAverageWithVirtualGrades returns null when there are no virtual grades", () => {
  const { projectAverageWithVirtualGrades } = loadGradesEnhancerInternals();

  assert.equal(projectAverageWithVirtualGrades(2.5, 4, []), null);
  assert.equal(projectAverageWithVirtualGrades(2.5, 4, null), null);
});

runTest("projectAverageWithVirtualGrades returns null when the existing average is not a finite number", () => {
  const { projectAverageWithVirtualGrades } = loadGradesEnhancerInternals();

  assert.equal(projectAverageWithVirtualGrades(Number.NaN, 4, [{ value: 1, weight: 1 }]), null);
  assert.equal(projectAverageWithVirtualGrades(undefined, 4, [{ value: 1, weight: 1 }]), null);
});

runTest("calcWeightedAvg handles single-grade arrays and zero-weight edge cases", () => {
  const { calcWeightedAvg } = loadGradesEnhancerInternals();

  assert.equal(calcWeightedAvg([{ value: 2, weight: 1 }]), 2);
  assert.equal(calcWeightedAvg([{ value: 1, weight: 1 }, { value: 5, weight: 1 }]), 3);
  assert.equal(calcWeightedAvg([{ value: 2, weight: 3 }, { value: 4, weight: 1 }]), 2.5);
  assert.ok(Number.isNaN(calcWeightedAvg([])));
  assert.ok(Number.isNaN(calcWeightedAvg([{ value: 2, weight: 0 }])));
});

// Regression: the projection must respect EduPage's per-grade weights. With
// 8 visible grades averaging 2.08, where 5 carry weight 2 and 3 carry weight 1
// (total mass 13), adding a virtual 5 with weight 2 must land at 2.47 — not
// 2.66 (the broken count-based result). parseGradeWeight is the helper that
// has to extract weights out of EduPage's "Váha"/"Váha udalosti" tooltips for
// projectAverageWithVirtualGrades to receive the right mass.

runTest("parseGradeWeight reads the canonical Slovak/Czech/English/German weight labels", () => {
  const { parseGradeWeight } = loadGradesEnhancerInternals();

  assert.equal(parseGradeWeight("Téma: Vektory\nDátum známky: 04.06.2026\nVáha: 2"), 2);
  assert.equal(parseGradeWeight("Váha: 1.5"), 1.5);
  assert.equal(parseGradeWeight("Vaha: 3"), 3);
  assert.equal(parseGradeWeight("Váhy: 2"), 2);
  assert.equal(parseGradeWeight("Weight: 4"), 4);
  assert.equal(parseGradeWeight("Gewicht: 2"), 2);
});

runTest("parseGradeWeight handles the longer 'Váha udalosti: Nx' tooltip variant", () => {
  const { parseGradeWeight } = loadGradesEnhancerInternals();

  // This is the variant in the user's screenshot — the previous regex
  // required ":" immediately after "Váha", so this fell back to 1 and the
  // projection used the wrong mass.
  assert.equal(parseGradeWeight("Téma: Test\nVáha udalosti: 2x"), 2);
  assert.equal(parseGradeWeight("Váha udalosti: 3x"), 3);
  assert.equal(parseGradeWeight("Vaha udalosti = 2"), 2);
});

runTest("parseGradeWeight returns null when no weight label is present", () => {
  const { parseGradeWeight } = loadGradesEnhancerInternals();

  assert.equal(parseGradeWeight(""), null);
  assert.equal(parseGradeWeight(null), null);
  assert.equal(parseGradeWeight(undefined), null);
  assert.equal(parseGradeWeight("Téma: Vektory\nDátum známky: 04.06.2026"), null);
  // "Známky" (grades) starts with "z", not "v", so must not be mistaken for "Váha".
  assert.equal(parseGradeWeight("Známky: 2"), null);
});

runTest("parseGradeWeight reproduces the 2.08 -> 2.47 projection from the screenshot", () => {
  const { parseGradeWeight, projectAverageWithVirtualGrades } = loadGradesEnhancerInternals();

  // Eight grades visible in the row: five with "Váha udalosti: 2x" tooltips,
  // three with plain "Váha: 1". The sum of parsed weights is the existing
  // mass that the projection formula expects.
  const tooltips = [
    "Téma: Test 1\nVáha udalosti: 2x",
    "Téma: Test 2\nVáha udalosti: 2x",
    "Téma: Test 3\nVáha udalosti: 2x",
    "Téma: Test 4\nVáha udalosti: 2x",
    "Téma: Test 5\nVáha udalosti: 2x",
    "Téma: Krátka odpoveď\nVáha: 1",
    "Téma: Krátka odpoveď\nVáha: 1",
    "Téma: Krátka odpoveď\nVáha: 1",
  ];
  const mass = tooltips.reduce((sum, tip) => sum + (parseGradeWeight(tip) || 1), 0);
  assert.equal(mass, 13, "five weight-2 grades plus three weight-1 grades sum to mass 13");

  const projected = projectAverageWithVirtualGrades(2.08, mass, [{ value: 5, weight: 2 }]);
  assert.equal(
    Number(projected.toFixed(2)),
    2.47,
    "projection must match the user's external weighted-average calculator",
  );
});

// Regression for the user's screenshot: EduPage puts the weight on the
// CATEGORY SUB-ROW label ("Váha udalosti: 2×"), not on each grade cell's
// tooltip. readExistingGradeMass must walk sibling sub-rows and multiply
// their cell count by the sub-row weight, so the projection uses the real
// mass (13) instead of the cell count (8).
//
// Builds a minimal mock that satisfies the DOM surface readExistingGradeMass
// actually touches: tagName/classList/dataset on rows, nextElementSibling
// chaining, querySelectorAll for "span.tips" and "tr", a textContent that
// includes the weight label, and a getAttribute fallthrough on cells.

function makeMockGradeCell(value) {
  const znamka = {
    textContent: String(value),
    parentElement: null,
  };
  const tip = {
    tagName: "SPAN",
    classList: { contains: (cls) => cls === "tips" },
    matches: (sel) => sel === "span.tips",
    querySelector: (sel) => (sel === ".znZnamka" ? znamka : null),
    querySelectorAll: () => [],
    getAttribute: () => "",
  };
  return tip;
}

function makeMockSubRow({ labelText, gradeValues }) {
  const cells = (gradeValues || []).map(makeMockGradeCell);
  return {
    tagName: "TR",
    classList: { contains: () => false },
    dataset: {},
    textContent: labelText,
    nextElementSibling: null,
    querySelectorAll: (sel) => (sel === "span.tips" ? cells : []),
    querySelector: () => null,
    getAttribute: () => "",
  };
}

function makeMockPredmetRow(subRows) {
  // Chain sub-rows via nextElementSibling so findSubjectSubRows walks them.
  for (let i = 0; i < subRows.length; i += 1) {
    subRows[i].nextElementSibling = subRows[i + 1] || null;
  }
  return {
    tagName: "TR",
    classList: { contains: (cls) => cls === "predmetRow" },
    dataset: { predmetid: "5" },
    nextElementSibling: subRows[0] || null,
    // Empty for sub-row layout: cells live in the sibling sub-rows.
    querySelectorAll: (sel) => (sel === "tr" ? [] : []),
    querySelector: () => null,
    textContent: "",
  };
}

runTest("readExistingGradeMass uses sub-row weight labels (5×weight2 + 3×weight1 = mass 13)", () => {
  const { readExistingGradeMass, projectAverageWithVirtualGrades } = loadGradesEnhancerInternals();

  // Matches the user's screenshot exactly: ústna sub-row labeled
  // "Váha udalosti: 2×" with 5 grade cells, písomná sub-row with no weight
  // label and 3 cells.
  const ustna = makeMockSubRow({
    labelText: "ústna odpoveď\nVáha udalosti: 2×",
    gradeValues: ["1-", "2", "3", "2", "3"],
  });
  const pisomna = makeMockSubRow({
    labelText: "písomná odpoveď",
    gradeValues: ["1", "1", "2"],
  });
  const predmetRow = makeMockPredmetRow([ustna, pisomna]);

  const info = readExistingGradeMass(predmetRow);
  assert.equal(info.cellCount, 8);
  assert.equal(info.totalWeight, 13, "5 cells × weight 2 + 3 cells × weight 1");
  assert.equal(info.weightsParsed, 5, "the five ústna cells got an explicit weight from the sub-row label");

  // Now the end-to-end projection matches the user's external calculator.
  const projected = projectAverageWithVirtualGrades(2.08, info.totalWeight, [{ value: 5, weight: 2 }]);
  assert.equal(Number(projected.toFixed(2)), 2.47);
});

runTest("readExistingGradeMass falls back to per-cell tooltips when no sub-rows have grades", () => {
  const { readExistingGradeMass } = loadGradesEnhancerInternals();

  // Build a predmetRow with cells directly inside it (no sub-rows). Each
  // cell's tooltip carries "Váha: 2" so we can verify the per-cell fallback
  // still works for layouts that don't use category sub-rows.
  function makeCellWithTooltip(value, tooltip) {
    const cell = makeMockGradeCell(value);
    cell.getAttribute = (name) => (name === "original-title" ? tooltip : "");
    return cell;
  }
  const cells = [
    makeCellWithTooltip("1", "Téma: T1\nVáha: 2"),
    makeCellWithTooltip("2", "Téma: T2\nVáha: 2"),
    makeCellWithTooltip("3", "Téma: T3"),
  ];
  const predmetRow = {
    tagName: "TR",
    classList: { contains: (cls) => cls === "predmetRow" },
    dataset: { predmetid: "9" },
    nextElementSibling: null,
    querySelectorAll: (sel) => (sel === "span.tips" ? cells : sel === "tr" ? [] : []),
    querySelector: () => null,
    textContent: "",
  };

  const info = readExistingGradeMass(predmetRow);
  assert.equal(info.cellCount, 3);
  assert.equal(info.totalWeight, 5, "2 + 2 + 1 (default) = 5");
  assert.equal(info.weightsParsed, 2, "two cells exposed an explicit weight in their tooltip");
});

// Regression for the real EduPage DOM: the category sub-rows ("udalostRow")
// share the parent's data-predmetid. The old walker treated any sibling with
// data-predmetid as the next subject and broke out immediately, so weights
// were silently lost and the projection fell back to a plain cell count.
runTest("readExistingGradeMass walks udalostRow siblings that share the parent predmetid", () => {
  const { readExistingGradeMass } = loadGradesEnhancerInternals();

  const predmetid = "34780";
  const ustna = makeMockSubRow({
    labelText: "Ústna odpoveď:\nVáha udalosti: 2×",
    gradeValues: ["1-", "2", "2", "3"],
  });
  ustna.dataset = { predmetid };
  ustna.classList = { contains: (cls) => cls === "udalostRow" };
  const pisomna = makeMockSubRow({
    labelText: "Písomná odpoveď:",
    gradeValues: ["1", "1", "2"],
  });
  pisomna.dataset = { predmetid };
  pisomna.classList = { contains: (cls) => cls === "udalostRow" };
  const predmetRow = makeMockPredmetRow([ustna, pisomna]);
  predmetRow.dataset = { predmetid };

  const info = readExistingGradeMass(predmetRow);
  assert.equal(info.cellCount, 7, "4 ústna + 3 písomná");
  assert.equal(info.totalWeight, 11, "4 × weight 2 + 3 × weight 1");
  assert.equal(info.weightsParsed, 4, "all four ústna cells inherit the explicit sub-row weight");
});

// And confirm the walker still bails when the NEXT sibling really is a
// different subject (different data-predmetid), so we don't accidentally bleed
// into the row below.
runTest("readExistingGradeMass stops at a sibling whose data-predmetid differs", () => {
  const { readExistingGradeMass } = loadGradesEnhancerInternals();

  const ustna = makeMockSubRow({
    labelText: "Ústna odpoveď:\nVáha udalosti: 2×",
    gradeValues: ["2", "3"],
  });
  ustna.dataset = { predmetid: "100" };
  ustna.classList = { contains: (cls) => cls === "udalostRow" };
  const nextSubject = makeMockSubRow({
    labelText: "should not be counted",
    gradeValues: ["5", "5", "5", "5"],
  });
  nextSubject.dataset = { predmetid: "200" };
  const predmetRow = makeMockPredmetRow([ustna, nextSubject]);
  predmetRow.dataset = { predmetid: "100" };

  const info = readExistingGradeMass(predmetRow);
  assert.equal(info.cellCount, 2, "only the ústna sub-row of the current subject is counted");
  assert.equal(info.totalWeight, 4, "2 cells × weight 2");
});

// The structured-weight path: instead of parsing "Váha udalosti: N×" labels,
// read each grade's weight from the znamky blob (vsetkyUdalosti.edupage[].p_vaha,
// stored ×20) joined to grades by udalostid, summed per subject.
runTest("buildGradeWeightModel sums p_vaha per subject (÷20) and joins by udalostid", () => {
  const { buildGradeWeightModel } = loadGradesEnhancerInternals();

  const events = [
    { UdalostID: "1", PredmetID: "100", p_vaha: 20 }, // weight 1
    { UdalostID: "2", PredmetID: "100", p_vaha: 40 }, // weight 2
    { UdalostID: "3", PredmetID: "200", p_vaha: 10 }, // weight 0.5
  ];
  const grades = [
    { predmetid: "100", udalostid: "1" },
    { predmetid: "100", udalostid: "2" },
    { predmetid: "100", udalostid: "2" }, // a second grade on the weight-2 event
    { predmetid: "200", udalostid: "3" },
    { predmetid: "200", udalostid: "999" }, // unknown event → not counted
  ];

  const model = buildGradeWeightModel(grades, events);
  assert.equal(model.get("100").mass, 5, "1 + 2 + 2");
  assert.equal(model.get("100").count, 3);
  assert.equal(model.get("200").mass, 0.5, "only the grade whose event resolved");
  assert.equal(model.get("200").count, 1);
});

runTest("buildGradeWeightModel returns null when no grade joins to a weight", () => {
  const { buildGradeWeightModel } = loadGradesEnhancerInternals();
  assert.equal(
    buildGradeWeightModel([{ predmetid: "1", udalostid: "x" }], [{ UdalostID: "y", p_vaha: 20 }]),
    null,
  );
  assert.equal(buildGradeWeightModel(null, []), null);
});

// Regression: resolveOfficialHalfSummary previously included `distant` lessons
// (school activities, trips) in the denominator, producing a smaller absence %
// than the school reports. The correct formula is absent / (present + absent),
// matching computeHalfStats in attendance-enhancer.js and the school's own report.
runTest("resolveOfficialHalfSummary excludes distant lessons from the absence % denominator", () => {
  const { resolveOfficialHalfSummary } = loadGradesEnhancerInternals();

  const attendanceInfo = {
    payload: { order: ["student-1"], students: { "student-1": {} } },
    halfStats: {
      "student-1": {
        "1": { present: 80, distant: 10, absent: 20 },
      },
    },
  };
  const halfWindow = { halfKey: "1" };

  const summary = resolveOfficialHalfSummary(attendanceInfo, halfWindow);

  assert.ok(summary !== null, "should return a summary when data exists");
  assert.equal(summary.absent, 20);
  assert.equal(summary.total, 100, "total must be present + absent = 100, not 110 with distant");
  // 20 / 100 = 20 %, matching school report. Old (broken) value was 18.18 % (20/110).
  assert.equal(summary.percent, 20);
});

runTest("resolveOfficialHalfSummary returns null when only distant lessons exist", () => {
  const { resolveOfficialHalfSummary } = loadGradesEnhancerInternals();

  const attendanceInfo = {
    payload: { order: ["student-1"], students: { "student-1": {} } },
    halfStats: {
      "student-1": {
        "1": { present: 0, distant: 40, absent: 0 },
      },
    },
  };

  // present + absent = 0, so there is no attendance data to show a % for.
  const summary = resolveOfficialHalfSummary(attendanceInfo, { halfKey: "1" });
  assert.equal(summary, null);
});
