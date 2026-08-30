/**
 * grades-bootstrap.js
 *
 * Loads last among the grades-*.js content scripts (see manifest.json), once
 * every other module has attached its public functions to the shared GE
 * namespace (window.__eeGrades) — only then is it safe to actually run
 * enhanceGradesTable() and friends, since grades-enhancer.js's init() calls
 * straight into GE.badges/GE.virtual/GE.summary/GE.attendance/GE.sortFilter/
 * GE.gradesExport.
 */

(function () {
  "use strict";

  if (window.top !== window) return;

  const GE = (window.__eeGrades = window.__eeGrades || {});

  function isGradesPage() {
    return /^\/znamky(?:\/|$)/i.test(window.location?.pathname || "");
  }

  function nodeContainsGradesTable(node) {
    const element = node?.matches || node?.querySelector
      ? node
      : node?.parentElement;

    return Boolean(
      element?.matches?.("table.znamkyTable")
      || element?.querySelector?.("table.znamkyTable"),
    );
  }

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
      findAttendanceHeaderRow: GE.attendance.findAttendanceHeaderRow,
      isCertificateHeader: GE.attendance.isCertificateHeader,
      computeSummaryColumnLayout: GE.summary.computeSummaryColumnLayout,
      calcWeightedAvg: GE.virtual.calcWeightedAvg,
      projectAverageWithVirtualGrades: GE.virtual.projectAverageWithVirtualGrades,
      parseGradeWeight: GE.virtual.parseGradeWeight,
      dispatchFirstGradeExpansionClick: GE.virtual.dispatchFirstSyntheticClick,
      readExistingGradeMass: GE.virtual.readExistingGradeMass,
      buildGradeWeightModel: GE.virtual.buildGradeWeightModel,
      computeVirtualPopoverPosition: GE.virtual.computeVirtualPopoverPosition,
      migrateFlatMapToByOrigin: GE.migrateFlatMapToByOrigin,
      isLegacyFlatMap: GE.isLegacyFlatMap,
      parseSchoolYearStart: GE.parseSchoolYearStart,
      parseGradesHalfKey: GE.parseGradesHalfKey,
      buildGradesViewContext: GE.buildGradesViewContext,
      readGradesViewContext: GE.readGradesViewContext,
      hasUnenhancedGradesTable: GE.hasUnenhancedGradesTable,
      updateAttendanceCache: GE.attendance.updateAttendanceCache,
      pruneAttendanceCache: GE.attendance.pruneAttendanceCache,
      normalizeGradesSearchText: GE.sortFilter.normalizeSearchText,
      sortSubjectEntries: GE.sortFilter.sortSubjectEntries,
      collectSubjectGroups: GE.sortFilter.collectSubjectGroups,
      isGradesPage,
      nodeContainsGradesTable,
      syncAttendanceHeaderTransform: GE.attendance.syncAttendanceHeaderTransform,
    };
    return;
  }

  let waitingObserver = null;
  let domReadyHandler = null;

  function stopWaitingForGradesTable() {
    waitingObserver?.disconnect();
    waitingObserver = null;

    if (domReadyHandler) {
      document.removeEventListener("DOMContentLoaded", domReadyHandler);
      domReadyHandler = null;
    }
  }

  function startGradesEnhancer() {
    stopWaitingForGradesTable();

    if (document.readyState === "loading") {
      domReadyHandler = () => {
        domReadyHandler = null;
        GE.init();
      };
      document.addEventListener("DOMContentLoaded", domReadyHandler, { once: true });
      return;
    }

    GE.init();
  }

  function waitForGradesTable() {
    if (waitingObserver) return;

    waitingObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => Array.from(mutation.addedNodes || []).some(nodeContainsGradesTable))) {
        startGradesEnhancer();
      }
    });

    waitingObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (isGradesPage() || document.querySelector("table.znamkyTable")) {
    startGradesEnhancer();
  } else {
    // EduPage changes many dashboard routes without a document navigation.
    // Wait only until its grades table is inserted, then disconnect before
    // the heavier grades enhancer begins observing table rerenders.
    waitForGradesTable();
  }
})();
