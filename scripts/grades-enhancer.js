/**
 * grades-enhancer.js
 *
 * Enhances the EduPage /znamky/ table in-place:
 * - average badges and bars
 * - overall average row based on EduPage-rendered subject averages
 * - current-halfyear subject absence stats in dedicated table columns
 */

(function () {
  "use strict";

  if (window.top !== window) return;

  const STYLE_ID = "ee-grades-enhancer-style";
  const AVERAGE_RENDER_SIGNATURE_ATTR = "data-ee-average-render-signature";
  const ATTENDANCE_RENDER_SIGNATURE_ATTR = "data-ee-attendance-render-signature";
  const GRADE_BADGES_KEY = "gradeBadgesEnabled";
  const GRADE_TITLE_OVERRIDES_KEY = "eeGradeTitleOverrides";
  const GRADES_ATTENDANCE_KEY = "gradesAttendanceStatsEnabled";
  const ACCURATE_PREDICTED_ATTENDANCE_KEY = "eeAccuratePredictedAttendanceEnabled";
  const GRADES_ATTENDANCE_DEBUG_KEY = "gradesAttendanceDebugEnabled";
  const HALFYEAR_START_KEY = "eeHalfyearStartDate";
  const HALFYEAR_END_KEY = "eeSecondHalfEndDate";
  const GRADES_ATTENDANCE_CACHE_KEY = "eeGradesAttendanceStatsCache";
  const GRADES_ATTENDANCE_CACHE_VERSION = 14;
  const VIRTUAL_GRADES_KEY = "eeVirtualGrades";
  const EXISTING_MASS_OVERRIDES_KEY = "eeVirtualGradeExistingMassOverrides";
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const CLASSBOOK_RANGE_MAX_DAYS = 30;
  let gradeBadgesEnabled = false;
  let gradesAttendanceEnabled = true;
  let accuratePredictedAttendanceEnabled = false;
  let gradesAttendanceDebugEnabled = false;
  let halfyearStartOverride = "";
  let halfyearEndOverride = "";
  let observerTimer = null;
  let headerSyncTimer = null;
  let attendanceStatsCache = null;
  let attendanceBaseStatsPromise = null;
  let attendanceStatsPromise = null;
  let attendanceLoadToken = 0;
  let ignoreMutationsUntil = 0;
  let gradeTitleOverrides = {};
  let gradeTitleOverridesPromise = null;
  let virtualGradesData = {};
  let existingMassOverrides = {};
  // In-memory per-page-load cache of the weight mass auto-detected by
  // briefly expanding a subject row. Avoids re-running the expand dance every
  // time the popover opens on the same subject.
  const autoDetectedMassCache = new Map();
  // Tracks subjects we expanded ourselves so we can detect them as
  // "auto-expanded" vs "user-expanded" if we ever want to collapse back.
  const autoExpandedSubjects = new Set();
  let activeVirtualPopover = null;

  function t(key, substitutions) {
    try {
      return chrome.i18n.getMessage(key, substitutions) || key;
    } catch (error) {
      return key;
    }
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

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function shouldCountAbsentType(typeMeta) {
    if (!typeMeta) return true;

    const category = String(typeMeta.et || "").trim().toLowerCase();
    if (category) {
      return category === "o" || category === "n";
    }

    const short = String(typeMeta.short || "").trim().toLowerCase();
    const normalizedName = normalizeText(typeMeta.name || "");

    if (short === "r" || normalizedName.includes("reprezent")) {
      return false;
    }

    if (short === "o" || short === "n") {
      return true;
    }

    if (normalizedName.includes("ospravedlnen") || normalizedName.includes("neospravedlnen")) {
      return true;
    }

    return true;
  }

  function isMissedLessonRecord(record, absenceTypeMap = null) {
    if (String(record?.presence || "") !== "A") return false;

    const typeId = String(record?.studentabsent_typeid || "").trim();
    if (!typeId) return true;

    return shouldCountAbsentType(absenceTypeMap?.get(typeId));
  }

  function separateMergedWords(value) {
    return String(value || "")
      .replace(/([a-záäčďéíĺľňóôŕšťúýž])([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])/g, "$1 $2");
  }

  function separateMergedWordsUnicode(value) {
    return String(value || "")
      .replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2");
  }

  function normalizeText(value) {
    return separateMergedWordsUnicode(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasUsefulLetters(value) {
    return /[a-z]/i.test(String(value || ""));
  }

  function debugLog(...args) {
    if (!gradesAttendanceDebugEnabled) return;
    console.log("[Edupage Extras][Grades Debug]", ...args);
  }

  function debugWarn(...args) {
    if (!gradesAttendanceDebugEnabled) return;
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

  function decodeHtmlEntities(value) {
    if (typeof document?.createElement !== "function") {
      return String(value || "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'");
    }

    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  function stripHtmlTags(value) {
    return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "));
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseGradeTitleSegments(originalTitleHtml) {
    const html = String(originalTitleHtml || "").trim();
    if (!html) {
      return { title: "", detailHtml: "" };
    }

    const titleMatch = html.match(/<b>([\s\S]*?)<\/b>/i);
    const title = normalizeWhitespace(stripHtmlTags(titleMatch?.[1] || ""));
    const withoutTitle = titleMatch
      ? `${html.slice(0, titleMatch.index)}${html.slice((titleMatch.index || 0) + titleMatch[0].length)}`
      : html;
    const detailHtml = withoutTitle.replace(/^(<br\s*\/?>|\s)+/i, "").trim();

    return { title, detailHtml };
  }

  function buildGradeOriginalTitleHtml(title, detailHtml = "") {
    const safeTitle = normalizeWhitespace(title);
    const safeDetail = String(detailHtml || "").trim();
    if (!safeTitle && !safeDetail) return "";
    if (!safeTitle) return safeDetail;
    if (!safeDetail) return `<b>${safeTitle}</b>`;
    return `<b>${safeTitle}</b><br>${safeDetail}`;
  }

  function gradeCellColumnIndex(cell) {
    if (!(cell instanceof HTMLTableCellElement) || !(cell.parentElement instanceof HTMLTableRowElement)) {
      return -1;
    }

    const cells = Array.from(cell.parentElement.cells);
    return cells.indexOf(cell);
  }

  function buildGradeTitleOverrideKey(subjectId, dateText, gradeValue, columnIndex, defaultTitle) {
    return [
      String(subjectId || "").trim(),
      normalizeWhitespace(dateText),
      normalizeWhitespace(gradeValue),
      Number.isInteger(columnIndex) ? columnIndex : -1,
      normalizeWhitespace(defaultTitle),
    ].join("|");
  }

  function extractGradeCellMeta(gradeTip) {
    if (!(gradeTip instanceof Element)) return null;

    const row = gradeTip.closest("tr[data-predmetid]");
    const cell = gradeTip.closest("td");
    const originalTitle = String(gradeTip.getAttribute("data-ee-original-grade-title") || gradeTip.getAttribute("original-title") || "").trim();
    const gradeValue = normalizeWhitespace(gradeTip.querySelector(".znZnamka")?.textContent || gradeTip.textContent || "");
    const { title, detailHtml } = parseGradeTitleSegments(originalTitle);
    const dateMatch = stripHtmlTags(detailHtml).match(/D[aá]tum známky:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i);
    const dateText = dateMatch?.[1] || "";
    const subjectId = String(row?.dataset?.predmetid || "").trim();
    const columnIndex = gradeCellColumnIndex(cell);

    if (!subjectId || !gradeValue || !dateText || columnIndex < 0) {
      return null;
    }

    return {
      subjectId,
      gradeValue,
      dateText,
      columnIndex,
      defaultTitle: title,
      detailHtml,
      storageKey: buildGradeTitleOverrideKey(subjectId, dateText, gradeValue, columnIndex, title),
    };
  }

  async function loadGradeTitleOverrides() {
    if (gradeTitleOverridesPromise) {
      return gradeTitleOverridesPromise;
    }

    gradeTitleOverridesPromise = storageGet([GRADE_TITLE_OVERRIDES_KEY])
      .then((result) => {
        gradeTitleOverrides = result[GRADE_TITLE_OVERRIDES_KEY] && typeof result[GRADE_TITLE_OVERRIDES_KEY] === "object"
          ? result[GRADE_TITLE_OVERRIDES_KEY]
          : {};
        return gradeTitleOverrides;
      })
      .finally(() => {
        gradeTitleOverridesPromise = null;
      });

    return gradeTitleOverridesPromise;
  }

  async function saveGradeTitleOverrides() {
    await storageSet({ [GRADE_TITLE_OVERRIDES_KEY]: gradeTitleOverrides });
  }

  function applyStoredGradeTitles(table) {
    Array.from(table.querySelectorAll("span.tips")).forEach((gradeTip) => {
      if (!(gradeTip instanceof Element) || !gradeTip.querySelector(".znZnamka")) return;
      if (!gradeTip.hasAttribute("data-ee-original-grade-title")) {
        gradeTip.setAttribute("data-ee-original-grade-title", gradeTip.getAttribute("original-title") || "");
      }

      const meta = extractGradeCellMeta(gradeTip);
      if (!meta) return;

      const overrideTitle = normalizeWhitespace(gradeTitleOverrides[meta.storageKey] || "");
      const finalTitle = overrideTitle || meta.defaultTitle;
      const updatedTitleHtml = buildGradeOriginalTitleHtml(finalTitle, meta.detailHtml);
      if (updatedTitleHtml) {
        gradeTip.setAttribute("original-title", updatedTitleHtml);
        gradeTip.setAttribute("title", `${finalTitle}${meta.dateText ? `\nDátum známky: ${meta.dateText}` : ""}`);
      }
    });
  }

  async function handleGradeTitleEdit(event) {
    const gradeTip = event.target instanceof Element ? event.target.closest("span.tips") : null;
    if (!(gradeTip instanceof Element) || !gradeTip.querySelector(".znZnamka")) return;

    const meta = extractGradeCellMeta(gradeTip);
    if (!meta) return;

    event.preventDefault();
    event.stopPropagation();

    const currentValue = normalizeWhitespace(gradeTitleOverrides[meta.storageKey] || meta.defaultTitle);
    const updatedTitle = window.prompt("Grade title", currentValue);
    if (updatedTitle === null) return;

    const normalizedTitle = normalizeWhitespace(updatedTitle);
    if (!normalizedTitle || normalizedTitle === meta.defaultTitle) {
      delete gradeTitleOverrides[meta.storageKey];
    } else {
      gradeTitleOverrides[meta.storageKey] = normalizedTitle;
    }

    await saveGradeTitleOverrides();
    enhanceGradesTable();
  }

  function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const date = new Date(year, month - 1, day);

    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function formatDateISO(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function timeToMinutes(value) {
    const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
    if (!match) return Number.NaN;
    return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
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
        border-color: var(--ee-accent);
        color: var(--ee-accent);
      }

      html.ee-dark .ee-grades-export-btn:hover {
        background: var(--ee-accent);
        color: #fff;
      }

      html.ee-dark .ee-avg-bar-track {
        background-color: var(--ee-border) !important;
      }

      html.ee-dark tr.ee-overall-row td {
        background-color: var(--ee-bg-elevated) !important;
        border-top-color: var(--ee-accent) !important;
        color: var(--ee-text-main) !important;
      }

      html.ee-dark tr.ee-overall-row .ee-overall-label {
        color: var(--ee-accent) !important;
      }

      html.ee-dark .ee-overall-meta {
        color: var(--ee-text-muted) !important;
      }

      html.ee-dark .ee-attendance-total {
        color: var(--ee-text-main) !important;
      }

      html.ee-dark .ee-attendance-empty {
        color: var(--ee-text-muted) !important;
      }

      html.ee-dark .ee-attendance-tone-good {
        color: var(--ee-accent) !important;
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
        background: var(--ee-bg-muted);
        color: var(--ee-text-main);
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
        border-color: var(--ee-accent);
        color: var(--ee-accent);
      }

      html.ee-dark .ee-vg-btn:hover,
      html.ee-dark .ee-vg-btn.ee-vg-btn-active {
        background: var(--ee-accent);
        color: #fff;
      }

      html.ee-dark .ee-vg-arrow {
        color: var(--ee-text-muted);
      }

      html.ee-dark .ee-vg-popover {
        background: var(--ee-bg-elevated);
        border-color: var(--ee-border);
        color: var(--ee-text-main);
      }

      html.ee-dark .ee-vg-popover-header {
        color: var(--ee-accent);
        border-bottom-color: var(--ee-border);
      }

      html.ee-dark .ee-vg-item-label {
        color: var(--ee-text-main);
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
        background: var(--ee-bg-base);
        border-color: var(--ee-border);
        color: var(--ee-text-main);
      }

      html.ee-dark .ee-vg-add-btn {
        background: var(--ee-accent);
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

  function calcWeightedAvg(grades) {
    if (!grades.length) return Number.NaN;
    const totalWeight = grades.reduce((s, g) => s + g.weight, 0);
    if (totalWeight === 0) return Number.NaN;
    return grades.reduce((s, g) => s + g.value * g.weight, 0) / totalWeight;
  }

  function parseGradeWeight(tooltipText) {
    // EduPage labels the weight in the school's language. The label can stand
    // alone ("Váha: 2"), include a multiplier suffix ("Váha: 2x"), or pad the
    // label with extra words ("Váha udalosti: 2x"). The previous regex
    // required ":" immediately after "Váha", so the "Váha udalosti: 2x" form
    // silently fell back to weight 1, which under-weighted real grades and
    // skewed the projection. Allow up to 30 non-digit characters between the
    // label and the number so all the common Slovak/Czech/English/German
    // tooltip variants are covered.
    if (!tooltipText) return null;
    const match = /(?:v[aá]h[ay]|weight|gewicht)[^0-9]{0,30}?(\d+(?:[.,]\d+)?)/i
      .exec(String(tooltipText));
    if (!match) return null;
    const value = Number.parseFloat(match[1].replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function countGradeCellsIn(element) {
    let count = 0;
    if (!element || typeof element.querySelectorAll !== "function") return 0;
    element.querySelectorAll("span.tips").forEach((tip) => {
      if (!tip.querySelector(".znZnamka")) return;
      const text = normalizeWhitespace(tip.querySelector(".znZnamka").textContent || "");
      const value = parseAverage(text);
      if (Number.isFinite(value) && value > 0) count += 1;
    });
    return count;
  }

  function findSubjectSubRows(predmetRow) {
    // EduPage renders a subject's grades broken down into category sub-rows
    // ("ústna odpoveď", "písomná odpoveď", ...) where the category label
    // carries the weight ("Váha udalosti: 2×"). Sub-rows may be:
    //   (a) sibling <tr>s placed AFTER predmetRow, up to the next predmetRow
    //   (b) nested <tr>s inside predmetRow (some skins wrap them in an inner
    //       table inside one of predmetRow's <td>s)
    // We collect both so the mass calculation works regardless of layout.
    const subRows = [];

    // EduPage stamps the category sub-rows (class "udalostRow") with the SAME
    // data-predmetid as their parent subject row, so we can only treat a
    // sibling as the next subject when (a) it carries the predmetRow class, or
    // (b) its data-predmetid actually differs from ours. The old check broke
    // out on any sibling that had data-predmetid at all, which meant sub-rows
    // were never collected and the per-category "Váha udalosti: 2×" labels
    // were invisible to the weight parser.
    const startingPredmetid = predmetRow.dataset ? predmetRow.dataset.predmetid || "" : "";
    let cursor = predmetRow.nextElementSibling;
    while (cursor) {
      const classes = cursor.classList;
      const cursorPredmetid = cursor.dataset ? cursor.dataset.predmetid || "" : "";
      const isNextSubject = (classes && typeof classes.contains === "function" && classes.contains("predmetRow"))
        || (cursorPredmetid && cursorPredmetid !== startingPredmetid);
      if (isNextSubject) break;
      if (cursor.tagName === "TR") subRows.push(cursor);
      cursor = cursor.nextElementSibling;
    }

    if (typeof predmetRow.querySelectorAll === "function") {
      Array.from(predmetRow.querySelectorAll("tr")).forEach((nested) => {
        if (nested !== predmetRow && !subRows.includes(nested)) {
          subRows.push(nested);
        }
      });
    }

    return subRows;
  }

  function readExistingGradeMass(predmetRow) {
    // Prefer sub-row math: each sub-row contributes (cellCount × rowWeight),
    // where rowWeight comes from "Váha udalosti: N×" on the row's label.
    // This is the only signal that exists for the weight-2 categories in
    // typical EduPage skins — per-cell tooltips don't carry the weight.
    // Fall back to per-cell tooltip parsing only when no sub-row has any
    // grade cells (single-category subjects, exotic skins, etc.).
    let totalWeight = 0;
    let cellCount = 0;
    let weightsParsed = 0;

    const subRows = findSubjectSubRows(predmetRow);
    for (const subRow of subRows) {
      const subRowCellCount = countGradeCellsIn(subRow);
      if (subRowCellCount === 0) continue;
      const labelText = subRow.textContent || "";
      const explicitWeight = parseGradeWeight(labelText);
      const subRowWeight = explicitWeight !== null ? explicitWeight : 1;
      totalWeight += subRowCellCount * subRowWeight;
      cellCount += subRowCellCount;
      if (explicitWeight !== null) {
        weightsParsed += subRowCellCount;
      }
    }

    if (cellCount > 0) {
      return { totalWeight, cellCount, weightsParsed };
    }

    // Fallback path: no sub-rows had grade cells. Read from predmetRow
    // directly and try per-cell tooltips. This is the original behavior and
    // still correct for layouts that don't use category sub-rows at all.
    predmetRow.querySelectorAll("span.tips").forEach((tip) => {
      if (!tip.querySelector(".znZnamka")) return;
      const text = normalizeWhitespace(tip.querySelector(".znZnamka").textContent || "");
      const value = parseAverage(text);
      if (!Number.isFinite(value) || value <= 0) return;

      cellCount += 1;
      const tooltip = tip.getAttribute("data-ee-original-grade-title")
        || tip.getAttribute("original-title")
        || tip.getAttribute("title")
        || "";
      const parsedWeight = parseGradeWeight(tooltip);
      if (parsedWeight !== null) {
        totalWeight += parsedWeight;
        weightsParsed += 1;
      } else {
        totalWeight += 1;
      }
    });

    return { totalWeight, cellCount, weightsParsed };
  }

  function projectAverageWithVirtualGrades(originalAvg, existingMass, virtualGrades) {
    // Treat the EduPage-rendered average as the aggregate of every existing
    // grade, weighted by the SUM of the cells' individual weights (read from
    // their tooltips). That's exactly the same arithmetic as a full per-grade
    // weighted mean — only the existing side is collapsed to (average, mass).
    //
    //   projected = (originalAvg * existingMass + Σ(v_i · w_i))
    //             / (existingMass + Σ(w_i))
    //
    // When all existing cells share a weight, mass == cellCount and the
    // result is identical to enumerating each grade. When weights differ, the
    // tooltip-derived mass keeps the result aligned with the school's own
    // weighted-mean math. If weights can't be parsed at all, mass falls back
    // to cellCount which still produces a sensible projection between
    // originalAvg and the new grades — never below originalAvg for a worse
    // grade or above it for a better one.
    if (!Array.isArray(virtualGrades) || virtualGrades.length === 0) return null;
    if (!Number.isFinite(originalAvg)) return null;

    const mass = Math.max(0.1, Number.isFinite(existingMass) ? existingMass : 0);
    return calcWeightedAvg([
      { value: originalAvg, weight: mass },
      ...virtualGrades,
    ]);
  }

  function resolveExistingMassForRow(row) {
    const info = readExistingGradeMass(row);
    // No grade cells found at all -> treat the EduPage average as a single
    // weight-1 anchor so the projection is just the mean of original + new.
    if (info.cellCount === 0) {
      return { mass: 1, ...info };
    }
    return { mass: info.totalWeight, ...info };
  }

  function readExistingMassOverride(predmetid) {
    const key = String(predmetid || "").trim();
    if (!key) return null;
    const value = Number(existingMassOverrides[key]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function saveExistingMassOverride(predmetid, mass) {
    const key = String(predmetid || "").trim();
    if (!key) return Promise.resolve();
    const normalized = Number(mass);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      delete existingMassOverrides[key];
    } else {
      existingMassOverrides[key] = normalized;
    }
    return storageSet({ [EXISTING_MASS_OVERRIDES_KEY]: existingMassOverrides });
  }

  function dispatchSyntheticClick(element) {
    if (!element) return false;
    try {
      if (typeof element.click === "function") {
        element.click();
      }
      // Also dispatch a bubbling MouseEvent because EduPage often attaches
      // its toggle handlers via jQuery delegation higher up the tree —
      // direct .click() doesn't always traverse the delegation chain.
      element.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function findExpandToggleCandidates(predmetRow) {
    const candidates = new Set();
    if (!predmetRow || typeof predmetRow.querySelectorAll !== "function") {
      return [];
    }

    predmetRow.querySelectorAll("td, span, a, button, img, div, i").forEach((el) => {
      const text = (el.textContent || "").trim();
      const cls = String(el.className || "").toLowerCase();
      const aria = el.getAttribute?.("aria-expanded");

      if (text === "+" || text === "−" || text === "-") candidates.add(el);
      if (/expand|collap|toggle|plus|minus|znamky-expand/.test(cls)) candidates.add(el);
      if (aria === "false") candidates.add(el);
    });

    // EduPage often makes the subject's first cell (or the row itself)
    // clickable to toggle expansion, with no explicit "+" element. Add both
    // as last-resort candidates so we still hit the right handler when the
    // toggle is a delegated row-level click.
    const firstCell = predmetRow.querySelector("td, th");
    if (firstCell) candidates.add(firstCell);
    candidates.add(predmetRow);

    return Array.from(candidates);
  }

  function detectExistingMass(predmetRow, predmetid, { timeoutMs = 700 } = {}) {
    // Already cached from an earlier popover open on this page? Return it.
    if (predmetid && autoDetectedMassCache.has(predmetid)) {
      return Promise.resolve(autoDetectedMassCache.get(predmetid));
    }

    const initial = readExistingGradeMass(predmetRow);
    if (initial.weightsParsed > 0) {
      if (predmetid) autoDetectedMassCache.set(predmetid, initial);
      return Promise.resolve(initial);
    }

    // Need to expand the subject to surface the category sub-rows. Watch the
    // containing tbody for newly-added rows and re-read mass whenever the DOM
    // changes; resolve as soon as weights become available, or after a short
    // timeout if nothing usable appears.
    return new Promise((resolve) => {
      const tbody = (typeof predmetRow.closest === "function" ? predmetRow.closest("tbody") : null)
        || predmetRow.parentElement;
      let resolved = false;
      let observer = null;
      let timer = null;

      const finish = (info) => {
        if (resolved) return;
        resolved = true;
        if (observer) {
          try { observer.disconnect(); } catch (error) { /* ignore */ }
        }
        if (timer) clearTimeout(timer);
        if (predmetid) autoDetectedMassCache.set(predmetid, info);
        resolve(info);
      };

      if (tbody && typeof MutationObserver === "function") {
        observer = new MutationObserver(() => {
          const info = readExistingGradeMass(predmetRow);
          if (info.weightsParsed > 0) finish(info);
        });
        try {
          observer.observe(tbody, { childList: true, subtree: true });
        } catch (error) {
          observer = null;
        }
      }

      const toggles = findExpandToggleCandidates(predmetRow);
      for (const toggle of toggles) {
        if (dispatchSyntheticClick(toggle)) {
          if (predmetid) autoExpandedSubjects.add(predmetid);
        }
      }

      timer = setTimeout(() => finish(readExistingGradeMass(predmetRow)), timeoutMs);
    });
  }

  function getEffectiveExistingMass(row, predmetid) {
    const override = readExistingMassOverride(predmetid);
    if (override !== null) return { mass: override, source: "override" };
    if (predmetid && autoDetectedMassCache.has(predmetid)) {
      const cached = autoDetectedMassCache.get(predmetid);
      if (cached.weightsParsed > 0) {
        return { mass: cached.totalWeight, source: "auto-detected", info: cached };
      }
    }
    const live = resolveExistingMassForRow(row);
    return { mass: live.mass, source: live.weightsParsed > 0 ? "auto-detected" : "count-fallback", info: live };
  }

  function getProjectedAverage(row, predmetid, originalAvg) {
    const virtual = virtualGradesData[predmetid];
    if (!virtual || virtual.length === 0) return null;
    const { mass } = getEffectiveExistingMass(row, predmetid);
    return projectAverageWithVirtualGrades(originalAvg, mass, virtual);
  }

  function saveVirtualGrades() {
    return storageSet({ [VIRTUAL_GRADES_KEY]: virtualGradesData });
  }

  function closeVirtualPopover() {
    if (activeVirtualPopover) {
      activeVirtualPopover.remove();
      activeVirtualPopover = null;
    }
  }

  function handleDocumentClickForPopover(event) {
    if (!activeVirtualPopover) return;
    if (activeVirtualPopover.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest(".ee-vg-btn")) return;
    closeVirtualPopover();
  }

  function updateVirtualDisplay(row, predmetid, scale, originalAvg) {
    const priemerCell = row.querySelector(".znPriemerCell");
    if (!priemerCell) return;

    priemerCell.querySelector(".ee-vg-projected")?.remove();

    const btn = priemerCell.querySelector(".ee-vg-btn");
    const hasVirtual = (virtualGradesData[predmetid] || []).length > 0;
    if (btn) btn.classList.toggle("ee-vg-btn-active", hasVirtual);

    if (!hasVirtual) return;

    const projected = getProjectedAverage(row, predmetid, originalAvg);
    if (!Number.isFinite(projected)) return;

    const indicator = document.createElement("div");
    indicator.className = "ee-vg-projected";

    const arrow = document.createElement("span");
    arrow.className = "ee-vg-arrow";
    arrow.textContent = "→";

    const projValue = document.createElement("span");
    projValue.className = "ee-avg-value";
    projValue.style.setProperty("--avg-color", gradeColor(projected, scale));
    projValue.textContent = formatAverageDisplay(projected, scale);

    indicator.appendChild(arrow);
    indicator.appendChild(projValue);
    priemerCell.appendChild(indicator);
  }

  function buildPopoverContent(popover, row, predmetid, scale, originalAvg) {
    popover.innerHTML = "";

    const header = document.createElement("div");
    header.className = "ee-vg-popover-header";
    header.textContent = "Virtual Grades";
    popover.appendChild(header);

    const virtual = virtualGradesData[predmetid] || [];

    const list = document.createElement("div");
    list.className = "ee-vg-list";

    if (virtual.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ee-vg-empty";
      empty.textContent = "No virtual grades added yet.";
      list.appendChild(empty);
    } else {
      virtual.forEach((grade, i) => {
        const item = document.createElement("div");
        item.className = "ee-vg-item";

        const lbl = document.createElement("span");
        lbl.className = "ee-vg-item-label";
        lbl.textContent = `${formatAverageDisplay(grade.value, scale)} (weight: ${grade.weight})`;

        const removeBtn = document.createElement("button");
        removeBtn.className = "ee-vg-remove";
        removeBtn.textContent = "×";
        removeBtn.title = "Remove";
        removeBtn.addEventListener("click", async () => {
          const arr = virtualGradesData[predmetid] || [];
          arr.splice(i, 1);
          if (arr.length === 0) delete virtualGradesData[predmetid];
          await saveVirtualGrades();
          updateVirtualDisplay(row, predmetid, scale, originalAvg);
          updateResetButtonState(row.closest("table.znamkyTable"));
          buildPopoverContent(popover, row, predmetid, scale, originalAvg);
        });

        item.appendChild(lbl);
        item.appendChild(removeBtn);
        list.appendChild(item);
      });
    }

    popover.appendChild(list);

    if (virtual.length > 0) {
      const projected = getProjectedAverage(row, predmetid, originalAvg);
      if (Number.isFinite(projected)) {
        const projRow = document.createElement("div");
        projRow.className = "ee-vg-projection-row";

        const projLabel = document.createElement("span");
        projLabel.className = "ee-vg-proj-label";
        projLabel.textContent = "Projected:";

        const projBadge = createBadgeElement(projected, formatAverageDisplay(projected, scale), { scale });

        projRow.appendChild(projLabel);
        if (projBadge) projRow.appendChild(projBadge);
        popover.appendChild(projRow);

        // Existing weight mass — detected by briefly expanding the subject
        // row when the popover opens, or filled in manually if detection
        // can't see the per-category weights for some reason.
        const override = readExistingMassOverride(predmetid);
        const cached = autoDetectedMassCache.get(predmetid);
        const liveInfo = readExistingGradeMass(row);
        // The detected mass for display is the cached one when available
        // (it's authoritative — captured while sub-rows were in the DOM),
        // otherwise whatever the live DOM currently shows.
        const usableInfo = (cached && cached.weightsParsed > 0) ? cached : liveInfo;
        const detectedMass = usableInfo.totalWeight;
        const detectedCellCount = usableInfo.cellCount;
        const effectiveMass = override !== null ? override : detectedMass;
        const detectionSucceeded = usableInfo.weightsParsed > 0;

        const massBox = document.createElement("div");
        massBox.className = "ee-vg-mass-box";

        const massLabel = document.createElement("span");
        massLabel.className = "ee-vg-mass-label";
        massLabel.textContent = detectedCellCount > 0
          ? `Existing weight (${detectedCellCount} grades):`
          : "Existing weight:";
        massBox.appendChild(massLabel);

        const massInput = document.createElement("input");
        massInput.type = "number";
        massInput.step = "0.5";
        massInput.min = "0.5";
        massInput.className = "ee-vg-input ee-vg-mass-input";
        massInput.value = String(Number.isInteger(effectiveMass) ? effectiveMass : Number(effectiveMass.toFixed(2)));
        massInput.title = override !== null
          ? `Manual override (auto-detected: ${detectedMass}). Clear or set to ${detectedMass} to use auto-detection.`
          : detectionSucceeded
            ? "Auto-detected from EduPage's category sub-rows (Váha udalosti). Edit if it's wrong."
            : "Auto-detection still running, or couldn't find weight info on this skin. Type the correct weight to override.";
        massInput.addEventListener("change", async () => {
          const typed = Number.parseFloat(massInput.value);
          const shouldClear = !Number.isFinite(typed) || typed <= 0 || typed === detectedMass;
          await saveExistingMassOverride(predmetid, shouldClear ? null : typed);
          updateVirtualDisplay(row, predmetid, scale, originalAvg);
          buildPopoverContent(popover, row, predmetid, scale, originalAvg);
        });
        massInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") massInput.blur();
        });
        massBox.appendChild(massInput);

        if (override !== null) {
          const resetBtn = document.createElement("button");
          resetBtn.type = "button";
          resetBtn.className = "ee-vg-mass-reset";
          resetBtn.textContent = `auto: ${detectedMass}`;
          resetBtn.title = "Clear the manual override and use the auto-detected value.";
          resetBtn.addEventListener("click", async () => {
            await saveExistingMassOverride(predmetid, null);
            updateVirtualDisplay(row, predmetid, scale, originalAvg);
            buildPopoverContent(popover, row, predmetid, scale, originalAvg);
          });
          massBox.appendChild(resetBtn);
        }

        popover.appendChild(massBox);

        // Compact diagnostic so the source of the mass is visible at a glance.
        const hint = document.createElement("div");
        hint.className = "ee-vg-mass-hint";
        if (override !== null) {
          hint.textContent = "Using manual override.";
        } else if (detectionSucceeded) {
          hint.textContent = `Auto-detected (${detectedCellCount} grades, mass ${detectedMass}).`;
        } else if (detectedCellCount > 0) {
          hint.textContent = "Detecting weights… if the row didn't expand automatically, expand it with the \"+\" toggle.";
        } else {
          hint.textContent = "No grade cells found yet — try expanding the subject row.";
        }
        popover.appendChild(hint);
      }
    }

    const form = document.createElement("div");
    form.className = "ee-vg-form";

    const gradeInput = document.createElement("input");
    gradeInput.type = "number";
    gradeInput.step = "0.1";
    gradeInput.min = scale === "percent" ? "0" : "1";
    gradeInput.max = scale === "percent" ? "100" : "5";
    gradeInput.placeholder = scale === "percent" ? "Grade %" : "Grade (1–5)";
    gradeInput.className = "ee-vg-input";

    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.step = "0.1";
    weightInput.min = "0.1";
    weightInput.value = "1";
    weightInput.placeholder = "Wt";
    weightInput.className = "ee-vg-input ee-vg-weight-input";

    const addBtn = document.createElement("button");
    addBtn.className = "ee-vg-add-btn";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", async () => {
      const value = Number.parseFloat(gradeInput.value);
      const weight = Math.max(0.1, Number.parseFloat(weightInput.value) || 1);
      if (!Number.isFinite(value)) return;
      if (!virtualGradesData[predmetid]) virtualGradesData[predmetid] = [];
      virtualGradesData[predmetid].push({ value, weight });
      await saveVirtualGrades();
      gradeInput.value = "";
      weightInput.value = "1";
      updateVirtualDisplay(row, predmetid, scale, originalAvg);
      updateResetButtonState(row.closest("table.znamkyTable"));
      buildPopoverContent(popover, row, predmetid, scale, originalAvg);
      gradeInput.focus();
    });

    gradeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addBtn.click();
    });

    form.appendChild(gradeInput);
    form.appendChild(weightInput);
    form.appendChild(addBtn);
    popover.appendChild(form);
  }

  function openVirtualPopover(triggerBtn, row, predmetid, scale, originalAvg) {
    const popover = document.createElement("div");
    popover.className = "ee-vg-popover";
    popover.dataset.eeVgFor = predmetid;
    // Render once immediately with whatever mass info is available right now,
    // then run async detection (which may briefly expand the row to surface
    // category sub-rows) and re-render once the real weights are known.
    buildPopoverContent(popover, row, predmetid, scale, originalAvg);
    detectExistingMass(row, predmetid).then(() => {
      if (activeVirtualPopover !== popover) return;
      buildPopoverContent(popover, row, predmetid, scale, originalAvg);
      updateVirtualDisplay(row, predmetid, scale, originalAvg);
    });
    document.body.appendChild(popover);
    activeVirtualPopover = popover;

    const btnRect = triggerBtn.getBoundingClientRect();
    const popWidth = popover.offsetWidth || 210;
    let left = btnRect.left;
    const top = btnRect.bottom + 4;
    if (left + popWidth > window.innerWidth - 8) {
      left = Math.max(4, window.innerWidth - popWidth - 8);
    }
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    popover.querySelector(".ee-vg-input")?.focus();
  }

  function updateResetButtonState(table) {
    const btn = table?.querySelector("thead .ee-vg-reset-btn");
    if (!btn) return;
    btn.disabled = Object.keys(virtualGradesData).length === 0
      && Object.keys(existingMassOverrides).length === 0;
  }

  function ensureResetVirtualGradesButton(table) {
    const headers = Array.from(table.querySelectorAll("thead th"));
    const priemerHeader = headers.find((th) => th.textContent.trim().toLowerCase().startsWith("priemer"));
    if (!priemerHeader) return;
    if (priemerHeader.querySelector(".ee-vg-reset-btn")) {
      updateResetButtonState(table);
      return;
    }

    const btn = document.createElement("button");
    btn.className = "ee-vg-reset-btn";
    btn.textContent = "↺";
    btn.title = "Reset all virtual grades";
    btn.setAttribute("aria-label", "Reset all virtual grades");
    btn.disabled = Object.keys(virtualGradesData).length === 0
      && Object.keys(existingMassOverrides).length === 0;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      virtualGradesData = {};
      existingMassOverrides = {};
      autoDetectedMassCache.clear();
      autoExpandedSubjects.clear();
      await saveVirtualGrades();
      await storageSet({ [EXISTING_MASS_OVERRIDES_KEY]: {} });
      closeVirtualPopover();
      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const predmetid = String(row.dataset?.predmetid || "").trim();
        if (!predmetid) return;
        const priemerCell = row.querySelector(".znPriemerCell");
        if (!priemerCell) return;
        const rawText = priemerCell.dataset.eeOriginalAverage || readAverageText(priemerCell);
        const avg = parseAverage(rawText);
        if (!Number.isFinite(avg)) return;
        const scale = detectAverageScale(rawText, avg) || "grade";
        updateVirtualDisplay(row, predmetid, scale, avg);
      });
      btn.disabled = true;
    });

    priemerHeader.appendChild(btn);
  }

  function ensureVirtualGradeButtons(table) {
    Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
      const predmetid = String(row.dataset?.predmetid || "").trim();
      if (!predmetid) return;

      const priemerCell = row.querySelector(".znPriemerCell");
      if (!priemerCell) return;

      const rawText = priemerCell.dataset.eeOriginalAverage || readAverageText(priemerCell);
      const avg = parseAverage(rawText);
      if (!Number.isFinite(avg)) return;
      const scale = detectAverageScale(rawText, avg) || "grade";

      if (!priemerCell.querySelector(".ee-vg-btn")) {
        const btn = document.createElement("button");
        btn.className = "ee-vg-btn";
        btn.textContent = "+";
        btn.title = "Virtual grade calculator";
        btn.setAttribute("aria-label", "Open virtual grade calculator");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (activeVirtualPopover?.dataset.eeVgFor === predmetid) {
            closeVirtualPopover();
            return;
          }
          closeVirtualPopover();
          openVirtualPopover(btn, row, predmetid, scale, avg);
        });

        priemerCell.appendChild(btn);
      }

      updateVirtualDisplay(row, predmetid, scale, avg);
    });
    ensureResetVirtualGradesButton(table);
  }

  function readAverageText(priemerCell) {
    if (!priemerCell) return "";
    if (priemerCell.dataset.eeOriginalAverage) {
      return priemerCell.dataset.eeOriginalAverage;
    }

    const link = priemerCell.querySelector("a");
    return (link ? link.textContent : priemerCell.textContent).trim();
  }

  function enhanceAverageCell(row) {
    const priemerCell = row.querySelector(".znPriemerCell");
    if (!priemerCell) return null;

    const rawText = readAverageText(priemerCell);
    const avg = parseAverage(rawText);
    const scale = detectAverageScale(rawText, avg);
    if (Number.isNaN(avg)) return null;
    if (priemerCell.querySelector(".ee-avg-badge")) {
      return { avg, displayText: rawText, scale };
    }

    priemerCell.dataset.eeOriginalAverage = rawText;
    const badge = createBadgeElement(avg, rawText, { scale });
    if (!badge) return { avg, displayText: rawText, scale };

    const link = priemerCell.querySelector("a");
    if (link) {
      link.textContent = "";
      link.appendChild(badge);
    } else {
      priemerCell.textContent = "";
      priemerCell.appendChild(badge);
    }

    return { avg, displayText: rawText, scale };
  }

  function restoreAverageCells(table) {
    table.querySelectorAll(".znPriemerCell").forEach((priemerCell) => {
      const originalText = priemerCell.dataset.eeOriginalAverage;
      if (!originalText || !priemerCell.querySelector(".ee-avg-badge")) return;

      const link = priemerCell.querySelector("a");
      if (link) {
        link.textContent = originalText;
      } else {
        priemerCell.textContent = originalText;
      }
      delete priemerCell.dataset.eeOriginalAverage;
    });

    closeVirtualPopover();
    table.querySelector("tr.ee-overall-row")?.remove();
    table.removeAttribute(AVERAGE_RENDER_SIGNATURE_ATTR);
  }

  function collectAverages(table) {
    return Array.from(table.querySelectorAll("tr.predmetRow"))
      .map((row) => enhanceAverageCell(row))
      .filter(Boolean);
  }

  function buildAverageRenderSignature(averages) {
    return averages
      .map(({ avg, displayText, scale }) => `${scale || "grade"}:${displayText}:${avg.toFixed(2)}`)
      .join("|");
  }

  function buildSummaryRenderSignature(
    averageSignature,
    attendanceColumnsEnabled,
    attendanceBreakdown,
    predictedAttendanceSummary = null,
    attendanceState = "ready",
    predictionState = "ready",
  ) {
    if (!attendanceColumnsEnabled) {
      return `${averageSignature}|attendance:off`;
    }

    if (!attendanceBreakdown) {
      return `${averageSignature}|attendance:${attendanceState}|prediction:${predictionState}`;
    }

    const summary = attendanceBreakdown.summary || attendanceBreakdown;
    const unmatched = attendanceBreakdown.unmatched || { absent: 0, total: 0 };
    const predicted = predictedAttendanceSummary || { absent: 0, total: 0 };
    return `${averageSignature}|attendance:${summary.absent}:${summary.total}:${unmatched.absent}:${unmatched.total}|predicted:${predicted.absent}:${predicted.total}|prediction:${predictionState}`;
  }

  function tableColumnCount(table) {
    const headerRow = table.querySelector("thead tr");
    if (headerRow) {
      return Array.from(headerRow.cells).reduce(
        (sum, cell) => sum + (Number.parseInt(cell.colSpan, 10) || 1),
        0,
      );
    }

    return Math.max(5, table.querySelector("tr")?.cells.length || 5);
  }

  function computeSummaryColumnLayout(colCount) {
    const metricColumns = 5;
    const trailingSpan = colCount >= 7 ? 1 : 0;
    const labelSpan = Math.max(1, colCount - metricColumns - trailingSpan);
    return { labelSpan, trailingSpan };
  }

  function ensureSummaryRow(table, averages, renderSignature, {
    attendanceColumns = false,
    attendanceSummary = null,
    attendanceBreakdown = null,
    predictedAttendanceSummary = null,
    attendanceState = "loading",
    predictionState = "loading",
  } = {}) {
    const existing = table.querySelector("tr.ee-overall-row");
    if (existing?.dataset.eeSignature === renderSignature) return;
    if (existing) existing.remove();
    if (averages.length === 0) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const averageScale = averages[0]?.scale || "grade";
    if (averages.some((entry) => (entry.scale || "grade") !== averageScale)) {
      return;
    }

    const colCount = tableColumnCount(table);
    const overallAvg = averages.reduce((sum, entry) => sum + entry.avg, 0) / averages.length;

    const summaryRow = document.createElement("tr");
    summaryRow.className = "ee-overall-row";
    summaryRow.dataset.eeSignature = renderSignature;

    const labelCell = document.createElement("td");
    labelCell.className = "fixedCell";
    labelCell.colSpan = Math.max(1, colCount - 2);

    const label = document.createElement("span");
    label.className = "ee-overall-label";
    label.textContent = t("gradesOverall");

    const meta = document.createElement("span");
    meta.className = "ee-overall-meta";
    meta.textContent = t("gradesSubjectsCount", [String(averages.length)]);

    labelCell.appendChild(label);
    labelCell.appendChild(meta);

    const unmatchedSummary = attendanceBreakdown?.unmatched || null;
    if (unmatchedSummary && (unmatchedSummary.total > 0 || unmatchedSummary.absent > 0)) {
      const note = document.createElement("span");
      note.className = "ee-overall-meta ee-overall-note";
      note.textContent = unmatchedSummary.absent > 0
        ? `+ ${unmatchedSummary.absent}/${unmatchedSummary.total} unmatched lessons`
        : `+ ${unmatchedSummary.total} unmatched lessons`;
      note.title = "Official attendance includes lessons that are not mapped to the current grades rows yet.";
      labelCell.appendChild(note);
    }

    const avgCell = document.createElement("td");
    avgCell.className = "ee-overall-value-cell";
    avgCell.appendChild(createBadgeElement(overallAvg, formatAverageDisplay(overallAvg, averageScale), {
      largeValue: true,
      scale: averageScale,
    }));

    if (!attendanceColumns) {
      labelCell.colSpan = Math.max(1, colCount - 2);
      avgCell.colSpan = 2;
      summaryRow.appendChild(labelCell);
      summaryRow.appendChild(avgCell);
      tbody.appendChild(summaryRow);
      return;
    }

    const summaryTone = attendanceTone(attendanceSummary?.percent);
    const predictedTone = attendanceTone(predictedAttendanceSummary?.percent);
    const { labelSpan, trailingSpan } = computeSummaryColumnLayout(colCount);
    labelCell.colSpan = labelSpan;

    const percentCell = document.createElement("td");
    percentCell.className = "ee-overall-attendance-cell ee-attendance-percent-cell";

    const totalCell = document.createElement("td");
    totalCell.className = "ee-overall-attendance-cell ee-attendance-total-cell";

    const predictedPercentCell = document.createElement("td");
    predictedPercentCell.className = "ee-overall-attendance-cell ee-attendance-predicted-percent-cell";

    const predictedTotalCell = document.createElement("td");
    predictedTotalCell.className = "ee-overall-attendance-cell ee-attendance-predicted-total-cell";

    if (attendanceSummary && Number.isFinite(attendanceSummary.percent)) {
      const summaryTitle = unmatchedSummary && (unmatchedSummary.total > 0 || unmatchedSummary.absent > 0)
        ? `Official current halfyear: ${attendanceSummary.absent}/${attendanceSummary.total} lessons absent in total. ${unmatchedSummary.absent}/${unmatchedSummary.total} additional lessons are not mapped to grades rows yet.`
        : `Official current halfyear: ${attendanceSummary.absent}/${attendanceSummary.total} lessons absent in total.`;
      const percentValue = document.createElement("span");
      percentValue.className = "ee-attendance-stat";
      if (summaryTone?.className) {
        percentValue.classList.add(summaryTone.className);
      } else {
        percentValue.style.color = summaryTone.color;
      }
      percentValue.textContent = formatPercent(attendanceSummary.percent);
      percentCell.appendChild(percentValue);
      percentCell.title = summaryTitle;

      const totalValue = document.createElement("span");
      totalValue.className = "ee-attendance-stat ee-attendance-total";
      totalValue.textContent = `${attendanceSummary.absent}/${attendanceSummary.total}`;
      totalCell.appendChild(totalValue);
      totalCell.title = summaryTitle;
    } else {
      const percentPlaceholder = buildAttendancePlaceholderState(
        attendanceState,
        attendanceState === "loading"
          ? "Current halfyear attendance data is still loading."
          : "Official current-halfyear attendance data is not available yet.",
      );
      const percentEmpty = document.createElement("span");
      percentEmpty.className = percentPlaceholder.className;
      percentEmpty.textContent = percentPlaceholder.text;
      percentCell.appendChild(percentEmpty);
      percentCell.title = percentPlaceholder.title;

      const totalPlaceholder = buildAttendancePlaceholderState(
        attendanceState,
        attendanceState === "loading"
          ? "Current halfyear attendance data is still loading."
          : "Official current-halfyear attendance data is not available yet.",
      );
      const totalEmpty = document.createElement("span");
      totalEmpty.className = totalPlaceholder.className;
      totalEmpty.textContent = totalPlaceholder.text;
      totalCell.appendChild(totalEmpty);
      totalCell.title = totalPlaceholder.title;
    }

    if (predictedAttendanceSummary && Number.isFinite(predictedAttendanceSummary.percent)) {
      const predictedTitle = `If you miss no more lessons this halfyear, the projected absence total is ${predictedAttendanceSummary.absent}/${predictedAttendanceSummary.total}.`;
      const predictedPercentValue = document.createElement("span");
      predictedPercentValue.className = "ee-attendance-stat";
      if (predictedTone?.className) {
        predictedPercentValue.classList.add(predictedTone.className);
      } else if (predictedTone?.color) {
        predictedPercentValue.style.color = predictedTone.color;
      }
      predictedPercentValue.textContent = formatPercent(predictedAttendanceSummary.percent);
      predictedPercentCell.appendChild(predictedPercentValue);
      predictedPercentCell.title = predictedTitle;

      const predictedTotalValue = document.createElement("span");
      predictedTotalValue.className = "ee-attendance-stat ee-attendance-total";
      predictedTotalValue.textContent = `${predictedAttendanceSummary.absent}/${predictedAttendanceSummary.total}`;
      predictedTotalCell.appendChild(predictedTotalValue);
      predictedTotalCell.title = predictedTitle;
    } else {
      const predictedPercentPlaceholder = buildAttendancePlaceholderState(
        predictionState,
        predictionState === "loading"
          ? "Predicted end-of-halfyear attendance is still loading."
          : "Predicted end-of-halfyear attendance is not available yet.",
      );
      const predictedPercentEmpty = document.createElement("span");
      predictedPercentEmpty.className = predictedPercentPlaceholder.className;
      predictedPercentEmpty.textContent = predictedPercentPlaceholder.text;
      predictedPercentCell.appendChild(predictedPercentEmpty);
      predictedPercentCell.title = predictedPercentPlaceholder.title;

      const predictedTotalPlaceholder = buildAttendancePlaceholderState(
        predictionState,
        predictionState === "loading"
          ? "Predicted end-of-halfyear attendance is still loading."
          : "Predicted end-of-halfyear attendance is not available yet.",
      );
      const predictedTotalEmpty = document.createElement("span");
      predictedTotalEmpty.className = predictedTotalPlaceholder.className;
      predictedTotalEmpty.textContent = predictedTotalPlaceholder.text;
      predictedTotalCell.appendChild(predictedTotalEmpty);
      predictedTotalCell.title = predictedTotalPlaceholder.title;
    }

    summaryRow.appendChild(labelCell);
    summaryRow.appendChild(avgCell);
    summaryRow.appendChild(percentCell);
    summaryRow.appendChild(totalCell);
    summaryRow.appendChild(predictedPercentCell);
    summaryRow.appendChild(predictedTotalCell);

    if (trailingSpan > 0) {
      const fillerCell = document.createElement("td");
      fillerCell.colSpan = trailingSpan;
      summaryRow.appendChild(fillerCell);
    }

    tbody.appendChild(summaryRow);
  }

  function extractBalanced(text, startIndex) {
    const opening = text[startIndex];
    const closing = opening === "{" ? "}" : opening === "[" ? "]" : opening === "(" ? ")" : "";
    if (!closing) return null;

    let depth = 0;
    let inString = false;
    let stringQuote = "";
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (character === "\\") {
          escaped = true;
        } else if (character === stringQuote) {
          inString = false;
          stringQuote = "";
        }
        continue;
      }

      if (character === "\"" || character === "'") {
        inString = true;
        stringQuote = character;
        continue;
      }

      if (character === opening) {
        depth += 1;
      } else if (character === closing) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

    return null;
  }

  function extractObjectLiteral(text, marker, searchFrom = 0) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) return null;

    const openBraceIndex = text.indexOf("{", markerIndex + marker.length);
    if (openBraceIndex === -1) return null;

    return extractBalanced(text, openBraceIndex);
  }

  function splitTopLevelArguments(text) {
    const values = [];
    let startIndex = 0;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;
    let inString = false;
    let stringQuote = "";
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (character === "\\") {
          escaped = true;
        } else if (character === stringQuote) {
          inString = false;
          stringQuote = "";
        }
        continue;
      }

      if (character === "\"" || character === "'") {
        inString = true;
        stringQuote = character;
        continue;
      }

      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
      } else if (character === "[") {
        bracketDepth += 1;
      } else if (character === "]") {
        bracketDepth -= 1;
      } else if (character === "(") {
        parenDepth += 1;
      } else if (character === ")") {
        parenDepth -= 1;
      } else if (character === "," && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
        values.push(text.slice(startIndex, index).trim());
        startIndex = index + 1;
      }
    }

    const tail = text.slice(startIndex).trim();
    if (tail) {
      values.push(tail);
    }

    return values;
  }

  function extractCallArguments(text, marker, searchFrom = 0) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) return null;

    const openParenIndex = text.indexOf("(", markerIndex + marker.length);
    if (openParenIndex === -1) return null;

    const balanced = extractBalanced(text, openParenIndex);
    if (!balanced) return null;

    return splitTopLevelArguments(balanced.slice(1, -1));
  }

  function decodeAscJsonDc(payload) {
    const encodedValues = payload[0];
    const library = payload[1];
    const keyCache = [];
    let pointer = 0;

    function decodeValue() {
      const token = encodedValues[pointer++];

      switch (token) {
        case -1: {
          const size = encodedValues[pointer++];
          const array = [];
          for (let index = 0; index < size; index += 1) {
            array.push(decodeValue());
          }
          return array;
        }
        case -2: {
          const size = encodedValues[pointer++];
          const keys = [];
          const object = {};
          for (let index = 0; index < size; index += 1) {
            keys.push(decodeValue());
          }
          keyCache.push(keys);
          for (let index = 0; index < size; index += 1) {
            object[keys[index]] = decodeValue();
          }
          return object;
        }
        case -3:
          return [];
        case -4:
          return [decodeValue()];
        case -5:
          return [decodeValue(), decodeValue()];
        default:
          break;
      }

      if (token < 0) {
        const keys = keyCache[-token - 10];
        const object = {};
        for (let index = 0; index < keys.length; index += 1) {
          object[keys[index]] = decodeValue();
        }
        return object;
      }

      const value = library[token];
      return Array.isArray(value) ? value.slice(0) : value;
    }

    return decodeValue();
  }

  function parseSerializedValue(text) {
    const rawText = String(text || "").trim();
    if (!rawText) return null;

    if (rawText.startsWith("ASC.json_dc")) {
      const openParenIndex = rawText.indexOf("(");
      const balanced = extractBalanced(rawText, openParenIndex);
      if (!balanced) {
        throw new Error("Could not extract ASC.json_dc payload.");
      }
      const decodedPayload = JSON.parse(balanced.slice(1, -1));
      return decodeAscJsonDc(decodedPayload);
    }

    return JSON.parse(rawText);
  }

  function parseSubjectMap(...sources) {
    const map = new Map();

    sources.forEach((source) => {
      Object.entries(source || {}).forEach(([key, value]) => {
        const subjectId = String(key || "").trim();
        if (!subjectId) return;

        const existing = map.get(subjectId) || { id: subjectId, name: "", short: "" };
        const nextValue = {
          id: subjectId,
          name: String(value?.name || existing.name || "").trim(),
          short: String(value?.short || existing.short || "").trim(),
        };

        map.set(subjectId, nextValue);
      });
    });

    return map;
  }

  function parseAttendanceHalfStats(html) {
    const halfStatsText = extractObjectLiteral(html, "\"halfStats\":");
    if (!halfStatsText) return null;

    try {
      return JSON.parse(halfStatsText);
    } catch (error) {
      console.warn("[Edupage Extras] Could not parse attendance halfStats payload.", error);
      return null;
    }
  }

  function parseAttendanceTypeMap(html) {
    const candidateMarkers = [
      "\"ciselnik0\":",
      "\"studentabsent_types\":",
    ];

    for (const marker of candidateMarkers) {
      const rawText = extractObjectLiteral(html, marker);
      if (!rawText) continue;

      try {
        const parsed = JSON.parse(rawText);
        const map = new Map();

        Object.entries(parsed || {}).forEach(([id, value]) => {
          const typeId = String(value?.id || id || "").trim();
          if (!typeId) return;

          map.set(typeId, {
            id: typeId,
            name: String(value?.name || "").trim(),
            short: String(value?.short || "").trim(),
            et: String(value?.et || "").trim(),
          });
        });

        if (map.size > 0) {
          return map;
        }
      } catch (error) {
        console.warn("[Edupage Extras] Could not parse attendance type map.", error);
      }
    }

    return new Map();
  }

  function addAlias(set, value) {
    const normalized = normalizeText(value);
    if (normalized) {
      set.add(normalized);
    }
  }

  function buildNameAliases(...values) {
    const aliases = new Set();

    values.forEach((value) => {
      const raw = String(value || "").trim();
      if (!raw) return;

      addAlias(aliases, raw);

      const withoutParentheses = raw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
      addAlias(aliases, withoutParentheses);

      Array.from(raw.matchAll(/\(([^)]+)\)/g)).forEach((match) => {
        const inner = String(match[1] || "").trim();
        if (inner.length >= 2) {
          addAlias(aliases, inner);
        }
      });

      withoutParentheses.split(/\s+-\s+|\/|\||,/g).forEach((part) => {
        const trimmed = part.trim();
        if (trimmed.length >= 2 && hasUsefulLetters(trimmed)) {
          addAlias(aliases, trimmed);
        }
      });
    });

    return Array.from(aliases);
  }

  function resolveSubjectMeta(subjectToken, subjectMap) {
    const rawId = String(subjectToken || "").trim();
    if (!rawId) return null;

    const subject = subjectMap.get(rawId);
    const displayName = String(
      subject?.name || (/^\d+$/.test(rawId) ? "" : rawId),
    ).trim();
    const shortName = String(subject?.short || "").trim();

    return {
      rawId,
      displayName,
      shortName,
      aliases: buildNameAliases(displayName, shortName, /^\d+$/.test(rawId) ? "" : rawId),
    };
  }

  function isResolvableSubjectToken(subjectToken, subjectMap) {
    const rawId = String(subjectToken || "").trim();
    if (!rawId) return false;
    if (subjectMap?.has(rawId)) return true;
    return /^\d+$/.test(rawId);
  }

  function subjectEntryKey(meta) {
    if (!meta) return "";
    return meta.rawId ? `id:${meta.rawId}` : `name:${normalizeText(meta.displayName)}`;
  }

  function ensureSubjectEntry(entryMap, subjectToken, subjectMap) {
    const meta = resolveSubjectMeta(subjectToken, subjectMap);
    if (!meta) return null;

    const key = subjectEntryKey(meta);
    if (!key) return null;

    let entry = entryMap.get(key);
    if (!entry) {
      entry = {
        key,
        rawId: meta.rawId,
        displayName: meta.displayName || meta.shortName || meta.rawId,
        shortName: meta.shortName || "",
        absent: 0,
        total: 0,
        aliases: new Set(meta.aliases),
      };
      entryMap.set(key, entry);
    } else {
      meta.aliases.forEach((alias) => entry.aliases.add(alias));
      if (!entry.displayName && meta.displayName) {
        entry.displayName = meta.displayName;
      }
      if (!entry.shortName && meta.shortName) {
        entry.shortName = meta.shortName;
      }
    }

    return entry;
  }

  function resolveSecondHalfStartDate(turnoverDate, overrideValue) {
    const nextTurnover = new Date(
      turnoverDate.getFullYear() + 1,
      turnoverDate.getMonth(),
      turnoverDate.getDate(),
    );
    const overrideDate = parseDateOnly(overrideValue);
    if (overrideDate && overrideDate >= turnoverDate && overrideDate < nextTurnover) {
      return overrideDate;
    }
    return new Date(turnoverDate.getFullYear() + 1, 1, 1);
  }

  function resolveSecondHalfEndDate(turnoverDate, secondHalfStart, overrideValue) {
    const nextTurnover = new Date(
      turnoverDate.getFullYear() + 1,
      turnoverDate.getMonth(),
      turnoverDate.getDate(),
    );
    const overrideDate = parseDateOnly(overrideValue);
    if (overrideDate && overrideDate >= secondHalfStart && overrideDate < nextTurnover) {
      return overrideDate;
    }
    return new Date(turnoverDate.getFullYear() + 1, 5, 30);
  }

  function resolveCurrentHalfWindow({
    currentDate,
    yearTurnover,
    selectedYear,
    halves,
    secondHalfOverride,
    secondHalfEndOverride,
  }) {
    const today = parseDateOnly(currentDate) || new Date();
    const todayIso = formatDateISO(today);

    let turnoverDate = parseDateOnly(yearTurnover);
    if (!turnoverDate && Number.isInteger(selectedYear)) {
      turnoverDate = new Date(selectedYear, 8, 1);
    }

    if (!turnoverDate) {
      const fallbackYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
      turnoverDate = new Date(fallbackYear, 8, 1);
    }

    const secondHalfStart = resolveSecondHalfStartDate(turnoverDate, secondHalfOverride);
    const secondHalfEnd = resolveSecondHalfEndDate(turnoverDate, secondHalfStart, secondHalfEndOverride);
    const halfKey = today < secondHalfStart ? "1" : "2";
    const startDate = halfKey === "1" ? turnoverDate : secondHalfStart;
    const halfEndDate = halfKey === "1"
      ? new Date(secondHalfStart.getFullYear(), secondHalfStart.getMonth(), secondHalfStart.getDate() - 1)
      : secondHalfEnd;
    const now = new Date();

    return {
      currentDate: todayIso,
      startDate: formatDateISO(startDate),
      endDate: todayIso,
      halfEndDate: formatDateISO(halfEndDate),
      halfKey,
      halfLabel: halves?.[halfKey] || `${halfKey}. Polrok`,
      nowMinutes: todayIso === formatDateISO(now) ? now.getHours() * 60 + now.getMinutes() : 24 * 60,
    };
  }

  function resolveOfficialHalfSummary(attendanceInfo, halfWindow) {
    const studentId = String(
      attendanceInfo?.payload?.order?.[0]
      || Object.keys(attendanceInfo?.payload?.students || {})[0]
      || "",
    ).trim();

    if (!studentId) return null;

    const rawHalfStats = attendanceInfo?.halfStats?.[studentId];
    const currentHalfStats = rawHalfStats?.[halfWindow?.halfKey];
    if (!currentHalfStats) return null;

    const absent = numberValue(currentHalfStats.absent);
    // Slovak schools compute absence % as absent / (present + absent).
    // Distant lessons (trips, competitions, school activities) are excluded from
    // the denominator — same formula as computeHalfStats in attendance-enhancer.js.
    const total = numberValue(currentHalfStats.present) + absent;

    if (total <= 0 && absent <= 0) return null;

    return {
      absent,
      total,
      percent: total > 0 ? (absent / total) * 100 : Number.NaN,
    };
  }

  function parseAttendancePage(html) {
    const markerIndex = html.indexOf("/dashboard/dochadzka.js#initZiak");
    if (markerIndex === -1) {
      throw new Error("Attendance init payload was not found.");
    }

    const initArgs = extractCallArguments(html, "return f", markerIndex);
    if (!initArgs || initArgs.length < 3) {
      throw new Error("Attendance init payload arguments were not found.");
    }

    const payload = parseSerializedValue(initArgs[2]);
    const ttdbArgs = extractCallArguments(html, "ttdb.fill");
    const ttdb = ttdbArgs?.[0] ? parseSerializedValue(ttdbArgs[0]) : {};

    return {
      payload,
      halfStats: parseAttendanceHalfStats(html),
      absenceTypeMap: parseAttendanceTypeMap(html),
      subjectMap: parseSubjectMap(ttdb?.subjects),
      yearTurnover: payload?.info?.year_turnover || (html.match(/"year_turnover":"(\d{4}-\d{2}-\d{2})"/)?.[1] || null),
      selectedYear: Number.parseInt(html.match(/"selectedYear":(\d{4})/)?.[1] || "", 10) || null,
      halves: payload?.halves || { "1": "1. Polrok", "2": "2. Polrok" },
    };
  }

  function parseTtdayPage(html) {
    const classbookSectionIndex = html.indexOf("DashboardClassbook");
    if (classbookSectionIndex === -1) {
      throw new Error("Classbook section was not found on ttday page.");
    }

    const fillArgs = extractCallArguments(html, "classbook.fill", classbookSectionIndex);
    if (!fillArgs || fillArgs.length < 2) {
      throw new Error("Initial classbook payload was not found.");
    }

    const classbookData = parseSerializedValue(fillArgs[1]);
    const gparamMatch = html
      .slice(Math.max(0, classbookSectionIndex - 300), classbookSectionIndex + 900)
      .match(/gpid=(\d+)&gsh=([^"&]+)/);
    const renderArgs = extractCallArguments(html, "classbook.render", classbookSectionIndex);

    return {
      user: parseSerializedValue(fillArgs[0]),
      classbookData,
      subjectMap: parseSubjectMap(classbookData?.dbi?.subjects),
      renderDate: renderArgs?.[0] ? parseSerializedValue(renderArgs[0]) : formatDateISO(new Date()),
      gpid: gparamMatch?.[1] || "",
      gsh: gparamMatch?.[2] || "",
      yearTurnover: html.match(/"year_turnover":"(\d{4}-\d{2}-\d{2})"/)?.[1] || null,
      selectedYear: Number.parseInt(html.match(/"selectedYear":(\d{4})/)?.[1] || "", 10) || null,
    };
  }

  function parseClassbookDataFromText(text) {
    const fillArgs = extractCallArguments(text, "classbook.fill");
    if (fillArgs?.[1]) {
      try {
        return parseSerializedValue(fillArgs[1]);
      } catch (error) {
        console.warn("[Edupage Extras] Could not parse classbook.fill payload.", error);
      }
    }

    const jsonDcIndex = text.indexOf("ASC.json_dc(");
    if (jsonDcIndex !== -1) {
      try {
        const openParenIndex = text.indexOf("(", jsonDcIndex);
        const balanced = extractBalanced(text, openParenIndex);
        if (balanced) {
          const payload = JSON.parse(balanced.slice(1, -1));
          const decoded = decodeAscJsonDc(payload);
          if (decoded?.dates) {
            return decoded;
          }
        }
      } catch (error) {
        console.warn("[Edupage Extras] Could not decode classbook ASC.json_dc payload.", error);
      }
    }

    const trimmed = text.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 1) {
      try {
        const direct = JSON.parse(trimmed);
        if (direct?.dates) {
          return direct;
        }
      } catch (error) {
        console.warn("[Edupage Extras] Could not parse direct classbook payload.", error);
      }
    }

    const objectMarkerMatches = text.matchAll(/"dates"\s*:/g);
    for (const match of objectMarkerMatches) {
      const markerIndex = match.index || 0;

      for (let index = markerIndex; index >= 0; index -= 1) {
        if (text[index] !== "{") continue;

        const balanced = extractBalanced(text, index);
        if (!balanced || !balanced.includes("\"dates\"")) continue;

        try {
          const candidate = JSON.parse(balanced);
          if (candidate?.dates) {
            return candidate;
          }
        } catch (error) {
          continue;
        }
      }
    }

    return null;
  }

  function mergeClassbookData(baseData, extraData) {
    return {
      ...(baseData || {}),
      ...(extraData || {}),
      dates: {
        ...(baseData?.dates || {}),
        ...(extraData?.dates || {}),
      },
      dbi: {
        ...(baseData?.dbi || {}),
        ...(extraData?.dbi || {}),
        subjects: {
          ...(baseData?.dbi?.subjects || {}),
          ...(extraData?.dbi?.subjects || {}),
        },
      },
    };
  }

  function mergeManyClassbookData(...datasets) {
    return datasets.reduce(
      (merged, dataset) => mergeClassbookData(merged, dataset),
      { dates: {} },
    );
  }

  function inspectClassbookResponseText(text) {
    const source = String(text || "");
    return {
      length: source.length,
      hasClassbookFill: source.includes("classbook.fill"),
      hasJsonDc: source.includes("ASC.json_dc("),
      hasDatesKey: source.includes("\"dates\""),
      startsWith: source.slice(0, 120),
    };
  }

  function lessonDurationUnits(item) {
    const candidates = [item?.period, item?.uniperiod, item?.periodorbreak];

    for (const candidate of candidates) {
      const value = String(candidate || "");
      const rangeMatch = /^(\d+)-(\d+)$/.exec(value);
      if (rangeMatch) {
        const start = Number.parseInt(rangeMatch[1], 10);
        const end = Number.parseInt(rangeMatch[2], 10);
        if (end >= start) {
          return end - start + 1;
        }
      }
      if (/^\d+$/.test(value)) {
        return 1;
      }
    }

    return 1;
  }

  function extractLessonPeriods(item) {
    const candidates = [item?.period, item?.uniperiod, item?.periodorbreak];

    for (const candidate of candidates) {
      const value = String(candidate || "");
      const rangeMatch = /^(\d+)-(\d+)$/.exec(value);
      if (rangeMatch) {
        const start = Number.parseInt(rangeMatch[1], 10);
        const end = Number.parseInt(rangeMatch[2], 10);
        if (Number.isInteger(start) && Number.isInteger(end) && end >= start) {
          return Array.from({ length: end - start + 1 }, (_, index) => start + index);
        }
      }

      const singleMatch = /^(\d+)$/.exec(value);
      if (singleMatch) {
        return [Number.parseInt(singleMatch[1], 10)];
      }
    }

    return [];
  }

  function isDateInRange(dateKey, startDate, endDate) {
    return dateKey >= startDate && dateKey <= endDate;
  }

  function extractLessonSubjectId(item) {
    return String(
      item?.flags?.dp0?.subjectid
      || item?.subjectid
      || item?.header?.find?.((entry) => entry?.item?.subjectid)?.item?.subjectid
      || "",
    ).trim();
  }

  function computeSubjectAbsences(
    attendancePayload,
    absenceTypeMap,
    classbookData,
    subjectMap,
    halfWindow,
    diagnostics = [],
  ) {
    const entryMap = new Map();
    const studentId = attendancePayload?.order?.[0] || Object.keys(attendancePayload?.students || {})[0];
    const dailyRecords = attendancePayload?.students?.[studentId] || {};

    const unresolvedAbsencesByDate = new Map();

    Object.entries(dailyRecords).forEach(([dateKey, dayEntries]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

      const unresolvedPeriods = new Set();
      let hasDirectPeriodMapping = false;

      Object.entries(dayEntries || {}).forEach(([periodKey, record]) => {
        if (periodKey === "ad" || !isMissedLessonRecord(record, absenceTypeMap)) {
          return;
        }

        const directEntry = ensureSubjectEntry(entryMap, record?.subjectid, subjectMap);
        if (directEntry) {
          directEntry.absent += 1;
          hasDirectPeriodMapping = true;
          diagnostics.push({
            date: dateKey,
            source: "period-direct",
            subjectid: directEntry.rawId,
            mapped: true,
            displayName: directEntry.displayName,
            period: /^\d+$/.test(periodKey) ? Number.parseInt(periodKey, 10) : null,
            absentUnits: 1,
            typeId: String(record?.studentabsent_typeid || ""),
          });
          return;
        }

        if (/^\d+$/.test(periodKey)) {
          unresolvedPeriods.add(Number.parseInt(periodKey, 10));
        }

        diagnostics.push({
          date: dateKey,
          source: "period-unresolved",
          subjectid: String(record?.subjectid || ""),
          mapped: false,
          displayName: "",
          period: /^\d+$/.test(periodKey) ? Number.parseInt(periodKey, 10) : null,
          typeId: String(record?.studentabsent_typeid || ""),
        });
      });

      if (unresolvedPeriods.size > 0) {
        unresolvedAbsencesByDate.set(dateKey, { periods: unresolvedPeriods });
        return;
      }

      const allDayRecord = dayEntries?.ad;
      if (hasDirectPeriodMapping || !isMissedLessonRecord(allDayRecord, absenceTypeMap)) {
        return;
      }

      const directAllDayEntry = ensureSubjectEntry(entryMap, allDayRecord?.subjectid, subjectMap);
      if (directAllDayEntry) {
        const duration = Math.max(1, numberValue(allDayRecord?.durationperiods));
        directAllDayEntry.absent += duration;
        diagnostics.push({
          date: dateKey,
          source: "all-day-direct",
          subjectid: directAllDayEntry.rawId,
          mapped: true,
          displayName: directAllDayEntry.displayName,
          absentUnits: duration,
          durationperiods: duration,
          typeId: String(allDayRecord?.studentabsent_typeid || ""),
        });
        return;
      }

      diagnostics.push({
        date: dateKey,
        source: "all-day-unresolved",
        subjectid: String(allDayRecord?.subjectid || ""),
        mapped: false,
        displayName: "",
        durationperiods: Math.max(1, numberValue(allDayRecord?.durationperiods)),
        typeId: String(allDayRecord?.studentabsent_typeid || ""),
      });
      unresolvedAbsencesByDate.set(dateKey, { allDay: true });
    });

    Object.entries(classbookData?.dates || {}).forEach(([dateKey, dateEntry]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

      const unresolvedAbsence = unresolvedAbsencesByDate.get(dateKey);
      if (!unresolvedAbsence) return;

      const plan = Array.isArray(dateEntry?.plan) ? dateEntry.plan : [];
      plan.forEach((item) => {
        if (!shouldCountLessonItem(item, dateKey, halfWindow)) return;

        const entry = ensureSubjectEntry(entryMap, extractLessonSubjectId(item), subjectMap);
        if (!entry) return;

        let absentUnits = 0;
        if (unresolvedAbsence.allDay) {
          absentUnits = lessonDurationUnits(item);
        } else if (unresolvedAbsence.periods instanceof Set) {
          const lessonPeriods = extractLessonPeriods(item);
          absentUnits = lessonPeriods.filter((period) => unresolvedAbsence.periods.has(period)).length;
        }

        if (absentUnits > 0) {
          entry.absent += absentUnits;
          diagnostics.push({
            date: dateKey,
            source: unresolvedAbsence.allDay ? "lesson-from-all-day" : "lesson-from-periods",
            subjectid: entry.rawId,
            mapped: true,
            displayName: entry.displayName,
            periods: extractLessonPeriods(item),
            absentUnits,
          });
        }
      });
    });

    return entryMap;
  }

  function shouldCountLessonItem(item, dateKey, halfWindow) {
    if (item?.type !== "lesson") return false;
    if (!extractLessonSubjectId(item)) return false;
    if (item?.flags?.dp0?.cancelled || item?.cancelled) return false;

    if (dateKey === halfWindow.currentDate) {
      const startMinutes = timeToMinutes(item?.starttime || item?.flags?.dp0?.starttime);
      if (Number.isFinite(startMinutes) && startMinutes > halfWindow.nowMinutes) {
        return false;
      }
    }

    return true;
  }

  function computeSubjectTotals(classbookData, subjectMap, halfWindow) {
    const entryMap = new Map();

    Object.entries(classbookData?.dates || {}).forEach(([dateKey, dateEntry]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

      const plan = Array.isArray(dateEntry?.plan) ? dateEntry.plan : [];
      plan.forEach((item) => {
        if (!shouldCountLessonItem(item, dateKey, halfWindow)) return;

        const entry = ensureSubjectEntry(entryMap, extractLessonSubjectId(item), subjectMap);
        if (!entry) return;

        entry.total += lessonDurationUnits(item);
      });
    });

    return entryMap;
  }

  function weekdayIndexFromISO(dateKey) {
    const date = parseDateOnly(dateKey);
    return date ? date.getDay() : -1;
  }

  function computeProjectedSubjectTotals(classbookData, subjectMap, halfWindow) {
    const entryMap = new Map();
    const observedWeekdayCounts = new Map();
    const remainingWeekdayCounts = new Map();
    const currentDate = String(halfWindow?.currentDate || "");
    const projectionEndDate = String(halfWindow?.halfEndDate || halfWindow?.endDate || "");

    Object.entries(classbookData?.dates || {}).forEach(([dateKey, dateEntry]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;
      if (dateKey >= currentDate) return;

      const weekday = weekdayIndexFromISO(dateKey);
      if (weekday < 1 || weekday > 5) return;

      const plan = Array.isArray(dateEntry?.plan) ? dateEntry.plan : [];
      const countedItems = plan.filter((item) => shouldCountLessonItem(item, dateKey, halfWindow));
      if (countedItems.length === 0) return;

      observedWeekdayCounts.set(weekday, numberValue(observedWeekdayCounts.get(weekday)) + 1);

      countedItems.forEach((item) => {
        const entry = ensureSubjectEntry(entryMap, extractLessonSubjectId(item), subjectMap);
        if (!entry) return;

        if (!entry.weekdayUnits) {
          entry.weekdayUnits = new Map();
        }

        entry.weekdayUnits.set(
          weekday,
          numberValue(entry.weekdayUnits.get(weekday)) + lessonDurationUnits(item),
        );
      });
    });

    let cursor = addDaysISO(currentDate, 1);
    while (cursor && projectionEndDate && cursor <= projectionEndDate) {
      if (isSchoolDayISO(cursor)) {
        const weekday = weekdayIndexFromISO(cursor);
        if (weekday >= 1 && weekday <= 5) {
          remainingWeekdayCounts.set(weekday, numberValue(remainingWeekdayCounts.get(weekday)) + 1);
        }
      }
      cursor = addDaysISO(cursor, 1);
    }

    const projectedTotals = new Map();
    entryMap.forEach((entry, key) => {
      let projectedRemaining = 0;

      entry.weekdayUnits?.forEach((units, weekday) => {
        const observedDays = numberValue(observedWeekdayCounts.get(weekday));
        const remainingDays = numberValue(remainingWeekdayCounts.get(weekday));
        if (observedDays <= 0 || remainingDays <= 0) return;
        projectedRemaining += (units / observedDays) * remainingDays;
      });

      projectedTotals.set(key, Math.max(0, Math.round(projectedRemaining)));
    });

    return projectedTotals;
  }

  function finalizeSubjectStats(absentEntries, totalEntries, projectedTotals = null) {
    const combined = new Map();

    [absentEntries, totalEntries].forEach((sourceMap) => {
      sourceMap.forEach((entry, key) => {
        const existing = combined.get(key) || {
          key,
          rawId: entry.rawId,
          displayName: entry.displayName,
          shortName: entry.shortName,
          absent: 0,
          total: 0,
          aliases: new Set(),
        };

        existing.absent += numberValue(entry.absent);
        existing.total += numberValue(entry.total);
        entry.aliases.forEach((alias) => existing.aliases.add(alias));

        if (!existing.displayName && entry.displayName) {
          existing.displayName = entry.displayName;
        }
        if (!existing.shortName && entry.shortName) {
          existing.shortName = entry.shortName;
        }

        combined.set(key, existing);
      });
    });

    return Array.from(combined.values())
      .filter((entry) => entry.total > 0 || entry.absent > 0)
      .map((entry) => ({
        key: entry.key,
        rawId: entry.rawId,
        displayName: entry.displayName,
        shortName: entry.shortName,
        absent: entry.absent,
        total: entry.total,
        predictedTotal: entry.total + Math.max(0, numberValue(projectedTotals?.get?.(entry.key))),
        percent: entry.total > 0 ? (entry.absent / entry.total) * 100 : Number.NaN,
        predictedPercent: (entry.total + Math.max(0, numberValue(projectedTotals?.get?.(entry.key)))) > 0
          ? (entry.absent / (entry.total + Math.max(0, numberValue(projectedTotals?.get?.(entry.key))))) * 100
          : Number.NaN,
        aliases: Array.from(entry.aliases),
      }))
      .sort((left, right) => {
        const leftName = normalizeText(left.displayName || left.shortName || left.rawId);
        const rightName = normalizeText(right.displayName || right.shortName || right.rawId);
        return leftName.localeCompare(rightName);
      });
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "-";

    const formatter = new Intl.NumberFormat(document.documentElement.lang || navigator.language || "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatter.format(value)} %`;
  }

  function attendanceTone(percent) {
    if (!Number.isFinite(percent) || percent <= 5) {
      return {
        background: "rgba(46, 125, 50, 0.12)",
        color: "var(--ee-accent, #2e7d32)",
        className: "ee-attendance-tone-good",
      };
    }
    if (percent <= 15) {
      return {
        background: "rgba(245, 127, 23, 0.12)",
        color: "var(--ee-warning, #f57f17)",
        className: "ee-attendance-tone-warn",
      };
    }
    return {
      background: "rgba(198, 40, 40, 0.12)",
      color: "var(--ee-danger, #c62828)",
      className: "ee-attendance-tone-danger",
    };
  }

  function findSubjectCell(row) {
    return row.querySelector("td.fixedCell")
      || Array.from(row.cells).find((cell) => !cell.classList.contains("znPriemerCell"))
      || row.cells[0]
      || null;
  }

  function insertCellAfter(referenceCell, cell) {
    if (!referenceCell?.parentElement) return cell;

    const parent = referenceCell.parentElement;
    const nextSibling = referenceCell.nextElementSibling;
    parent.insertBefore(cell, nextSibling || null);
    return cell;
  }

  function findAverageHeaderCell(headerRow) {
    if (!headerRow) return null;

    const exactMatch = Array.from(headerRow.cells).find(
      (cell) => normalizeText(cell.textContent) === "priemer",
    );
    if (exactMatch) return exactMatch;

    return headerRow.cells[headerRow.cells.length - 2]
      || headerRow.cells[headerRow.cells.length - 1]
      || null;
  }

  function ensureAttendanceHeaderCell(headerRow, className, text, title, afterCell) {
    let cell = headerRow.querySelector(`.${className}`);
    if (!cell) {
      cell = document.createElement("th");
      cell.className = `ee-attendance-header ${className}`;
      cell.addEventListener("click", (e) => e.stopPropagation());
    } else {
      cell.classList.add("ee-attendance-header", className);
    }

    if (cell.parentElement !== headerRow) {
      cell.remove();
      insertCellAfter(afterCell, cell);
    } else if (afterCell && cell.previousElementSibling !== afterCell) {
      cell.remove();
      insertCellAfter(afterCell, cell);
    }

    cell.textContent = text;
    cell.title = title;
    return cell;
  }

  function syncHeaderCellLayout(cell, referenceCell) {
    if (!(cell instanceof HTMLTableCellElement) || !(referenceCell instanceof HTMLTableCellElement)) {
      return;
    }

    const existingWidth = cell.style.width;
    const existingMinWidth = cell.style.minWidth;
    const existingMaxWidth = cell.style.maxWidth;
    const existingTextAlign = cell.style.textAlign;
    const existingWhiteSpace = cell.style.whiteSpace;
    cell.style.cssText = referenceCell.style.cssText;
    cell.style.width = existingWidth;
    cell.style.minWidth = existingMinWidth;
    cell.style.maxWidth = existingMaxWidth;
    cell.style.textAlign = existingTextAlign || "center";
    cell.style.whiteSpace = existingWhiteSpace || "nowrap";
  }

  function syncAttendanceHeaderLayout(table) {
    const headerRow = table?.querySelector?.("thead tr");
    if (!headerRow) return;

    const averageHeaderCell = findAverageHeaderCell(headerRow);
    const notesHeader = Array.from(headerRow.cells).find((cell) =>
      !cell.classList.contains("ee-attendance-header")
      && normalizeText(cell.textContent) === "poznamky",
    );
    const referenceCell = averageHeaderCell || notesHeader || headerRow.cells[0] || null;
    if (!(referenceCell instanceof HTMLTableCellElement)) return;

    [
      ".ee-attendance-percent-header",
      ".ee-attendance-total-header",
      ".ee-attendance-predicted-percent-header",
      ".ee-attendance-predicted-total-header",
    ].forEach((selector) => {
      const headerCell = headerRow.querySelector(selector);
      if (headerCell instanceof HTMLTableCellElement) {
        syncHeaderCellLayout(headerCell, referenceCell);
      }
    });
  }

  function ensureAttendanceDataCell(row, className, afterCell) {
    let cell = row.querySelector(`.${className}`);
    if (!cell) {
      cell = document.createElement("td");
      cell.className = `ee-attendance-cell ${className}`;
      cell.addEventListener("click", (e) => e.stopPropagation());
    } else {
      cell.classList.add("ee-attendance-cell", className);
    }

    if (cell.parentElement !== row) {
      cell.remove();
      insertCellAfter(afterCell, cell);
    } else if (afterCell && cell.previousElementSibling !== afterCell) {
      cell.remove();
      insertCellAfter(afterCell, cell);
    }

    return cell;
  }

  function ensureAttendanceColumns(table) {
    table.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());

    const headerRow = table.querySelector("thead tr");
    const averageHeaderCell = findAverageHeaderCell(headerRow);

    if (headerRow && averageHeaderCell) {
      const percentHeader = ensureAttendanceHeaderCell(
        headerRow,
        "ee-attendance-percent-header",
        t("gradesColAbsPercent"),
        "Current halfyear absence percentage per subject.",
        averageHeaderCell,
      );
      ensureAttendanceHeaderCell(
        headerRow,
        "ee-attendance-total-header",
        t("gradesColAbsTotal"),
        "Current halfyear absent lessons / lessons held so far per subject.",
        percentHeader,
      );
      const predictedPercentHeader = ensureAttendanceHeaderCell(
        headerRow,
        "ee-attendance-predicted-percent-header",
        t("gradesColPredAbsPercent"),
        "Projected end-of-halfyear absence percentage if you miss no more lessons.",
        headerRow.querySelector(".ee-attendance-total-header"),
      );
      ensureAttendanceHeaderCell(
        headerRow,
        "ee-attendance-predicted-total-header",
        t("gradesColPredAbsTotal"),
        "Projected absent lessons / projected total lessons by the end of the current halfyear if you miss no more lessons.",
        predictedPercentHeader,
      );
      syncAttendanceHeaderLayout(table);
    }

    Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
      const averageCell = row.querySelector(".znPriemerCell");
      if (!averageCell) return;

      const percentCell = ensureAttendanceDataCell(
        row,
        "ee-attendance-percent-cell",
        averageCell,
      );
      ensureAttendanceDataCell(
        row,
        "ee-attendance-total-cell",
        percentCell,
      );
      const predictedPercentCell = ensureAttendanceDataCell(
        row,
        "ee-attendance-predicted-percent-cell",
        row.querySelector(".ee-attendance-total-cell"),
      );
      ensureAttendanceDataCell(
        row,
        "ee-attendance-predicted-total-cell",
        predictedPercentCell,
      );
    });
  }

  function clearSubjectAttendance(table) {
    table.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
    table.querySelectorAll(".ee-attendance-header").forEach((element) => element.remove());
    table.querySelectorAll("tr.predmetRow .ee-attendance-cell").forEach((element) => element.remove());
    table.querySelectorAll("tr.predmetRow").forEach((row) => {
      delete row.dataset.eeAttendanceSignature;
    });
    table.removeAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR);
  }

  function buildAttendancePlaceholderState(mode = "unavailable", title = "") {
    const loading = mode === "loading";
    return {
      text: loading ? "..." : "-",
      title: title || (loading
        ? "Attendance data is still loading."
        : "Attendance data is not available yet."),
      empty: true,
      loading,
      className: loading ? "ee-attendance-empty ee-attendance-loading" : "ee-attendance-empty",
    };
  }

  function shouldRenderPredictedAttendance({ predictionState = "ready", predictedPercent, predictedTotal } = {}) {
    if (predictionState !== "ready") {
      return false;
    }
    return Number.isFinite(predictedPercent) && numberValue(predictedTotal) > 0;
  }

  function setAttendanceCellValue(cell, text, { tone = null, title = "", empty = false, loading = false } = {}) {
    cell.textContent = "";

    const value = document.createElement("span");
    value.className = empty ? "ee-attendance-empty" : "ee-attendance-stat";
    if (empty && loading) {
      value.classList.add("ee-attendance-loading");
    }
    if ((cell.classList.contains("ee-attendance-total-cell") || cell.classList.contains("ee-attendance-predicted-total-cell")) && !empty) {
      value.classList.add("ee-attendance-total");
    }
    if (!empty) {
      value.style.color = "";
    }
    if (tone?.className && !empty) {
      value.classList.add(tone.className);
    } else if (tone?.color && !empty) {
      value.style.color = tone.color;
    }
    value.textContent = text;

    cell.appendChild(value);
    if (title) {
      cell.title = title;
    } else {
      cell.removeAttribute("title");
    }
  }

  function populateAttendancePlaceholders(table, title = "Official current-halfyear attendance data is not available yet.", { loading = false } = {}) {
    markInternalMutation();
    ensureAttendanceColumns(table);
    const placeholder = buildAttendancePlaceholderState(loading ? "loading" : "unavailable", title);

    Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
      const percentCell = row.querySelector(".ee-attendance-percent-cell");
      const totalCell = row.querySelector(".ee-attendance-total-cell");
      const predictedPercentCell = row.querySelector(".ee-attendance-predicted-percent-cell");
      const predictedTotalCell = row.querySelector(".ee-attendance-predicted-total-cell");
      if (!percentCell || !totalCell || !predictedPercentCell || !predictedTotalCell) return;

      setAttendanceCellValue(percentCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
      setAttendanceCellValue(totalCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
      setAttendanceCellValue(predictedPercentCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
      setAttendanceCellValue(predictedTotalCell, placeholder.text, { empty: placeholder.empty, title: placeholder.title, loading: placeholder.loading });
      delete row.dataset.eeAttendanceSignature;
    });

    table.removeAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR);
  }

  function readRowSubjectText(row) {
    const subjectCell = findSubjectCell(row);
    if (!subjectCell) return "";

    const directText = Array.from(subjectCell.childNodes || [])
      .filter((node) => node?.nodeType === Node.TEXT_NODE)
      .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
      .map((text) => text.replace(/^[+*•\s-]+/, "").trim())
      .find((text) => hasUsefulLetters(text) && normalizeText(text).length >= 3);
    if (directText) {
      return directText;
    }

    const clone = subjectCell.cloneNode(true);
    clone.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
    const rawText = typeof clone.innerText === "string" ? clone.innerText : clone.textContent;
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const firstLine = (lines[0] || "").replace(/^[+*•\s-]+/, "").trim();
    if (hasUsefulLetters(firstLine) && normalizeText(firstLine).length >= 3) {
      return firstLine;
    }

    const meaningfulLine = lines
      .map((line) => line.replace(/^[+*•\s-]+/, "").trim())
      .find((line) => hasUsefulLetters(line) && normalizeText(line).length >= 3);
    return meaningfulLine || firstLine || lines[0] || "";
  }

  function readPrimaryRowSubjectText(row) {
    const subjectCell = findSubjectCell(row);
    if (!subjectCell) return "";

    const directText = Array.from(subjectCell.childNodes || [])
      .filter((node) => node?.nodeType === Node.TEXT_NODE)
      .map((node) => String(node.textContent || "").replace(/\s+/g, " ").trim())
      .map((text) => text.replace(/^[+*\s-]+/, "").trim())
      .find((text) => hasUsefulLetters(text) && normalizeText(text).length >= 3);
    if (directText) {
      return directText;
    }

    const clone = subjectCell.cloneNode(true);
    clone.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
    const rawText = typeof clone.innerText === "string" ? clone.innerText : clone.textContent;
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const firstLine = (lines[0] || "").replace(/^[+*\s-]+/, "").trim();
    if (hasUsefulLetters(firstLine) && normalizeText(firstLine).length >= 3) {
      return firstLine;
    }

    const meaningfulLine = lines
      .map((line) => line.replace(/^[+*\s-]+/, "").trim())
      .find((line) => hasUsefulLetters(line) && normalizeText(line).length >= 3);
    return meaningfulLine || firstLine || lines[0] || "";
  }

  function readRowSubjectId(row) {
    return String(row?.dataset?.predmetid || "").trim();
  }

  function buildRowAliases(rowText) {
    return new Set(buildNameAliases(rowText));
  }

  function isExactSubjectAliasMatch(rowAliases, entry) {
    return Array.from(entry.aliases || []).some((alias) => alias && rowAliases.has(alias));
  }

  function aggregateMatchedStats(entries) {
    const displayNames = [];
    let absent = 0;
    let total = 0;
    let predictedTotal = 0;

    entries.forEach((entry) => {
      absent += numberValue(entry.absent);
      total += numberValue(entry.total);
      predictedTotal += Math.max(numberValue(entry.total), numberValue(entry.predictedTotal) || numberValue(entry.total));
      if (entry.displayName) {
        displayNames.push(entry.displayName);
      }
    });

    return {
      displayNames,
      absent,
      total,
      predictedTotal,
      percent: total > 0 ? (absent / total) * 100 : Number.NaN,
      predictedPercent: predictedTotal > 0 ? (absent / predictedTotal) * 100 : Number.NaN,
    };
  }

  function projectionEntryMatchesSubject(entry, projection) {
    const subjectAliases = new Set(entry.aliases || []);
    const projectionAliases = buildNameAliases(projection?.title || "");
    return projectionAliases.some((alias) => alias && subjectAliases.has(alias));
  }

  function applyProjectedTimetableTotals(subjects, projectedSubjects) {
    return (subjects || []).map((entry) => {
      const matchingProjections = (projectedSubjects || []).filter((projection) => projectionEntryMatchesSubject(entry, projection));
      const projectedRemaining = matchingProjections.reduce(
        (sum, projection) => sum + numberValue(projection?.remainingUnits),
        0,
      );
      const predictedTotal = entry.total + Math.max(0, projectedRemaining);

      return {
        ...entry,
        predictedTotal,
        predictedPercent: predictedTotal > 0 ? (entry.absent / predictedTotal) * 100 : Number.NaN,
      };
    });
  }

  async function fetchProjectedTimetableTotals() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "ee-grades-projected-subject-totals",
        origin: window.location.origin,
        secondHalfStartOverride: halfyearStartOverride,
        secondHalfEndOverride: halfyearEndOverride,
        accuratePredictionEnabled: accuratePredictedAttendanceEnabled,
      }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          resolve([]);
          return;
        }
        resolve(Array.isArray(response.data?.subjects) ? response.data.subjects : []);
      });
    });
  }

  function findMatchingSubjectEntries(rowText, subjectStats, rowSubjectId = "") {
    const rowAliases = buildRowAliases(rowText);
    const normalizedRowText = normalizeText(rowText);
    const directMatches = rowSubjectId
      ? subjectStats.filter((entry) => String(entry?.rawId || "").trim() === rowSubjectId)
      : [];
    if (rowAliases.size === 0 && !normalizedRowText) {
      return Array.from(
        new Map(directMatches.map((entry) => [entry.key, entry])).values(),
      );
    }

    let aliasMatches = subjectStats.filter((entry) =>
      isExactSubjectAliasMatch(rowAliases, entry),
    );

    if (aliasMatches.length === 0 && normalizedRowText) {
      aliasMatches = subjectStats.filter((entry) =>
        Array.from(entry.aliases || []).some((alias) =>
          alias && (
            normalizedRowText === alias
            || normalizedRowText.startsWith(`${alias} `)
            || alias.startsWith(`${normalizedRowText} `)
          ),
        ),
      );
    }

    if (aliasMatches.length > 0) {
      const longestAliasLength = aliasMatches.reduce((maxLength, entry) => {
        const entryMax = Array.from(entry.aliases || []).reduce((entryLength, alias) => {
          if (!alias) return entryLength;
          if (
            normalizedRowText === alias
            || normalizedRowText.startsWith(`${alias} `)
            || alias.startsWith(`${normalizedRowText} `)
          ) {
            return Math.max(entryLength, alias.length);
          }
          return entryLength;
        }, 0);
        return Math.max(maxLength, entryMax);
      }, 0);

      if (longestAliasLength > 0) {
        aliasMatches = aliasMatches.filter((entry) =>
          Array.from(entry.aliases || []).some((alias) =>
            alias
            && alias.length === longestAliasLength
            && (
              normalizedRowText === alias
              || normalizedRowText.startsWith(`${alias} `)
              || alias.startsWith(`${normalizedRowText} `)
            ),
          ),
        );
      }
    }

    const combinedMatches = [...directMatches, ...aliasMatches];

    return Array.from(
      new Map(combinedMatches.map((entry) => [entry.key, entry])).values(),
    );
  }

  function matchSubjectStats(rowText, subjectStats, rowSubjectId = "") {
    const matches = findMatchingSubjectEntries(rowText, subjectStats, rowSubjectId);
    if (matches.length === 0) {
      return null;
    }
    return aggregateMatchedStats(matches);
  }

  function buildSubjectAttendanceRenderSignature(table, data) {
    const rowSignature = Array.from(table.querySelectorAll("tr.predmetRow"))
      .map((row) => readPrimaryRowSubjectText(row))
      .join("|");

    return `${data.currentDate}:${data.halfKey}:${data.subjects.length}:${data.fetchedAt}:${data.predictionState || "ready"}:${rowSignature}`;
  }

  function renderSubjectAttendance(table, data) {
    markInternalMutation();
    ensureAttendanceColumns(table);

    const renderSignature = buildSubjectAttendanceRenderSignature(table, data);
    if (table.getAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR) === renderSignature) {
      return;
    }

    table.querySelectorAll(".ee-subject-attendance").forEach((element) => element.remove());
    const renderDebugRows = [];

    Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
      const percentCell = row.querySelector(".ee-attendance-percent-cell");
      const totalCell = row.querySelector(".ee-attendance-total-cell");
      const predictedPercentCell = row.querySelector(".ee-attendance-predicted-percent-cell");
      const predictedTotalCell = row.querySelector(".ee-attendance-predicted-total-cell");
      if (!percentCell || !totalCell || !predictedPercentCell || !predictedTotalCell) return;

      const rowText = readPrimaryRowSubjectText(row);
      const rowSubjectId = readRowSubjectId(row);
      const matchedStats = matchSubjectStats(rowText, data.subjects, rowSubjectId);
      if (!matchedStats) {
        setAttendanceCellValue(
          percentCell,
          "-",
          { empty: true, title: `Current halfyear (${data.halfLabel}) data was not matched to this grades row.` },
        );
        setAttendanceCellValue(
          totalCell,
          "-",
          { empty: true, title: `Current halfyear (${data.halfLabel}) data was not matched to this grades row.` },
        );
        setAttendanceCellValue(
          predictedPercentCell,
          "-",
          { empty: true, title: `Projected end-of-halfyear (${data.halfLabel}) data was not matched to this grades row.` },
        );
        setAttendanceCellValue(
          predictedTotalCell,
          "-",
          { empty: true, title: `Projected end-of-halfyear (${data.halfLabel}) data was not matched to this grades row.` },
        );
        delete row.dataset.eeAttendanceSignature;
        renderDebugRows.push({
          rowText,
          matched: false,
        });
        return;
      }

      const predictedReady = shouldRenderPredictedAttendance({
        predictionState: data.predictionState || "ready",
        predictedPercent: matchedStats.predictedPercent,
        predictedTotal: matchedStats.predictedTotal,
      });
      const predictedPlaceholder = buildAttendancePlaceholderState(
        data.predictionState === "unavailable" ? "unavailable" : "loading",
        data.predictionState === "unavailable"
          ? "Predicted end-of-halfyear attendance is not available yet."
          : "Predicted end-of-halfyear attendance is still loading.",
      );
      const rowSignature = `${rowText}:${matchedStats.absent}:${matchedStats.total}:${predictedReady ? matchedStats.predictedTotal : data.predictionState || "loading"}`;
      const title = `Current halfyear (${data.halfLabel}): ${matchedStats.absent}/${matchedStats.total} lessons absent. Formula: absent / lessons held so far in the halfyear.`;
      const predictedTitle = `If you miss no more lessons this ${data.halfLabel.toLowerCase()}, the projected end-of-halfyear total is ${matchedStats.absent}/${matchedStats.predictedTotal}.`;
      const tone = attendanceTone(matchedStats.percent);
      const predictedTone = attendanceTone(matchedStats.predictedPercent);

      setAttendanceCellValue(
        percentCell,
        Number.isFinite(matchedStats.percent) ? formatPercent(matchedStats.percent) : "-",
        {
          tone: Number.isFinite(matchedStats.percent) ? tone : null,
          title,
          empty: !Number.isFinite(matchedStats.percent),
        },
      );
      setAttendanceCellValue(
        totalCell,
        `${matchedStats.absent}/${matchedStats.total}`,
        { title },
      );
      setAttendanceCellValue(
        predictedPercentCell,
        predictedReady ? formatPercent(matchedStats.predictedPercent) : predictedPlaceholder.text,
        {
          tone: predictedReady ? predictedTone : null,
          title: predictedReady ? predictedTitle : predictedPlaceholder.title,
          empty: !predictedReady,
          loading: !predictedReady && predictedPlaceholder.loading,
        },
      );
      setAttendanceCellValue(
        predictedTotalCell,
        predictedReady ? `${matchedStats.absent}/${matchedStats.predictedTotal}` : predictedPlaceholder.text,
        {
          title: predictedReady ? predictedTitle : predictedPlaceholder.title,
          empty: !predictedReady,
          loading: !predictedReady && predictedPlaceholder.loading,
        },
      );

      row.dataset.eeAttendanceSignature = rowSignature;
      renderDebugRows.push({
        rowText,
        matched: true,
        absent: matchedStats.absent,
        total: matchedStats.total,
        predictedTotal: predictedReady ? matchedStats.predictedTotal : null,
        percent: Number.isFinite(matchedStats.percent) ? Number(matchedStats.percent.toFixed(2)) : null,
        predictedPercent: predictedReady && Number.isFinite(matchedStats.predictedPercent) ? Number(matchedStats.predictedPercent.toFixed(2)) : null,
        displayNames: matchedStats.displayNames,
      });
    });

    table.setAttribute(ATTENDANCE_RENDER_SIGNATURE_ATTR, renderSignature);
    debugLog("Rendered rows", renderDebugRows);

    const rowTexts = renderDebugRows.map((entry) => entry.rowText).filter(Boolean);
    const unmatchedRows = renderDebugRows
      .filter((entry) => !entry.matched)
      .map((entry) => entry.rowText);
    const matchedRowsWithAbsences = renderDebugRows
      .filter((entry) => entry.matched && numberValue(entry.absent) > 0);
    const unmatchedAbsentSubjects = (data.subjects || [])
      .filter((entry) => numberValue(entry.absent) > 0)
      .filter((entry) => !rowTexts.some((rowText) =>
        findMatchingSubjectEntries(rowText, [entry]).length > 0,
      ))
      .map((entry) => ({
        key: entry.key,
        rawId: entry.rawId,
        displayName: entry.displayName,
        shortName: entry.shortName,
        absent: entry.absent,
        total: entry.total,
        percent: Number.isFinite(entry.percent) ? Number(entry.percent.toFixed(2)) : null,
        aliases: Array.from(entry.aliases || []).sort(),
      }));

    debugLog("Matched rows with absences", matchedRowsWithAbsences);
    debugLog("Unmatched row texts", unmatchedRows);
    debugLog("Subjects with absences but no row match", unmatchedAbsentSubjects);
    debugLog("Counted absence diagnostics", data.debug?.absenceDiagnostics || []);
    debugLog(
      "Counted absence diagnostics JSON",
      JSON.stringify(data.debug?.absenceDiagnostics || [], null, 2),
    );
  }

  function summarizeAttendance(subjects) {
    let absent = 0;
    let total = 0;

    (subjects || []).forEach((entry) => {
      absent += numberValue(entry.absent);
      total += numberValue(entry.total);
    });

    return {
      absent,
      total,
      percent: total > 0 ? (absent / total) * 100 : Number.NaN,
    };
  }

  function summarizeRenderableAttendance(subjects) {
    return summarizeAttendance(
      (subjects || []).filter((entry) => numberValue(entry.total) > 0),
    );
  }

  function summarizePredictedAttendance(subjects, currentSummary = null) {
    let absent = numberValue(currentSummary?.absent);
    let total = numberValue(currentSummary?.total);
    let currentMatchedTotal = 0;
    let predictedMatchedTotal = 0;

    (subjects || []).forEach((entry) => {
      const currentTotal = numberValue(entry.total);
      const predictedTotal = Math.max(currentTotal, numberValue(entry.predictedTotal) || currentTotal);
      currentMatchedTotal += currentTotal;
      predictedMatchedTotal += predictedTotal;
    });

    if (!currentSummary) {
      absent = 0;
      total = 0;
      (subjects || []).forEach((entry) => {
        absent += numberValue(entry.absent);
      });
      total = currentMatchedTotal;
    }

    const projectedTotal = total + Math.max(0, predictedMatchedTotal - currentMatchedTotal);

    return {
      absent,
      total: projectedTotal,
      percent: projectedTotal > 0 ? (absent / projectedTotal) * 100 : Number.NaN,
    };
  }

  function listAttendanceOnlyAbsentSubjects(subjects) {
    return (subjects || [])
      .filter((entry) => numberValue(entry.absent) > 0 && numberValue(entry.total) <= 0)
      .map((entry) => ({
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

  function resolveAttendanceBreakdown(renderedSummary, officialHalfSummary, rawAbsentLessons) {
    const matchedAbsent = numberValue(renderedSummary?.absent);
    const matchedTotal = numberValue(renderedSummary?.total);
    const officialAbsent = Math.max(
      numberValue(rawAbsentLessons),
      numberValue(officialHalfSummary?.absent),
    );
    const officialTotal = numberValue(officialHalfSummary?.total);

    const summaryAbsent = Math.max(matchedAbsent, officialAbsent);
    const summaryTotal = Math.max(matchedTotal, officialTotal);
    const unmatchedAbsent = Math.max(0, summaryAbsent - matchedAbsent);
    const unmatchedTotal = Math.max(0, summaryTotal - matchedTotal);

    return {
      matched: {
        absent: matchedAbsent,
        total: matchedTotal,
        percent: matchedTotal > 0 ? (matchedAbsent / matchedTotal) * 100 : Number.NaN,
      },
      unmatched: {
        absent: unmatchedAbsent,
        total: unmatchedTotal,
        percent: unmatchedTotal > 0 ? (unmatchedAbsent / unmatchedTotal) * 100 : Number.NaN,
      },
      summary: {
        absent: summaryAbsent,
        total: summaryTotal,
        percent: summaryTotal > 0 ? (summaryAbsent / summaryTotal) * 100 : Number.NaN,
      },
    };
  }

  function countOverallAbsenceLessons(attendancePayload, absenceTypeMap, halfWindow) {
    const studentId = attendancePayload?.order?.[0] || Object.keys(attendancePayload?.students || {})[0];
    const dailyRecords = attendancePayload?.students?.[studentId] || {};
    let absent = 0;

    Object.entries(dailyRecords).forEach(([dateKey, dayEntries]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

      const countedPeriods = Object.entries(dayEntries || {}).filter(([periodKey, record]) =>
        periodKey !== "ad"
        && isMissedLessonRecord(record, absenceTypeMap),
      );

      if (countedPeriods.length > 0) {
        absent += countedPeriods.length;
        return;
      }

      const allDayRecord = dayEntries?.ad;
      if (
        isMissedLessonRecord(allDayRecord, absenceTypeMap)
      ) {
        absent += Math.max(1, numberValue(allDayRecord?.durationperiods));
      }
    });

    return absent;
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

  function weekStartISO(dateText) {
    const date = parseDateOnly(dateText);
    if (!date) return "";

    const weekday = date.getDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;
    date.setDate(date.getDate() + offset);
    return formatDateISO(date);
  }

  function addDaysISO(dateText, deltaDays) {
    const date = parseDateOnly(dateText);
    if (!date) return "";

    date.setDate(date.getDate() + deltaDays);
    return formatDateISO(date);
  }

  function buildWeekAnchors(startDate, endDate) {
    const anchors = [];
    let cursor = weekStartISO(startDate);
    const lastWeek = weekStartISO(endDate);

    while (cursor && cursor <= lastWeek) {
      anchors.push(cursor);
      cursor = addDaysISO(cursor, 7);
    }

    return anchors;
  }

  function buildRangeChunks(startDate, endDate, maxDays = CLASSBOOK_RANGE_MAX_DAYS) {
    const chunks = [];
    let cursor = startDate;

    while (cursor && cursor <= endDate) {
      let chunkEnd = addDaysISO(cursor, Math.max(0, maxDays - 1));
      if (!chunkEnd || chunkEnd > endDate) {
        chunkEnd = endDate;
      }

      chunks.push({
        startDate: cursor,
        endDate: chunkEnd,
      });

      if (chunkEnd >= endDate) {
        break;
      }

      cursor = addDaysISO(chunkEnd, 1);
    }

    return chunks;
  }

  function isSchoolDayISO(dateText) {
    const date = parseDateOnly(dateText);
    if (!date) return false;
    const day = date.getDay();
    return day >= 1 && day <= 5;
  }

  function buildSchoolDayAnchors(startDate, endDate) {
    const anchors = [];
    let cursor = startDate;

    while (cursor && cursor <= endDate) {
      if (isSchoolDayISO(cursor)) {
        anchors.push(cursor);
      }
      cursor = addDaysISO(cursor, 1);
    }

    return anchors;
  }

  function countSchoolDaysInRange(startDate, endDate) {
    return buildSchoolDayAnchors(startDate, endDate).length;
  }

  async function readCachedAttendanceStats() {
    const today = formatDateISO(new Date());
    if (gradesAttendanceDebugEnabled) return null;
    const result = await storageGet([GRADES_ATTENDANCE_CACHE_KEY]);
    const byOrigin = result[GRADES_ATTENDANCE_CACHE_KEY] || {};
    const cached = byOrigin[currentOrigin()];

    if (!cached) return null;
    if (cached.version !== GRADES_ATTENDANCE_CACHE_VERSION) return null;
    if (cached.currentDate !== today) return null;
    if (Date.now() - numberValue(cached.fetchedAt) > CACHE_TTL_MS) return null;

    return cached;
  }

  async function writeCachedAttendanceStats(stats) {
    if (gradesAttendanceDebugEnabled) return;
    const result = await storageGet([GRADES_ATTENDANCE_CACHE_KEY]);
    const byOrigin = result[GRADES_ATTENDANCE_CACHE_KEY] || {};
    byOrigin[currentOrigin()] = stats;
    await storageSet({ [GRADES_ATTENDANCE_CACHE_KEY]: byOrigin });
  }

  async function fetchText(url, options = {}) {
    debugLog("Fetch start", {
      url,
      method: options.method || "GET",
    });
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
    });

    if (!response.ok) {
      throw new Error(`Request failed for ${url}: ${response.status}`);
    }

    const text = await response.text();
    debugLog("Fetch ok", {
      url,
      method: options.method || "GET",
      length: text.length,
      startsWith: text.slice(0, 120),
    });
    return text;
  }

  async function fetchClassbookData(ttdayInfo, {
    date,
    datefrom = "",
    dateto = "",
  } = {}) {
    const params = new URLSearchParams({
      gpid: ttdayInfo.gpid,
      gsh: ttdayInfo.gsh,
      action: "loadData",
      user: String(ttdayInfo.user || ""),
      date: date || ttdayInfo.renderDate,
      changes: JSON.stringify({}),
      _LJSL: "0",
    });

    if (datefrom) {
      params.set("datefrom", datefrom);
    }
    if (dateto) {
      params.set("dateto", dateto);
    }

    const body = params.toString();
    debugLog("Classbook gcall request", {
      date: date || ttdayInfo.renderDate,
      datefrom,
      dateto,
      gpid: ttdayInfo.gpid,
      user: String(ttdayInfo.user || ""),
      body,
    });

    return fetchText("/gcall", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
    });
  }

  async function fetchClassbookRange(ttdayInfo, halfWindow) {
    return fetchClassbookData(ttdayInfo, {
      date: halfWindow.endDate,
      datefrom: halfWindow.startDate,
      dateto: halfWindow.endDate,
    });
  }

  async function fetchAnchoredClassbookRange(ttdayInfo, halfWindow, diagnostics = []) {
    const anchors = buildWeekAnchors(halfWindow.startDate, halfWindow.endDate);
    if (anchors.length === 0) {
      return { dates: {} };
    }

    let mergedData = { dates: {} };

    for (const anchor of anchors) {
      const anchoredResponse = await fetchClassbookData(ttdayInfo, { date: anchor });
      const responseInfo = inspectClassbookResponseText(anchoredResponse);
      const anchoredData = parseClassbookDataFromText(anchoredResponse);
      diagnostics.push({
        anchor,
        responseInfo,
        parsedDateCount: Object.keys(anchoredData?.dates || {}).length,
      });
      if (anchoredData?.dates) {
        mergedData = mergeClassbookData(mergedData, anchoredData);
      }
    }

    return mergedData;
  }

  async function fetchChunkedClassbookRange(ttdayInfo, halfWindow, diagnostics = []) {
    const chunks = buildRangeChunks(halfWindow.startDate, halfWindow.endDate);
    if (chunks.length === 0) {
      return { dates: {} };
    }

    let mergedData = { dates: {} };

    for (const chunk of chunks) {
      const responseText = await fetchClassbookData(ttdayInfo, {
        date: chunk.endDate,
        datefrom: chunk.startDate,
        dateto: chunk.endDate,
      });
      const responseInfo = inspectClassbookResponseText(responseText);
      const chunkData = parseClassbookDataFromText(responseText);
      diagnostics.push({
        startDate: chunk.startDate,
        endDate: chunk.endDate,
        responseInfo,
        parsedDateCount: Object.keys(chunkData?.dates || {}).length,
      });

      if (chunkData?.dates) {
        mergedData = mergeClassbookData(mergedData, chunkData);
      }
    }

    return mergedData;
  }

  async function fetchAnchoredTtdayPages(halfWindow, diagnostics = []) {
    const anchors = buildWeekAnchors(halfWindow.startDate, halfWindow.endDate);
    if (anchors.length === 0) {
      return { dates: {} };
    }

    let mergedData = { dates: {} };

    for (const anchor of anchors) {
      const url = `/dashboard/eb.php?mode=ttday&date=${encodeURIComponent(anchor)}`;
      const anchoredHtml = await fetchText(url);
      let parsedInfo = null;

      try {
        parsedInfo = parseTtdayPage(anchoredHtml);
      } catch (error) {
        diagnostics.push({
          anchor,
          source: "ttday-page",
          error: String(error?.message || error || "Unknown parse error"),
        });
        continue;
      }

      diagnostics.push({
        anchor,
        source: "ttday-page",
        renderDate: parsedInfo.renderDate,
        parsedDateCount: Object.keys(parsedInfo.classbookData?.dates || {}).length,
      });

      if (parsedInfo.classbookData?.dates) {
        mergedData = mergeClassbookData(mergedData, parsedInfo.classbookData);
      }
    }

    return mergedData;
  }

  async function fetchDenseTtdayPages(halfWindow, diagnostics = []) {
    const anchors = buildSchoolDayAnchors(halfWindow.startDate, halfWindow.endDate);
    if (anchors.length === 0) {
      return { dates: {} };
    }

    const BATCH_SIZE = 4;
    let mergedData = { dates: {} };

    for (let index = 0; index < anchors.length; index += BATCH_SIZE) {
      const batch = anchors.slice(index, index + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (anchor) => {
          const url = `/dashboard/eb.php?mode=ttday&date=${encodeURIComponent(anchor)}`;

          try {
            const anchoredHtml = await fetchText(url);
            const parsedInfo = parseTtdayPage(anchoredHtml);
            return {
              anchor,
              source: "ttday-dense",
              parsedInfo,
            };
          } catch (error) {
            return {
              anchor,
              source: "ttday-dense",
              error: String(error?.message || error || "Unknown parse error"),
            };
          }
        }),
      );

      results.forEach((result) => {
        if (result.error) {
          diagnostics.push(result);
          return;
        }

        const parsedDateCount = Object.keys(result.parsedInfo?.classbookData?.dates || {}).length;
        diagnostics.push({
          anchor: result.anchor,
          source: result.source,
          renderDate: result.parsedInfo?.renderDate || "",
          parsedDateCount,
        });

        if (parsedDateCount > 0) {
          mergedData = mergeClassbookData(mergedData, result.parsedInfo.classbookData);
        }
      });
    }

    return mergedData;
  }

  async function loadBaseSubjectAttendanceStats() {
    const today = formatDateISO(new Date());

    if (
      attendanceStatsCache
      && attendanceStatsCache.currentDate === today
      && Date.now() - numberValue(attendanceStatsCache.fetchedAt) <= CACHE_TTL_MS
    ) {
      return attendanceStatsCache;
    }

    if (attendanceBaseStatsPromise) {
      return attendanceBaseStatsPromise;
    }

    attendanceBaseStatsPromise = (async () => {
      const cached = await readCachedAttendanceStats();
      if (cached) {
        attendanceStatsCache = cached;
        window.__eeGradesAttendanceDebug = cached.debug || null;
        syncAttendanceDebug(cached.debug || null);
        attendanceStatsPromise = Promise.resolve(cached);
        return cached;
      }

      const [attendanceHtml, ttdayHtml] = await Promise.all([
        fetchText("/dashboard/eb.php?mode=attendance"),
        fetchText("/dashboard/eb.php?mode=ttday"),
      ]);

      const attendanceInfo = parseAttendancePage(attendanceHtml);
      const ttdayInfo = parseTtdayPage(ttdayHtml);
      debugLog("Parsed source pages", {
        today,
        ttdayRenderDate: ttdayInfo.renderDate,
        attendanceSubjects: attendanceInfo.subjectMap.size,
        ttdaySubjects: ttdayInfo.subjectMap.size,
        embeddedDates: Object.keys(ttdayInfo.classbookData?.dates || {}).length,
      });
      const halfWindow = resolveCurrentHalfWindow({
        currentDate: today,
        yearTurnover: attendanceInfo.yearTurnover || ttdayInfo.yearTurnover,
        selectedYear: attendanceInfo.selectedYear || ttdayInfo.selectedYear,
        halves: attendanceInfo.halves,
        secondHalfOverride: halfyearStartOverride,
        secondHalfEndOverride: halfyearEndOverride,
      });
      const officialHalfSummary = resolveOfficialHalfSummary(attendanceInfo, halfWindow);
      debugLog("Resolved half window", halfWindow);

      const classbookResponse = await fetchClassbookRange(ttdayInfo, halfWindow);
      const rangedResponseInfo = inspectClassbookResponseText(classbookResponse);
      const rangedClassbookData = parseClassbookDataFromText(classbookResponse) || { dates: {} };
      const embeddedDateCount = Object.keys(ttdayInfo.classbookData?.dates || {}).length;
      const rangedDateCount = Object.keys(rangedClassbookData?.dates || {}).length;
      const chunkDiagnostics = [];
      const needsChunkedFallback = rangedDateCount <= embeddedDateCount || rangedDateCount < 20;
      const chunkedClassbookData = needsChunkedFallback
        ? await fetchChunkedClassbookRange(ttdayInfo, halfWindow, chunkDiagnostics)
        : { dates: {} };
      const chunkedDateCount = Object.keys(chunkedClassbookData?.dates || {}).length;
      const needsAnchoredFallback = chunkedDateCount <= embeddedDateCount || chunkedDateCount < 20;
      const anchoredDiagnostics = [];
      let anchoredClassbookData = needsAnchoredFallback
        ? await fetchAnchoredClassbookRange(ttdayInfo, halfWindow, anchoredDiagnostics)
        : { dates: {} };
      if (needsAnchoredFallback && Object.keys(anchoredClassbookData?.dates || {}).length < 20) {
        const anchoredPageData = await fetchAnchoredTtdayPages(halfWindow, anchoredDiagnostics);
        anchoredClassbookData = mergeManyClassbookData(
          anchoredClassbookData,
          anchoredPageData,
        );
      }
      let mergedClassbookData = mergeManyClassbookData(
        ttdayInfo.classbookData,
        rangedClassbookData,
        chunkedClassbookData,
        anchoredClassbookData,
      );
      let subjectMap = parseSubjectMap(
        Object.fromEntries(attendanceInfo.subjectMap),
        Object.fromEntries(ttdayInfo.subjectMap),
        mergedClassbookData?.dbi?.subjects,
      );

      const absenceDiagnostics = [];
      const rawAbsentLessons = countOverallAbsenceLessons(
        attendanceInfo.payload,
        attendanceInfo.absenceTypeMap,
        halfWindow,
      );
      let absentEntries = computeSubjectAbsences(
        attendanceInfo.payload,
        attendanceInfo.absenceTypeMap,
        mergedClassbookData,
        subjectMap,
        halfWindow,
        absenceDiagnostics,
      );
      let totalEntries = computeSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
      let subjects = finalizeSubjectStats(absentEntries, totalEntries);
      let renderedAttendanceSummary = summarizeRenderableAttendance(subjects);
      const expectedSchoolDays = countSchoolDaysInRange(halfWindow.startDate, halfWindow.endDate);
      const expectedAbsentLessons = Math.max(
        rawAbsentLessons,
        numberValue(officialHalfSummary?.absent),
      );
      const denseDiagnostics = [];
      const denseFallbackThreshold = Math.max(15, Math.ceil(expectedSchoolDays * 0.7));
      const shouldUseDenseFallback = (
        expectedAbsentLessons > renderedAttendanceSummary.absent
        && Object.keys(mergedClassbookData?.dates || {}).length < denseFallbackThreshold
      );

      if (shouldUseDenseFallback) {
        const denseClassbookData = await fetchDenseTtdayPages(halfWindow, denseDiagnostics);
        const denseDateCount = Object.keys(denseClassbookData?.dates || {}).length;

        if (denseDateCount > 0) {
          mergedClassbookData = mergeManyClassbookData(
            mergedClassbookData,
            denseClassbookData,
          );
          subjectMap = parseSubjectMap(
            Object.fromEntries(attendanceInfo.subjectMap),
            Object.fromEntries(ttdayInfo.subjectMap),
            mergedClassbookData?.dbi?.subjects,
          );
          absenceDiagnostics.length = 0;
          absentEntries = computeSubjectAbsences(
            attendanceInfo.payload,
            attendanceInfo.absenceTypeMap,
            mergedClassbookData,
            subjectMap,
            halfWindow,
            absenceDiagnostics,
          );
          totalEntries = computeSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
          subjects = finalizeSubjectStats(absentEntries, totalEntries);
          renderedAttendanceSummary = summarizeRenderableAttendance(subjects);
        }
      }

      const classbookProjectedTotals = computeProjectedSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
      subjects = subjects.map((entry) => {
        const remaining = numberValue(classbookProjectedTotals.get(entry.key));
        const predictedTotal = entry.total + Math.max(0, remaining);
        return {
          ...entry,
          predictedTotal,
          predictedPercent: predictedTotal > 0 ? (entry.absent / predictedTotal) * 100 : Number.NaN,
        };
      });

      const attendanceBreakdown = resolveAttendanceBreakdown(
        renderedAttendanceSummary,
        officialHalfSummary,
        expectedAbsentLessons,
      );
      const attendanceSummary = attendanceBreakdown.summary;
      const attendanceOnlyAbsentSubjects = listAttendanceOnlyAbsentSubjects(subjects);
      const baseDebug = {
        currentDate: halfWindow.currentDate,
        ttdayRenderDate: ttdayInfo.renderDate,
        halfKey: halfWindow.halfKey,
        halfLabel: halfWindow.halfLabel,
        embeddedDateCount,
        rangedDateCount,
        chunkedDateCount,
        anchoredDateCount: Object.keys(anchoredClassbookData?.dates || {}).length,
        mergedDateCount: Object.keys(mergedClassbookData?.dates || {}).length,
        expectedSchoolDays,
        subjectCount: subjects.length,
        totalLessons: attendanceSummary.total,
        absentLessons: attendanceSummary.absent,
        rawAbsentLessons,
        renderedAbsentLessons: renderedAttendanceSummary.absent,
        unmatchedLessons: attendanceBreakdown.unmatched.total,
        unmatchedAbsentLessons: attendanceBreakdown.unmatched.absent,
        attendanceOnlyAbsentSubjects,
        officialHalfSummary,
        absenceDiagnostics,
        rangedResponseInfo,
        chunkDiagnostics,
        anchoredDiagnostics,
        denseDiagnostics,
        subjects: summarizeSubjectsForDebug(subjects),
      };

      const predictedAttendanceSummary = summarizePredictedAttendance(subjects, attendanceSummary);
      const baseStats = {
        version: GRADES_ATTENDANCE_CACHE_VERSION,
        fetchedAt: Date.now(),
        currentDate: halfWindow.currentDate,
        halfKey: halfWindow.halfKey,
        halfLabel: halfWindow.halfLabel,
        subjects,
        attendanceSummary,
        predictedAttendanceSummary,
        attendanceBreakdown,
        predictionState: "ready",
        debug: baseDebug,
      };

      window.__eeGradesAttendanceDebug = baseDebug;
      syncAttendanceDebug(baseDebug);

      attendanceStatsPromise = (async () => {
        const predictedSubjects = subjects;
        const debug = {
          ...baseDebug,
          subjects: summarizeSubjectsForDebug(predictedSubjects),
        };
        const stats = {
          ...baseStats,
          fetchedAt: Date.now(),
          subjects: predictedSubjects,
          predictedAttendanceSummary,
          predictionState: "ready",
          debug,
        };

        attendanceStatsCache = stats;
        window.__eeGradesAttendanceDebug = debug;
        syncAttendanceDebug(debug);
        debugLog("Final attendance stats", debug);
        if (attendanceSummary.total < 100 || debug.mergedDateCount <= embeddedDateCount) {
          console.warn("[Edupage Extras] Grades attendance diagnostic", debug);
        }
        if (attendanceSummary.total >= 100) {
          await writeCachedAttendanceStats(stats);
        }
        return stats;
      })()
        .finally(() => {
          attendanceStatsPromise = null;
        });

      return baseStats;
    })()
      .catch((error) => {
        if (String(error?.message).includes("Extension context invalidated")) return;
        debugWarn("Could not load grades attendance stats.", error);
        console.warn("[Edupage Extras] Could not load grades attendance stats.", error);
        throw error;
      })
      .finally(() => {
        attendanceBaseStatsPromise = null;
      });

    return attendanceBaseStatsPromise;
  }

  async function loadSubjectAttendanceStats() {
    const today = formatDateISO(new Date());

    if (
      attendanceStatsCache
      && attendanceStatsCache.currentDate === today
      && Date.now() - numberValue(attendanceStatsCache.fetchedAt) <= CACHE_TTL_MS
    ) {
      return attendanceStatsCache;
    }

    if (attendanceStatsPromise) {
      return attendanceStatsPromise;
    }

    const baseStats = await loadBaseSubjectAttendanceStats();
    if (baseStats?.predictionState === "ready") {
      return baseStats;
    }
    if (attendanceStatsPromise) {
      return attendanceStatsPromise;
    }
    return baseStats;
  }

  function parseRatioCellText(cell) {
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec((cell?.textContent || "").trim());
    return match
      ? { absent: Number.parseInt(match[1], 10), total: Number.parseInt(match[2], 10) }
      : null;
  }

  function readDisplayPercentNumber(cell) {
    const text = (cell?.textContent || "").trim();
    if (!text || text === "-" || text === "...") return null;
    // Locale-independent: take the first number in the cell, treat ","/"." as decimal.
    const match = text.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
    if (!match) return null;
    const value = Number.parseFloat(match[0].replace(",", "."));
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function readSubjectAverageNumber(rawText) {
    const value = parseAverage(rawText);
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function buildGradesJsonPayload(table) {
    const withAttendance = gradesAttendanceEnabled;
    const subjects = [];

    Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
      const name = readPrimaryRowSubjectText(row);
      if (!name) return;

      const priemerCell = row.querySelector(".znPriemerCell");
      const rawAverage = (priemerCell?.dataset.eeOriginalAverage || readAverageText(priemerCell) || "").trim();
      const averageNumber = readSubjectAverageNumber(rawAverage);
      const scale = detectAverageScale(rawAverage, Number.isFinite(averageNumber) ? averageNumber : Number.NaN);

      const subject = {
        name,
        subjectId: String(row?.dataset?.predmetid || "").trim() || null,
        average: averageNumber,
        averageDisplay: rawAverage || null,
        averageScale: scale || null,
      };

      if (withAttendance) {
        const current = parseRatioCellText(row.querySelector(".ee-attendance-total-cell"));
        const predicted = parseRatioCellText(row.querySelector(".ee-attendance-predicted-total-cell"));
        subject.attendance = {
          absent: current?.absent ?? null,
          lessonsHeld: current?.total ?? null,
          absencePercent: readDisplayPercentNumber(row.querySelector(".ee-attendance-percent-cell")),
          predictedLessonsTotal: predicted?.total ?? null,
          predictedAbsencePercent: readDisplayPercentNumber(
            row.querySelector(".ee-attendance-predicted-percent-cell"),
          ),
        };
      }

      subjects.push(subject);
    });

    return {
      schema: "edupage-extras.grades.v1",
      exportedAt: new Date().toISOString(),
      source: "Edupage Extras grades enhancer",
      pageUrl: window.location.href,
      attendanceIncluded: withAttendance,
      subjectCount: subjects.length,
      subjects,
    };
  }

  function downloadGradesJson(table) {
    const payload = buildGradesJsonPayload(table);
    // 2-space indent so the file opens nicely in any text editor.
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `edupage-grades-${formatDateISO(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function ensureCsvExportButton(table) {
    if (!table.parentElement) return;
    if (table.previousElementSibling?.classList?.contains("ee-grades-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "ee-grades-toolbar";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ee-grades-export-btn";
    button.textContent = t("gradesExportJson");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      downloadGradesJson(table);
    });

    toolbar.appendChild(button);
    table.parentElement.insertBefore(toolbar, table);
  }

  function enhanceGradesTable() {
    const tables = getGradesTables();
    const table = getPrimaryGradesTable();
    if (!table || tables.length === 0) return;

    markInternalMutation();
    injectStyles();
    tables.forEach((gradesTable) => applyStoredGradeTitles(gradesTable));
    ensureCsvExportButton(table);

    if (gradesAttendanceEnabled) {
      tables.forEach((gradesTable) => ensureAttendanceColumns(gradesTable));
    } else {
      tables.forEach((gradesTable) => clearSubjectAttendance(gradesTable));
    }

    if (gradeBadgesEnabled) {
      const averages = collectAverages(table);
      const averageSignature = buildAverageRenderSignature(averages);
      const summarySignature = buildSummaryRenderSignature(
        averageSignature,
        gradesAttendanceEnabled,
        null,
        null,
        gradesAttendanceEnabled ? "loading" : "unavailable",
        gradesAttendanceEnabled ? "loading" : "unavailable",
      );
      if (
        table.getAttribute(AVERAGE_RENDER_SIGNATURE_ATTR) !== averageSignature
        || table.querySelector("tr.ee-overall-row")?.dataset.eeSignature !== summarySignature
      ) {
        ensureSummaryRow(
          table,
          averages,
          summarySignature,
          {
            attendanceColumns: gradesAttendanceEnabled,
            attendanceSummary: null,
            attendanceState: gradesAttendanceEnabled ? "loading" : "unavailable",
            predictionState: gradesAttendanceEnabled ? "loading" : "unavailable",
          },
        );
        table.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, averageSignature);
      }
      ensureVirtualGradeButtons(table);
    } else {
      restoreAverageCells(table);
    }

    if (!gradesAttendanceEnabled) {
      tables.forEach((gradesTable) => clearSubjectAttendance(gradesTable));
      return;
    }

    const loadToken = ++attendanceLoadToken;
    tables.forEach((gradesTable) => populateAttendancePlaceholders(
      gradesTable,
      "Official current-halfyear attendance data is still loading.",
      { loading: true },
    ));
    loadBaseSubjectAttendanceStats()
      .then((data) => {
        if (!gradesAttendanceEnabled || loadToken !== attendanceLoadToken) return;

        const liveTable = getPrimaryGradesTable();
        if (!liveTable) return;

        renderSubjectAttendance(liveTable, data);

        getGradesTables()
          .filter((gradesTable) => gradesTable !== liveTable)
          .forEach((gradesTable) => ensureAttendanceColumns(gradesTable));

        if (gradeBadgesEnabled) {
          const liveAverages = collectAverages(liveTable);
          const liveAverageSignature = buildAverageRenderSignature(liveAverages);
          const attendanceSummary = data.attendanceSummary || summarizeAttendance(data.subjects);
          ensureSummaryRow(
            liveTable,
            liveAverages,
            buildSummaryRenderSignature(
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

        loadSubjectAttendanceStats()
          .then((finalData) => {
            if (!gradesAttendanceEnabled || loadToken !== attendanceLoadToken) return;
            const latestTable = getPrimaryGradesTable();
            if (!latestTable) return;

            renderSubjectAttendance(latestTable, finalData);

            if (gradeBadgesEnabled) {
              const latestAverages = collectAverages(latestTable);
              const latestAverageSignature = buildAverageRenderSignature(latestAverages);
              const latestAttendanceSummary = finalData.attendanceSummary || summarizeAttendance(finalData.subjects);
              ensureSummaryRow(
                latestTable,
                latestAverages,
                buildSummaryRenderSignature(
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
            if (!gradesAttendanceEnabled || loadToken !== attendanceLoadToken) return;
            const latestTable = getPrimaryGradesTable();
            if (!latestTable) return;
            const unavailableData = {
              ...data,
              predictionState: "unavailable",
            };
            renderSubjectAttendance(latestTable, unavailableData);
            if (gradeBadgesEnabled) {
              const latestAverages = collectAverages(latestTable);
              const latestAverageSignature = buildAverageRenderSignature(latestAverages);
              const latestAttendanceSummary = unavailableData.attendanceSummary || summarizeAttendance(unavailableData.subjects);
              ensureSummaryRow(
                latestTable,
                latestAverages,
                buildSummaryRenderSignature(
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
        if (liveTable && gradesAttendanceEnabled) {
          populateAttendancePlaceholders(liveTable);
          if (gradeBadgesEnabled) {
            const liveAverages = collectAverages(liveTable);
            const liveAverageSignature = buildAverageRenderSignature(liveAverages);
            ensureSummaryRow(
              liveTable,
              liveAverages,
              buildSummaryRenderSignature(liveAverageSignature, true, null, null, "unavailable", "unavailable"),
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
          .forEach((gradesTable) => populateAttendancePlaceholders(gradesTable));
      });
  }

  function scheduleEnhance() {
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(enhanceGradesTable, 160);
  }

  function syncAllAttendanceHeaderLayouts() {
    getGradesTables().forEach((table) => syncAttendanceHeaderLayout(table));
  }

  function scheduleHeaderSync() {
    window.clearTimeout(headerSyncTimer);
    headerSyncTimer = window.setTimeout(syncAllAttendanceHeaderLayouts, 0);
  }

  function initStorage() {
    chrome.storage.local.get([
      GRADE_BADGES_KEY,
      GRADE_TITLE_OVERRIDES_KEY,
      GRADES_ATTENDANCE_KEY,
      ACCURATE_PREDICTED_ATTENDANCE_KEY,
      GRADES_ATTENDANCE_DEBUG_KEY,
      HALFYEAR_START_KEY,
      HALFYEAR_END_KEY,
      VIRTUAL_GRADES_KEY,
      EXISTING_MASS_OVERRIDES_KEY,
    ], (result) => {
      gradeBadgesEnabled = result[GRADE_BADGES_KEY] === true;
      gradeTitleOverrides = result[GRADE_TITLE_OVERRIDES_KEY] && typeof result[GRADE_TITLE_OVERRIDES_KEY] === "object"
        ? result[GRADE_TITLE_OVERRIDES_KEY]
        : {};
      gradesAttendanceEnabled = result[GRADES_ATTENDANCE_KEY] !== false;
      accuratePredictedAttendanceEnabled = result[ACCURATE_PREDICTED_ATTENDANCE_KEY] === true;
      gradesAttendanceDebugEnabled = result[GRADES_ATTENDANCE_DEBUG_KEY] === true;
      halfyearStartOverride = normalizeDateInput(result[HALFYEAR_START_KEY]);
      halfyearEndOverride = normalizeDateInput(result[HALFYEAR_END_KEY]);
      virtualGradesData = result[VIRTUAL_GRADES_KEY] && typeof result[VIRTUAL_GRADES_KEY] === "object"
        ? result[VIRTUAL_GRADES_KEY]
        : {};
      existingMassOverrides = result[EXISTING_MASS_OVERRIDES_KEY] && typeof result[EXISTING_MASS_OVERRIDES_KEY] === "object"
        ? result[EXISTING_MASS_OVERRIDES_KEY]
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

      if (changes[GRADE_TITLE_OVERRIDES_KEY]) {
        gradeTitleOverrides = changes[GRADE_TITLE_OVERRIDES_KEY].newValue && typeof changes[GRADE_TITLE_OVERRIDES_KEY].newValue === "object"
          ? changes[GRADE_TITLE_OVERRIDES_KEY].newValue
          : {};
        shouldEnhance = true;
      }

      if (changes[GRADES_ATTENDANCE_KEY]) {
        gradesAttendanceEnabled = changes[GRADES_ATTENDANCE_KEY].newValue !== false;
        shouldEnhance = true;
      }

      if (changes[ACCURATE_PREDICTED_ATTENDANCE_KEY]) {
        accuratePredictedAttendanceEnabled = changes[ACCURATE_PREDICTED_ATTENDANCE_KEY].newValue === true;
        attendanceStatsCache = null;
        shouldEnhance = true;
      }

      if (changes[GRADES_ATTENDANCE_DEBUG_KEY]) {
        gradesAttendanceDebugEnabled = changes[GRADES_ATTENDANCE_DEBUG_KEY].newValue === true;
        attendanceStatsCache = null;
        shouldEnhance = true;
      }

      if (changes[HALFYEAR_START_KEY]) {
        halfyearStartOverride = normalizeDateInput(changes[HALFYEAR_START_KEY].newValue);
        attendanceStatsCache = null;
        shouldEnhance = true;
      }

      if (changes[HALFYEAR_END_KEY]) {
        halfyearEndOverride = normalizeDateInput(changes[HALFYEAR_END_KEY].newValue);
        attendanceStatsCache = null;
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
    loadGradeTitleOverrides();
    document.addEventListener("dblclick", handleGradeTitleEdit, true);
    document.addEventListener("click", handleDocumentClickForPopover, true);
    window.addEventListener("scroll", scheduleHeaderSync, { passive: true });
    window.addEventListener("resize", scheduleHeaderSync, { passive: true });
    initStorage();
    enhanceGradesTable();
    initObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
