/**
 * grades-bootstrap.js
 *
 * Loads last among the grades-*.js content scripts (see manifest.json), once
 * every other module has attached its public functions to the shared GE
 * namespace (window.__eeGrades) — only then is it safe to actually run
 * enhanceGradesTable() and friends, since grades-enhancer.js's init() calls
 * straight into GE.badges/GE.virtual/GE.summary/GE.attendance/GE.gradesExport.
 */

(function () {
  "use strict";

  if (window.top !== window) return;

  const GE = (window.__eeGrades = window.__eeGrades || {});

  // Deliberate test hook — see tests/grades-enhancer.test.js.
  if (globalThis.__EE_TEST__) {
    globalThis.__eeTestExports = {
      parseAverage: GE.parseAverage,
      gradeColor: GE.gradeColor,
      gradePercentage: GE.gradePercentage,
      parseDateOnly: GE.parseDateOnly,
      normalizeDateInput: GE.normalizeDateInput,
      parseSubjectMap: GE.attendance.parseSubjectMap,
      computeSubjectAbsences: GE.attendance.computeSubjectAbsences,
      summarizeAttendance: GE.attendance.summarizeAttendance,
      summarizeRenderableAttendance: GE.attendance.summarizeRenderableAttendance,
      finalizeSubjectStats: GE.attendance.finalizeSubjectStats,
      resolveAttendanceBreakdown: GE.attendance.resolveAttendanceBreakdown,
      resolveOfficialHalfSummary: GE.attendance.resolveOfficialHalfSummary,
      resolveUnambiguousStudentId: GE.attendance.resolveUnambiguousStudentId,
      matchSubjectStats: GE.attendance.matchSubjectStats,
      parseGradeTitleSegments: GE.badges.parseGradeTitleSegments,
      buildGradeOriginalTitleHtml: GE.badges.buildGradeOriginalTitleHtml,
      buildGradeTitleOverrideKey: GE.badges.buildGradeTitleOverrideKey,
      gradeTableRowCount: GE.gradeTableRowCount,
      resolveCurrentHalfWindow: GE.attendance.resolveCurrentHalfWindow,
      computeProjectedSubjectTotals: GE.attendance.computeProjectedSubjectTotals,
      buildAttendancePlaceholderState: GE.attendance.buildAttendancePlaceholderState,
      shouldRenderPredictedAttendance: GE.attendance.shouldRenderPredictedAttendance,
      computeSummaryColumnLayout: GE.summary.computeSummaryColumnLayout,
      calcWeightedAvg: GE.virtual.calcWeightedAvg,
      projectAverageWithVirtualGrades: GE.virtual.projectAverageWithVirtualGrades,
      parseGradeWeight: GE.virtual.parseGradeWeight,
      readExistingGradeMass: GE.virtual.readExistingGradeMass,
      buildGradeWeightModel: GE.virtual.buildGradeWeightModel,
      migrateFlatMapToByOrigin: GE.migrateFlatMapToByOrigin,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", GE.init, { once: true });
  } else {
    GE.init();
  }
})();
