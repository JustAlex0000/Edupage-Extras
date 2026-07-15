/**
 * grades-enhancer.js
 *
 * Core of the /znamky/ grades table enhancer: shared state, storage
 * plumbing, generic average/date helpers, injected CSS, and the render loop
 * (enhanceGradesTable) that wires together the feature modules loaded after
 * this file — grades-debug.js, grades-badges.js, grades-virtual.js,
 * grades-summary.js, grades-attendance.js, grades-export.js. Each of those
 * is its own top-level IIFE, so they can't see this file's functions
 * directly; instead every module publishes its public functions onto a
 * shared `GE` namespace (window.__eeGrades). grades-bootstrap.js (loaded
 * last, once every module has attached itself to GE) actually calls init().
 */

(function () {
  "use strict";

  if (window.top !== window) return;

  const GE = (window.__eeGrades = window.__eeGrades || {});

  const STYLE_ID = "ee-grades-enhancer-style";
  const AVERAGE_RENDER_SIGNATURE_ATTR = "data-ee-average-render-signature";
  const GRADE_BADGES_KEY = "gradeBadgesEnabled";
  const GRADE_TITLE_OVERRIDES_KEY = "eeGradeTitleOverrides";
  const GRADES_ATTENDANCE_KEY = "gradesAttendanceStatsEnabled";
  const GRADES_ATTENDANCE_DEBUG_KEY = "gradesAttendanceDebugEnabled";
  const HALFYEAR_START_KEY = "eeHalfyearStartDate";
  const HALFYEAR_END_KEY = "eeSecondHalfEndDate";
  const GRADES_EXPORT_KEY = "eeGradesExportEnabled";
  const VIRTUAL_GRADES_KEY = "eeVirtualGrades";
  const EXISTING_MASS_OVERRIDES_KEY = "eeVirtualGradeExistingMassOverrides";
  let gradeBadgesEnabled = false;
  let gradesExportEnabled = true;
  let observerTimer = null;
  let ignoreMutationsUntil = 0;
  let attendanceLoadToken = 0;

  // Mutable state shared with the other grades-*.js modules (each is its own
  // IIFE and can't see this file's local `let`s), addressed as GE.state.*.
  GE.state = {
    gradeTitleOverrides: {},
    virtualGradesData: {},
    existingMassOverrides: {},
    virtualGradesByOrigin: {},
    existingMassOverridesByOrigin: {},
    gradesAttendanceDebugEnabled: false,
    halfyearStartOverride: "",
    halfyearEndOverride: "",
    attendanceStatsCache: null,
    gradesAttendanceEnabled: true,
    gradesView: { selectedYear: null, halfKey: "", signature: "current:current" },
  };

    function t(key, substitutions) {
      try {
        return chrome.i18n.getMessage(key, substitutions) || key;
      } catch (error) {
        return key;
      }
    }
    function numberValue(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }
    function parseAverage(text) {
      if (!text) return Number.NaN;
      const match = text.trim().match(/^(\d+(?:[.,]\d+)?)/);
      return match ? Number.parseFloat(match[1].replace(",", ".")) : Number.NaN;
    }
    function detectAverageScale(rawText, avg) {
      if (!Number.isFinite(avg)) return null;
      if (/%/.test(String(rawText || ""))) return "percent";
      return avg > 5 ? "percent" : "grade";
    }
    function gradeColor(avg, scale = null) {
      const resolvedScale = scale || (avg > 5 ? "percent" : "grade");
      if (resolvedScale === "percent") {
        if (Number.isNaN(avg)) return "#888";
        if (avg >= 90) return "#2e7d32";
        if (avg >= 75) return "#558b2f";
        if (avg >= 60) return "#f57f17";
        if (avg >= 40) return "#e65100";
        return "#c62828";
      }

      if (Number.isNaN(avg)) return "#888";
      if (avg <= 1.5) return "#2e7d32";
      if (avg <= 2.5) return "#558b2f";
      if (avg <= 3.5) return "#f57f17";
      if (avg <= 4.5) return "#e65100";
      return "#c62828";
    }
    function normalizeDateInput(value) {
      const text = String(value || "");
      return parseDateOnly(text) ? text : "";
    }
    function gradePercentage(avg, scale = null) {
      const resolvedScale = scale || (avg > 5 ? "percent" : "grade");
      if (resolvedScale === "percent") {
        return Math.max(0, Math.min(100, avg));
      }

      return Math.max(4, Math.min(100, ((5 - avg) / 4) * 96 + 4));
    }
    function formatAverageDisplay(value, scale) {
      if (!Number.isFinite(value)) return "-";
      if (scale === "percent") {
        const formatter = new Intl.NumberFormat(document.documentElement.lang || navigator.language || "en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
        return `${formatter.format(value)} %`;
      }

      return value.toFixed(2);
    }
    function createBadgeElement(avg, displayText, { largeValue = false, scale = "grade" } = {}) {
      if (Number.isNaN(avg)) return null;

      const badge = document.createElement("div");
      badge.className = "ee-avg-badge";
      badge.style.setProperty("--avg-color", gradeColor(avg, scale));
      badge.style.setProperty("--avg-pct", `${gradePercentage(avg, scale).toFixed(1)}%`);

      const value = document.createElement("span");
      value.className = "ee-avg-value";
      if (largeValue) {
        value.classList.add("ee-avg-value-large");
      }
      value.textContent = displayText;

      const track = document.createElement("div");
      track.className = "ee-avg-bar-track";

      const fill = document.createElement("div");
      fill.className = "ee-avg-bar-fill";
      track.appendChild(fill);

      badge.appendChild(value);
      badge.appendChild(track);
      return badge;
    }
    function decodeHtmlEntities(value) {
      return String(value || "")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'");
    }
    function stripHtmlTags(value) {
      return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "));
    }
    function normalizeWhitespace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }
    function parseDateOnly(value) {
      return EE.parseDateOnly(value);
    }
    function formatDateISO(date) {
      return EE.formatDate(date);
    }
    function timeToMinutes(value) {
      const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
      if (!match) return Number.NaN;
      return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
    }
    function storageGet(keys) {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            resolve(result);
          });
        } catch (error) {
          reject(error);
        }
      });
    }
    function storageSet(value) {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.set(value, () => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    }
    function markInternalMutation(durationMs = 300) {
      ignoreMutationsUntil = Math.max(ignoreMutationsUntil, Date.now() + durationMs);
    }
    function currentOrigin() {
      return window.location.origin;
    }
    function parseSchoolYearStart(candidates) {
      for (const candidate of candidates || []) {
        const text = String(candidate || "").trim();
        const rangeMatch = text.match(/\b(20\d{2})\s*(?:\/|–|—|-)\s*(20)?(\d{2})\b/);
        const endYear = rangeMatch
          ? Number(rangeMatch[2] ? `${rangeMatch[2]}${rangeMatch[3]}` : `20${rangeMatch[3]}`)
          : null;
        if (rangeMatch && endYear === Number(rangeMatch[1]) + 1) {
          return Number(rangeMatch[1]);
        }

        const yearMatch = text.match(/^20\d{2}$/);
        if (yearMatch) return Number(yearMatch[0]);
      }
      return null;
    }
    function parseGradesHalfKey(candidates) {
      for (const candidate of candidates || []) {
        const text = String(candidate || "").trim();
        const tokenMatch = text.match(/^(?:P|V|KL)?([12])$/i);
        if (tokenMatch) return tokenMatch[1];

        const labelMatch = text.match(/\b([12])\s*\.\s*(?:polrok|pololet[ií]|half)/i);
        if (labelMatch) return labelMatch[1];
      }
      return "";
    }
    function buildGradesViewContext({ yearCandidates = [], periodCandidates = [] } = {}) {
      const selectedYear = parseSchoolYearStart(yearCandidates);
      const halfKey = parseGradesHalfKey(periodCandidates);
      return {
        selectedYear,
        halfKey,
        signature: `${selectedYear || "current"}:${halfKey || "current"}`,
      };
    }
    function readGradesViewContext(
      form = document.querySelector("form.zteFilterForm"),
      root = document,
    ) {
      const readControl = (scope, selector) => {
        const control = scope?.querySelector?.(selector);
        if (!control) return [];
        const selectedLabel = control.selectedOptions?.[0]?.textContent || "";
        return [control.value, selectedLabel];
      };

      return buildGradesViewContext({
        yearCandidates: [
          ...readControl(root, "#edubarSchoolYear select"),
          ...readControl(form, "[name=\"znamky_yearid_ns\"]"),
          ...readControl(form, "[name=\"znamky_yearid\"]"),
        ],
        periodCandidates: [
          ...readControl(form, "[name=\"rokobdobie\"]"),
          ...readControl(form, "[name=\"nadobdobie\"]"),
        ],
      });
    }

    // One-time migration for #49: virtual grades / mass overrides used to be
    // stored as a flat { [predmetid]: ... } map with no origin scoping. Detect
    // the legacy shape by value type (legacy values are arrays/numbers; the
    // new byOrigin map's values are always per-origin objects) and nest it
    // under the current origin so existing saved data isn't lost.
    function migrateFlatMapToByOrigin(stored, origin, isLegacyValue) {
      if (!stored || typeof stored !== "object") return {};
      const looksLegacy = Object.values(stored).some((value) => isLegacyValue(value));
      return looksLegacy ? { [origin]: stored } : stored;
    }
    function getGradesTables() {
      return Array.from(document.querySelectorAll("table.znamkyTable"));
    }
    function gradeTableRowCount(table) {
      return table?.querySelectorAll ? table.querySelectorAll("tr.predmetRow").length : 0;
    }
    function getPrimaryGradesTable() {
      const tables = getGradesTables();
      if (tables.length <= 1) {
        return tables[0] || null;
      }

      return tables.reduce((bestTable, currentTable) => {
        const bestScore = bestTable ? gradeTableRowCount(bestTable) : -1;
        const currentScore = gradeTableRowCount(currentTable);
        return currentScore > bestScore ? currentTable : bestTable;
      }, null);
    }
    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return;

      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .ee-avg-badge {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
          min-width: 52px;
        }

        .ee-avg-value {
          color: var(--avg-color);
          font-size: 14px;
          font-weight: bold;
          line-height: 1;
          transition: color 0.2s;
        }

        .ee-avg-value-large {
          font-size: 17px;
        }

        .ee-avg-bar-track {
          width: 100%;
          height: 4px;
          background: #e0e0e0;
          border-radius: 2px;
          overflow: hidden;
        }

        .ee-avg-bar-fill {
          height: 100%;
          width: var(--avg-pct);
          background: var(--avg-color);
          border-radius: 2px;
          transition: width 0.4s ease;
        }

        tr.ee-overall-row td {
          background-color: #f0f7ff !important;
          border-top: 2px solid #3e83b8 !important;
          font-size: 13px;
          padding: 8px 10px !important;
        }

        tr.ee-overall-row .ee-overall-label {
          color: #1565c0;
          font-size: 13px;
          font-weight: bold;
        }

        .ee-overall-meta {
          display: block;
          color: #777;
          font-size: 10px;
          line-height: 1.1;
        }

        table.znamkyTable th.ee-attendance-header,
        table.znamkyTable td.ee-attendance-cell {
          min-width: 78px !important;
          text-align: center !important;
          vertical-align: middle !important;
          white-space: nowrap;
        }

        table.znamkyTable td.ee-attendance-total-cell {
          min-width: 88px !important;
        }

        .ee-attendance-stat {
          display: inline-block;
          font-size: 12px;
          font-weight: bold;
          line-height: 1.1;
        }

        .ee-attendance-tone-good {
          color: #2e7d32;
        }

        .ee-attendance-tone-warn {
          color: #f57f17;
        }

        .ee-attendance-tone-danger {
          color: #c62828;
        }

        .ee-attendance-total {
          color: #263238;
        }

        .ee-attendance-empty {
          color: #78909c;
          font-size: 11px;
          font-weight: normal;
        }

        .ee-attendance-loading {
          letter-spacing: 0.08em;
          animation: eeAttendancePulse 1.15s ease-in-out infinite;
        }

        @keyframes eeAttendancePulse {
          0%, 100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }

        table.znamkyTable tr.predmetRow:hover .ee-avg-value {
          text-decoration: underline dotted;
        }

        table.znamkyTable th:last-of-type,
        table.znamkyTable .znPriemerCell {
          min-width: 64px !important;
        }

        tr.ee-overall-row .ee-overall-value-cell {
          padding: 8px 10px !important;
          text-align: right !important;
        }

        tr.ee-overall-row .ee-overall-attendance-cell {
          padding: 8px 10px !important;
          text-align: center !important;
        }

        tr.ee-overall-row .ee-avg-badge {
          margin-left: auto;
        }

        .ee-grades-toolbar {
          display: flex;
          justify-content: flex-end;
          margin: 6px 0;
        }

        .ee-grades-export-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          background: #e8f0fe;
          border: 1.5px solid #3e83b8;
          border-radius: 6px;
          color: #1565c0;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        }

        .ee-grades-export-btn:hover {
          background: #3e83b8;
          color: #fff;
          box-shadow: 0 1px 5px rgba(62, 131, 184, 0.45);
        }

        html.ee-dark .ee-grades-export-btn {
          background: rgba(62, 131, 184, 0.15);
          border-color: var(--ee-link);
          color: var(--ee-link);
        }

        html.ee-dark .ee-grades-export-btn:hover {
          background: var(--ee-link);
          color: #fff;
        }

        html.ee-dark .ee-avg-bar-track {
          background-color: var(--ee-border) !important;
        }

        html.ee-dark tr.ee-overall-row td {
          background-color: var(--ee-card-bg-bright) !important;
          border-top-color: var(--ee-link) !important;
          color: var(--ee-text) !important;
        }

        html.ee-dark tr.ee-overall-row .ee-overall-label {
          color: var(--ee-link) !important;
        }

        html.ee-dark .ee-overall-meta {
          color: var(--ee-text-muted) !important;
        }

        html.ee-dark .ee-attendance-total {
          color: var(--ee-text) !important;
        }

        html.ee-dark .ee-attendance-empty {
          color: var(--ee-text-muted) !important;
        }

        html.ee-dark .ee-attendance-tone-good {
          color: var(--ee-link) !important;
        }

        html.ee-dark .ee-attendance-tone-warn {
          color: var(--ee-warning) !important;
        }

        html.ee-dark .ee-attendance-tone-danger {
          color: var(--ee-danger) !important;
        }

        .ee-vg-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          margin-left: 5px;
          background: #e8f0fe;
          border: 1.5px solid #3e83b8;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          font-weight: bold;
          color: #1565c0;
          vertical-align: middle;
          padding: 0;
          line-height: 1;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
          flex-shrink: 0;
        }

        .ee-vg-btn:hover {
          background: #3e83b8;
          color: #fff;
          box-shadow: 0 1px 5px rgba(62, 131, 184, 0.45);
        }

        .ee-vg-btn.ee-vg-btn-active {
          background: #3e83b8;
          color: #fff;
          box-shadow: 0 1px 4px rgba(62, 131, 184, 0.35);
        }

        .ee-vg-projected {
          display: flex;
          align-items: center;
          gap: 3px;
          margin-top: 3px;
        }

        .ee-vg-arrow {
          font-size: 10px;
          color: #888;
          flex-shrink: 0;
        }

        .ee-vg-popover {
          position: fixed;
          z-index: 99999;
          background: #fff;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          padding: 12px;
          min-width: 210px;
          max-width: 290px;
        }

        .ee-vg-popover-header {
          font-size: 13px;
          font-weight: bold;
          color: #1565c0;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid #e0e0e0;
        }

        .ee-vg-list {
          margin-bottom: 8px;
          min-height: 20px;
        }

        .ee-vg-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 2px 0;
          font-size: 12px;
          gap: 4px;
        }

        .ee-vg-item-label {
          flex: 1;
          color: #444;
        }

        .ee-vg-empty {
          font-size: 11px;
          color: #999;
          font-style: italic;
        }

        .ee-vg-remove {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #c62828;
          font-size: 15px;
          padding: 0 2px;
          line-height: 1;
          flex-shrink: 0;
        }

        .ee-vg-remove:hover {
          color: #e53935;
        }

        .ee-vg-projection-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          border-top: 1px solid #e8e8e8;
          margin-bottom: 8px;
        }

        .ee-vg-mass-line {
          font-size: 10px;
          color: #888;
          margin: -4px 0 8px;
          cursor: help;
        }

        html.ee-dark .ee-vg-mass-line {
          color: var(--ee-text-muted);
        }

        .ee-vg-mass-box {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #555;
          margin: -2px 0 6px;
        }

        .ee-vg-mass-label {
          flex: 1;
        }

        .ee-vg-mass-input {
          flex: 0 0 56px;
          font-size: 11px;
          padding: 2px 4px;
        }

        .ee-vg-mass-reset {
          background: transparent;
          border: 1px solid #ccc;
          border-radius: 3px;
          color: #777;
          font-size: 10px;
          padding: 1px 6px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .ee-vg-mass-reset:hover {
          background: #f0f0f0;
          color: #333;
        }

        .ee-vg-mass-hint {
          font-size: 10px;
          color: #999;
          line-height: 1.3;
          margin: -4px 0 8px;
          font-style: italic;
        }

        html.ee-dark .ee-vg-mass-box {
          color: var(--ee-text-muted);
        }

        html.ee-dark .ee-vg-mass-reset {
          border-color: var(--ee-border);
          color: var(--ee-text-muted);
        }

        html.ee-dark .ee-vg-mass-reset:hover {
          background: var(--ee-card-hover);
          color: var(--ee-text);
        }

        html.ee-dark .ee-vg-mass-hint {
          color: var(--ee-text-muted);
        }

        .ee-vg-proj-label {
          font-size: 11px;
          color: #666;
          white-space: nowrap;
        }

        .ee-vg-form {
          display: flex;
          gap: 4px;
          align-items: center;
          padding-top: 8px;
          border-top: 1px solid #e0e0e0;
          flex-wrap: nowrap;
        }

        .ee-vg-input {
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 4px 6px;
          font-size: 12px;
          min-width: 0;
          flex: 1;
        }

        .ee-vg-input:focus {
          outline: none;
          border-color: #3e83b8;
        }

        .ee-vg-weight-input {
          flex: 0 0 42px;
        }

        .ee-vg-add-btn {
          background: #1565c0;
          color: #fff;
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .ee-vg-add-btn:hover {
          background: #1976d2;
        }

        html.ee-dark .ee-vg-btn {
          background: rgba(62, 131, 184, 0.15);
          border-color: var(--ee-link);
          color: var(--ee-link);
        }

        html.ee-dark .ee-vg-btn:hover,
        html.ee-dark .ee-vg-btn.ee-vg-btn-active {
          background: var(--ee-link);
          color: #fff;
        }

        html.ee-dark .ee-vg-arrow {
          color: var(--ee-text-muted);
        }

        html.ee-dark .ee-vg-popover {
          background: var(--ee-card-bg-bright);
          border-color: var(--ee-border);
          color: var(--ee-text);
        }

        html.ee-dark .ee-vg-popover-header {
          color: var(--ee-link);
          border-bottom-color: var(--ee-border);
        }

        html.ee-dark .ee-vg-item-label {
          color: var(--ee-text);
        }

        html.ee-dark .ee-vg-empty {
          color: var(--ee-text-muted);
        }

        html.ee-dark .ee-vg-remove {
          color: var(--ee-danger);
        }

        html.ee-dark .ee-vg-projection-row {
          border-top-color: var(--ee-border);
        }

        html.ee-dark .ee-vg-proj-label {
          color: var(--ee-text-muted);
        }

        html.ee-dark .ee-vg-form {
          border-top-color: var(--ee-border);
        }

        html.ee-dark .ee-vg-input {
          background: var(--ee-card-bg);
          border-color: var(--ee-border);
          color: var(--ee-text);
        }

        html.ee-dark .ee-vg-add-btn {
          background: var(--ee-link);
        }

        .ee-vg-reset-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          margin-left: 5px;
          background: #fce8e8;
          border: 1.5px solid #e57373;
          border-radius: 5px;
          cursor: pointer;
          font-size: 12px;
          color: #c62828;
          vertical-align: middle;
          padding: 0;
          line-height: 1;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        }

        .ee-vg-reset-btn:hover {
          background: #c62828;
          color: #fff;
          border-color: #c62828;
          box-shadow: 0 1px 5px rgba(198, 40, 40, 0.45);
        }

        .ee-vg-reset-btn:disabled {
          background: transparent;
          border-color: #ddd;
          color: #ccc;
          cursor: default;
          pointer-events: none;
          box-shadow: none;
        }

        html.ee-dark .ee-vg-reset-btn {
          background: rgba(198, 40, 40, 0.15);
          border-color: var(--ee-danger);
          color: var(--ee-danger);
        }

        html.ee-dark .ee-vg-reset-btn:hover {
          background: var(--ee-danger);
          color: #fff;
        }

        html.ee-dark .ee-vg-reset-btn:disabled {
          background: transparent;
          border-color: var(--ee-border);
          color: var(--ee-text-muted);
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    // ============================================================
    // Virtual Grade Calculator
    // ============================================================
    function enhanceGradesTable() {
      const tables = getGradesTables();
      const table = getPrimaryGradesTable();
      if (!table || tables.length === 0) return;

      const nextGradesView = readGradesViewContext();
      if (nextGradesView.signature !== GE.state.gradesView.signature) {
        GE.state.attendanceStatsCache = null;
        GE.attendance.resetForGradesView();
      }
      GE.state.gradesView = nextGradesView;

      markInternalMutation();
      injectStyles();
      tables.forEach((gradesTable) => GE.badges.applyStoredGradeTitles(gradesTable));
      if (gradesExportEnabled) {
        GE.gradesExport.ensureCsvExportButton(table);
      } else {
        document.querySelectorAll(".ee-grades-toolbar").forEach((toolbar) => toolbar.remove());
      }

      if (GE.state.gradesAttendanceEnabled) {
        tables.forEach((gradesTable) => GE.attendance.ensureAttendanceColumns(gradesTable));
      } else {
        tables.forEach((gradesTable) => GE.attendance.clearSubjectAttendance(gradesTable));
      }

      if (gradeBadgesEnabled) {
        const averages = GE.badges.collectAverages(table);
        const averageSignature = GE.badges.buildAverageRenderSignature(averages);
        const summarySignature = GE.summary.buildSummaryRenderSignature(
          averageSignature,
          GE.state.gradesAttendanceEnabled,
          null,
          null,
          GE.state.gradesAttendanceEnabled ? "loading" : "unavailable",
          GE.state.gradesAttendanceEnabled ? "loading" : "unavailable",
        );
        if (
          table.getAttribute(AVERAGE_RENDER_SIGNATURE_ATTR) !== averageSignature
          || table.querySelector("tr.ee-overall-row")?.dataset.eeSignature !== summarySignature
        ) {
          GE.summary.ensureSummaryRow(
            table,
            averages,
            summarySignature,
            {
              attendanceColumns: GE.state.gradesAttendanceEnabled,
              attendanceSummary: null,
              attendanceState: GE.state.gradesAttendanceEnabled ? "loading" : "unavailable",
              predictionState: GE.state.gradesAttendanceEnabled ? "loading" : "unavailable",
            },
          );
          table.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, averageSignature);
        }
        GE.virtual.ensureVirtualGradeButtons(table);
      } else {
        GE.badges.restoreAverageCells(table);
      }

      if (!GE.state.gradesAttendanceEnabled) {
        tables.forEach((gradesTable) => GE.attendance.clearSubjectAttendance(gradesTable));
        return;
      }

      const loadToken = ++attendanceLoadToken;
      tables.forEach((gradesTable) => GE.attendance.populateAttendancePlaceholders(
        gradesTable,
        t("gradesAttendanceStillLoading"),
        { loading: true },
      ));
      GE.attendance.loadBaseSubjectAttendanceStats()
        .then((data) => {
          if (!GE.state.gradesAttendanceEnabled || loadToken !== attendanceLoadToken) return;

          const liveTable = getPrimaryGradesTable();
          if (!liveTable) return;

          GE.attendance.renderSubjectAttendance(liveTable, data);

          getGradesTables()
            .filter((gradesTable) => gradesTable !== liveTable)
            .forEach((gradesTable) => GE.attendance.ensureAttendanceColumns(gradesTable));

          if (gradeBadgesEnabled) {
            const liveAverages = GE.badges.collectAverages(liveTable);
            const liveAverageSignature = GE.badges.buildAverageRenderSignature(liveAverages);
            const attendanceSummary = data.attendanceSummary || GE.attendance.summarizeAttendance(data.subjects);
            GE.summary.ensureSummaryRow(
              liveTable,
              liveAverages,
              GE.summary.buildSummaryRenderSignature(
                liveAverageSignature,
                true,
                data.attendanceBreakdown || attendanceSummary,
                data.predictedAttendanceSummary || null,
                "ready",
                data.predictionState || "ready",
              ),
              {
                attendanceColumns: true,
                attendanceSummary,
                predictedAttendanceSummary: data.predictedAttendanceSummary || null,
                attendanceBreakdown: data.attendanceBreakdown || null,
                predictionState: data.predictionState || "ready",
              },
            );
            liveTable.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, liveAverageSignature);
          }

          if (data.predictionState === "ready") {
            return;
          }

          GE.attendance.loadSubjectAttendanceStats()
            .then((finalData) => {
              if (!GE.state.gradesAttendanceEnabled || loadToken !== attendanceLoadToken) return;
              const latestTable = getPrimaryGradesTable();
              if (!latestTable) return;

              GE.attendance.renderSubjectAttendance(latestTable, finalData);

              if (gradeBadgesEnabled) {
                const latestAverages = GE.badges.collectAverages(latestTable);
                const latestAverageSignature = GE.badges.buildAverageRenderSignature(latestAverages);
                const latestAttendanceSummary = finalData.attendanceSummary || GE.attendance.summarizeAttendance(finalData.subjects);
                GE.summary.ensureSummaryRow(
                  latestTable,
                  latestAverages,
                  GE.summary.buildSummaryRenderSignature(
                    latestAverageSignature,
                    true,
                    finalData.attendanceBreakdown || latestAttendanceSummary,
                    finalData.predictedAttendanceSummary || null,
                    "ready",
                    finalData.predictionState || "ready",
                  ),
                  {
                    attendanceColumns: true,
                    attendanceSummary: latestAttendanceSummary,
                    predictedAttendanceSummary: finalData.predictedAttendanceSummary || null,
                    attendanceBreakdown: finalData.attendanceBreakdown || null,
                    predictionState: finalData.predictionState || "ready",
                  },
                );
                latestTable.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, latestAverageSignature);
              }
            })
            .catch(() => {
              if (!GE.state.gradesAttendanceEnabled || loadToken !== attendanceLoadToken) return;
              const latestTable = getPrimaryGradesTable();
              if (!latestTable) return;
              const unavailableData = {
                ...data,
                predictionState: "unavailable",
              };
              GE.attendance.renderSubjectAttendance(latestTable, unavailableData);
              if (gradeBadgesEnabled) {
                const latestAverages = GE.badges.collectAverages(latestTable);
                const latestAverageSignature = GE.badges.buildAverageRenderSignature(latestAverages);
                const latestAttendanceSummary = unavailableData.attendanceSummary || GE.attendance.summarizeAttendance(unavailableData.subjects);
                GE.summary.ensureSummaryRow(
                  latestTable,
                  latestAverages,
                  GE.summary.buildSummaryRenderSignature(
                    latestAverageSignature,
                    true,
                    unavailableData.attendanceBreakdown || latestAttendanceSummary,
                    null,
                    "ready",
                    "unavailable",
                  ),
                  {
                    attendanceColumns: true,
                    attendanceSummary: latestAttendanceSummary,
                    predictedAttendanceSummary: null,
                    attendanceBreakdown: unavailableData.attendanceBreakdown || null,
                    predictionState: "unavailable",
                  },
                );
                latestTable.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, latestAverageSignature);
              }
            });
        })
        .catch(() => {
          if (loadToken !== attendanceLoadToken) return;
          const liveTable = getPrimaryGradesTable();
          if (liveTable && GE.state.gradesAttendanceEnabled) {
            GE.attendance.populateAttendancePlaceholders(liveTable);
            if (gradeBadgesEnabled) {
              const liveAverages = GE.badges.collectAverages(liveTable);
              const liveAverageSignature = GE.badges.buildAverageRenderSignature(liveAverages);
              GE.summary.ensureSummaryRow(
                liveTable,
                liveAverages,
                GE.summary.buildSummaryRenderSignature(liveAverageSignature, true, null, null, "unavailable", "unavailable"),
                {
                  attendanceColumns: true,
                  attendanceSummary: null,
                  predictedAttendanceSummary: null,
                  attendanceState: "unavailable",
                  predictionState: "unavailable",
                },
              );
              liveTable.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, liveAverageSignature);
            }
          }
          getGradesTables()
            .filter((gradesTable) => gradesTable !== liveTable)
            .forEach((gradesTable) => GE.attendance.populateAttendancePlaceholders(gradesTable));
        });
    }
    function scheduleEnhance() {
      window.clearTimeout(observerTimer);
      observerTimer = window.setTimeout(enhanceGradesTable, 160);
    }
    function initStorage() {
      chrome.storage.local.get([
        GRADE_BADGES_KEY,
        GRADE_TITLE_OVERRIDES_KEY,
        GRADES_ATTENDANCE_KEY,
        GRADES_ATTENDANCE_DEBUG_KEY,
        HALFYEAR_START_KEY,
        HALFYEAR_END_KEY,
        GRADES_EXPORT_KEY,
        VIRTUAL_GRADES_KEY,
        EXISTING_MASS_OVERRIDES_KEY,
      ], (result) => {
        gradeBadgesEnabled = result[GRADE_BADGES_KEY] === true;
        gradesExportEnabled = result[GRADES_EXPORT_KEY] !== false;
        GE.state.gradeTitleOverrides = result[GRADE_TITLE_OVERRIDES_KEY] && typeof result[GRADE_TITLE_OVERRIDES_KEY] === "object"
          ? result[GRADE_TITLE_OVERRIDES_KEY]
          : {};
        GE.state.gradesAttendanceEnabled = result[GRADES_ATTENDANCE_KEY] !== false;
        GE.state.gradesAttendanceDebugEnabled = result[GRADES_ATTENDANCE_DEBUG_KEY] === true;
        GE.state.halfyearStartOverride = normalizeDateInput(result[HALFYEAR_START_KEY]);
        GE.state.halfyearEndOverride = normalizeDateInput(result[HALFYEAR_END_KEY]);
        const origin = currentOrigin();
        GE.state.virtualGradesByOrigin = migrateFlatMapToByOrigin(result[VIRTUAL_GRADES_KEY], origin, Array.isArray);
        GE.state.virtualGradesData = GE.state.virtualGradesByOrigin[origin] && typeof GE.state.virtualGradesByOrigin[origin] === "object"
          ? GE.state.virtualGradesByOrigin[origin]
          : {};
        GE.state.existingMassOverridesByOrigin = migrateFlatMapToByOrigin(
          result[EXISTING_MASS_OVERRIDES_KEY],
          origin,
          (value) => typeof value === "number",
        );
        GE.state.existingMassOverrides = GE.state.existingMassOverridesByOrigin[origin] && typeof GE.state.existingMassOverridesByOrigin[origin] === "object"
          ? GE.state.existingMassOverridesByOrigin[origin]
          : {};
        enhanceGradesTable();
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        let shouldEnhance = false;

        if (changes[GRADE_BADGES_KEY]) {
          gradeBadgesEnabled = changes[GRADE_BADGES_KEY].newValue === true;
          shouldEnhance = true;
        }

        if (changes[GRADES_EXPORT_KEY]) {
          gradesExportEnabled = changes[GRADES_EXPORT_KEY].newValue !== false;
          shouldEnhance = true;
        }

        if (changes[GRADE_TITLE_OVERRIDES_KEY]) {
          GE.state.gradeTitleOverrides = changes[GRADE_TITLE_OVERRIDES_KEY].newValue && typeof changes[GRADE_TITLE_OVERRIDES_KEY].newValue === "object"
            ? changes[GRADE_TITLE_OVERRIDES_KEY].newValue
            : {};
          shouldEnhance = true;
        }

        if (changes[GRADES_ATTENDANCE_KEY]) {
          GE.state.gradesAttendanceEnabled = changes[GRADES_ATTENDANCE_KEY].newValue !== false;
          shouldEnhance = true;
        }

        if (changes[GRADES_ATTENDANCE_DEBUG_KEY]) {
          GE.state.gradesAttendanceDebugEnabled = changes[GRADES_ATTENDANCE_DEBUG_KEY].newValue === true;
          GE.state.attendanceStatsCache = null;
          shouldEnhance = true;
        }

        if (changes[HALFYEAR_START_KEY]) {
          GE.state.halfyearStartOverride = normalizeDateInput(changes[HALFYEAR_START_KEY].newValue);
          GE.state.attendanceStatsCache = null;
          shouldEnhance = true;
        }

        if (changes[HALFYEAR_END_KEY]) {
          GE.state.halfyearEndOverride = normalizeDateInput(changes[HALFYEAR_END_KEY].newValue);
          GE.state.attendanceStatsCache = null;
          shouldEnhance = true;
        }

        if (shouldEnhance) {
          enhanceGradesTable();
        }
      });
    }
    function initObserver() {
      const isGradesMutation = (mutation) => {
        const nodes = [
          mutation.target,
          ...Array.from(mutation.addedNodes || []),
          ...Array.from(mutation.removedNodes || []),
        ];

        return nodes.some((node) => {
          const element = node instanceof Element ? node : node?.parentElement;
          if (!element) return false;
          return element.matches("table.znamkyTable")
            || Boolean(element.closest("table.znamkyTable"))
            || Boolean(element.querySelector?.("table.znamkyTable"));
        });
      };

      const observer = new MutationObserver((mutations) => {
        if (Date.now() < ignoreMutationsUntil) {
          return;
        }

        if (mutations.some(isGradesMutation) && document.querySelector("table.znamkyTable")) {
          scheduleEnhance();
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    function init() {
      injectStyles();
      GE.badges.loadGradeTitleOverrides();
      document.addEventListener("dblclick", GE.badges.handleGradeTitleEdit, true);
      document.addEventListener("click", GE.virtual.handleDocumentClickForPopover, true);
      initStorage();
      enhanceGradesTable();
      initObserver();
    }
    function readAverageText(priemerCell) {
      if (!priemerCell) return "";
      if (priemerCell.dataset.eeOriginalAverage) {
        return priemerCell.dataset.eeOriginalAverage;
      }

      const link = priemerCell.querySelector("a");
      return (link ? link.textContent : priemerCell.textContent).trim();
    }

  GE.t = t;
  GE.numberValue = numberValue;
  GE.parseAverage = parseAverage;
  GE.detectAverageScale = detectAverageScale;
  GE.gradeColor = gradeColor;
  GE.normalizeDateInput = normalizeDateInput;
  GE.gradePercentage = gradePercentage;
  GE.formatAverageDisplay = formatAverageDisplay;
  GE.createBadgeElement = createBadgeElement;
  GE.decodeHtmlEntities = decodeHtmlEntities;
  GE.stripHtmlTags = stripHtmlTags;
  GE.normalizeWhitespace = normalizeWhitespace;
  GE.parseDateOnly = parseDateOnly;
  GE.formatDateISO = formatDateISO;
  GE.timeToMinutes = timeToMinutes;
  GE.storageGet = storageGet;
  GE.storageSet = storageSet;
  GE.markInternalMutation = markInternalMutation;
  GE.currentOrigin = currentOrigin;
  GE.parseSchoolYearStart = parseSchoolYearStart;
  GE.parseGradesHalfKey = parseGradesHalfKey;
  GE.buildGradesViewContext = buildGradesViewContext;
  GE.readGradesViewContext = readGradesViewContext;
  GE.migrateFlatMapToByOrigin = migrateFlatMapToByOrigin;
  GE.getGradesTables = getGradesTables;
  GE.gradeTableRowCount = gradeTableRowCount;
  GE.getPrimaryGradesTable = getPrimaryGradesTable;
  GE.injectStyles = injectStyles;
  GE.enhanceGradesTable = enhanceGradesTable;
  GE.scheduleEnhance = scheduleEnhance;
  GE.initStorage = initStorage;
  GE.initObserver = initObserver;
  GE.init = init;
  GE.readAverageText = readAverageText;
})();
