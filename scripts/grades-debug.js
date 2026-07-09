/**
 * grades-debug.js
 *
 * Debug-only helpers for the grades attendance-stats pipeline: gated console
 * logging and the `data-ee-grades-attendance-debug` DOM dump consumed by
 * "Report a Problem" diagnostics. Only grades-attendance.js calls into this.
 */

(function () {
  "use strict";

  const GE = (window.__eeGrades = window.__eeGrades || {});

    function debugLog(...args) {
      if (!GE.state.gradesAttendanceDebugEnabled) return;
      console.log("[Edupage Extras][Grades Debug]", ...args);
    }
    function debugWarn(...args) {
      if (!GE.state.gradesAttendanceDebugEnabled) return;
      console.warn("[Edupage Extras][Grades Debug]", ...args);
    }
    function summarizeSubjectsForDebug(subjects) {
      return (subjects || []).map((entry) => ({
        key: entry.key,
        rawId: entry.rawId,
        displayName: entry.displayName,
        shortName: entry.shortName,
        absent: entry.absent,
        total: entry.total,
        percent: Number.isFinite(entry.percent) ? Number(entry.percent.toFixed(2)) : null,
        aliases: Array.from(entry.aliases || []).sort(),
      }));
    }
    function syncAttendanceDebug(debug) {
      const value = debug ? JSON.stringify(debug) : "";

      try {
        if (document?.documentElement) {
          if (value) {
            document.documentElement.dataset.eeGradesAttendanceDebug = value;
          } else {
            delete document.documentElement.dataset.eeGradesAttendanceDebug;
          }
        }
      } catch (error) {
        debugWarn("Could not sync attendance debug dataset.", error);
      }
    }

    // Manual decode instead of the classic <textarea>.innerHTML trick — that's
    // spec-safe (textarea is a raw-text element, never parses child markup) but
    // extension-store linters flag any dynamic innerHTML assignment on sight.
    // EduPage's grade-title tooltip HTML only ever needs basic entity decoding
    // (it's simple escaped text, not rich content), so numeric + the standard
    // five named entities cover every real case without touching the DOM at all.

  GE.debug = {
    log: debugLog,
    warn: debugWarn,
    summarizeSubjectsForDebug,
    syncAttendanceDebug,
  };
})();
