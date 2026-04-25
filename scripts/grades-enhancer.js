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
  const GRADES_ATTENDANCE_KEY = "gradesAttendanceStatsEnabled";
  const GRADES_ATTENDANCE_DEBUG_KEY = "gradesAttendanceDebugEnabled";
  const GRADES_ATTENDANCE_CACHE_KEY = "eeGradesAttendanceStatsCache";
  const GRADES_ATTENDANCE_CACHE_VERSION = 7;
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const CLASSBOOK_RANGE_MAX_DAYS = 30;
  let gradeBadgesEnabled = false;
  let gradesAttendanceEnabled = true;
  let gradesAttendanceDebugEnabled = false;
  let observerTimer = null;
  let attendanceStatsCache = null;
  let attendanceStatsPromise = null;
  let attendanceLoadToken = 0;
  let ignoreMutationsUntil = 0;

  function parseAverage(text) {
    if (!text) return Number.NaN;
    const match = text.trim().match(/^(\d+(?:[.,]\d+)?)/);
    return match ? Number.parseFloat(match[1].replace(",", ".")) : Number.NaN;
  }

  function gradeColor(avg) {
    if (Number.isNaN(avg)) return "#888";
    if (avg <= 1.5) return "#2e7d32";
    if (avg <= 2.5) return "#558b2f";
    if (avg <= 3.5) return "#f57f17";
    if (avg <= 4.5) return "#e65100";
    return "#c62828";
  }

  function gradePercentage(avg) {
    return Math.max(4, Math.min(100, ((5 - avg) / 4) * 96 + 4));
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function isMissedLessonRecord(record) {
    return String(record?.presence || "") === "A";
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

  function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
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

  function createBadgeElement(avg, displayText, { largeValue = false } = {}) {
    if (Number.isNaN(avg)) return null;

    const badge = document.createElement("div");
    badge.className = "ee-avg-badge";
    badge.style.setProperty("--avg-color", gradeColor(avg));
    badge.style.setProperty("--avg-pct", `${gradePercentage(avg).toFixed(1)}%`);

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

      .ee-attendance-total {
        color: #263238;
      }

      .ee-attendance-empty {
        color: #78909c;
        font-size: 11px;
        font-weight: normal;
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
    `;
    (document.head || document.documentElement).appendChild(style);
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
    if (Number.isNaN(avg)) return null;
    if (priemerCell.querySelector(".ee-avg-badge")) {
      return { avg, displayText: rawText };
    }

    priemerCell.dataset.eeOriginalAverage = rawText;
    const badge = createBadgeElement(avg, rawText);
    if (!badge) return { avg, displayText: rawText };

    const link = priemerCell.querySelector("a");
    if (link) {
      link.textContent = "";
      link.appendChild(badge);
    } else {
      priemerCell.textContent = "";
      priemerCell.appendChild(badge);
    }

    return { avg, displayText: rawText };
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
      .map(({ avg, displayText }) => `${displayText}:${avg.toFixed(2)}`)
      .join("|");
  }

  function buildSummaryRenderSignature(averageSignature, attendanceColumnsEnabled, attendanceSummary) {
    if (!attendanceColumnsEnabled) {
      return `${averageSignature}|attendance:off`;
    }

    if (!attendanceSummary) {
      return `${averageSignature}|attendance:pending`;
    }

    return `${averageSignature}|attendance:${attendanceSummary.absent}:${attendanceSummary.total}`;
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

  function ensureSummaryRow(table, averages, renderSignature, { attendanceColumns = false, attendanceSummary = null } = {}) {
    const existing = table.querySelector("tr.ee-overall-row");
    if (existing?.dataset.eeSignature === renderSignature) return;
    if (existing) existing.remove();
    if (averages.length === 0) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

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
    label.textContent = "Overall";

    const meta = document.createElement("span");
    meta.className = "ee-overall-meta";
    meta.textContent = `${averages.length} subjects`;

    labelCell.appendChild(label);
    labelCell.appendChild(meta);

    const avgCell = document.createElement("td");
    avgCell.className = "ee-overall-value-cell";
    avgCell.appendChild(createBadgeElement(overallAvg, overallAvg.toFixed(2), { largeValue: true }));

    if (!attendanceColumns) {
      labelCell.colSpan = Math.max(1, colCount - 2);
      avgCell.colSpan = 2;
      summaryRow.appendChild(labelCell);
      summaryRow.appendChild(avgCell);
      tbody.appendChild(summaryRow);
      return;
    }

    const summaryTone = attendanceTone(attendanceSummary?.percent);
    const usedMetricColumns = 3;
    const labelSpan = Math.max(1, colCount - usedMetricColumns - 1);
    labelCell.colSpan = labelSpan;

    const percentCell = document.createElement("td");
    percentCell.className = "ee-overall-attendance-cell ee-attendance-percent-cell";

    const totalCell = document.createElement("td");
    totalCell.className = "ee-overall-attendance-cell ee-attendance-total-cell";

    if (attendanceSummary && Number.isFinite(attendanceSummary.percent)) {
      const percentValue = document.createElement("span");
      percentValue.className = "ee-attendance-stat";
      percentValue.style.color = summaryTone.color;
      percentValue.textContent = formatPercent(attendanceSummary.percent);
      percentCell.appendChild(percentValue);
      percentCell.title = `Current halfyear: ${attendanceSummary.absent}/${attendanceSummary.total} lessons absent in total.`;

      const totalValue = document.createElement("span");
      totalValue.className = "ee-attendance-stat ee-attendance-total";
      totalValue.textContent = `${attendanceSummary.absent}/${attendanceSummary.total}`;
      totalCell.appendChild(totalValue);
      totalCell.title = `Current halfyear: absent / lessons held so far across all matched subjects.`;
    } else {
      const percentEmpty = document.createElement("span");
      percentEmpty.className = "ee-attendance-empty";
      percentEmpty.textContent = "-";
      percentCell.appendChild(percentEmpty);
      percentCell.title = "Current halfyear attendance data is still loading.";

      const totalEmpty = document.createElement("span");
      totalEmpty.className = "ee-attendance-empty";
      totalEmpty.textContent = "-";
      totalCell.appendChild(totalEmpty);
      totalCell.title = "Current halfyear attendance data is still loading.";
    }

    summaryRow.appendChild(labelCell);
    summaryRow.appendChild(avgCell);
    summaryRow.appendChild(percentCell);
    summaryRow.appendChild(totalCell);

    const remainingSpan = colCount - labelSpan - 3;
    if (remainingSpan > 0) {
      const fillerCell = document.createElement("td");
      fillerCell.colSpan = remainingSpan;
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

  function resolveCurrentHalfWindow({ currentDate, yearTurnover, selectedYear, halves }) {
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

    const secondHalfStart = new Date(turnoverDate.getFullYear() + 1, 1, 1);
    const halfKey = today < secondHalfStart ? "1" : "2";
    const startDate = halfKey === "1" ? turnoverDate : secondHalfStart;
    const now = new Date();

    return {
      currentDate: todayIso,
      startDate: formatDateISO(startDate),
      endDate: todayIso,
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
    const total = numberValue(currentHalfStats.present)
      + numberValue(currentHalfStats.distant)
      + absent;

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

  function computeSubjectAbsences(attendancePayload, classbookData, subjectMap, halfWindow, diagnostics = []) {
    const entryMap = new Map();
    const studentId = attendancePayload?.order?.[0] || Object.keys(attendancePayload?.students || {})[0];
    const dailyRecords = attendancePayload?.students?.[studentId] || {};

    const absentDatesMap = new Map();

    Object.entries(dailyRecords).forEach(([dateKey, dayEntries]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

      const countedPeriods = Object.entries(dayEntries || {}).filter(([periodKey, record]) =>
        periodKey !== "ad"
        && isMissedLessonRecord(record),
      );

      if (countedPeriods.length > 0) {
        const periods = new Set();
        countedPeriods.forEach(([periodKey, record]) => {
          if (/^\d+$/.test(periodKey)) {
            periods.add(Number.parseInt(periodKey, 10));
          }
          diagnostics.push({
            date: dateKey,
            source: "period",
            subjectid: String(record?.subjectid || ""),
            mapped: false,
            displayName: "",
            typeId: String(record?.studentabsent_typeid || ""),
          });
        });
        absentDatesMap.set(dateKey, periods);
        return;
      }

      const allDayRecord = dayEntries?.ad;
      if (
        isMissedLessonRecord(allDayRecord)
      ) {
        diagnostics.push({
          date: dateKey,
          source: "all-day",
          subjectid: String(allDayRecord?.subjectid || ""),
          mapped: false,
          displayName: "",
          durationperiods: Math.max(1, numberValue(allDayRecord?.durationperiods)),
          typeId: String(allDayRecord?.studentabsent_typeid || ""),
        });
        absentDatesMap.set(dateKey, true);
      }
    });

    Object.entries(classbookData?.dates || {}).forEach(([dateKey, dateEntry]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

      const absenteeStatus = absentDatesMap.get(dateKey);
      if (!absenteeStatus) return;

      const plan = Array.isArray(dateEntry?.plan) ? dateEntry.plan : [];
      plan.forEach((item) => {
        if (!shouldCountLessonItem(item, dateKey, halfWindow)) return;

        const entry = ensureSubjectEntry(entryMap, extractLessonSubjectId(item), subjectMap);
        if (!entry) return;

        let absentUnits = 0;
        if (absenteeStatus === true) {
          absentUnits = lessonDurationUnits(item);
        } else if (absenteeStatus instanceof Set) {
          const lessonPeriods = extractLessonPeriods(item);
          absentUnits = lessonPeriods.filter((period) => absenteeStatus.has(period)).length;
        }

        if (absentUnits > 0) {
          entry.absent += absentUnits;
          diagnostics.push({
            date: dateKey,
            source: absenteeStatus === true ? "lesson-from-all-day" : "lesson-from-periods",
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

  function finalizeSubjectStats(absentEntries, totalEntries) {
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
        percent: entry.total > 0 ? (entry.absent / entry.total) * 100 : Number.NaN,
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
      return { background: "rgba(46, 125, 50, 0.12)", color: "#2e7d32" };
    }
    if (percent <= 15) {
      return { background: "rgba(245, 127, 23, 0.12)", color: "#f57f17" };
    }
    return { background: "rgba(198, 40, 40, 0.12)", color: "#c62828" };
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

  function ensureAttendanceDataCell(row, className, afterCell) {
    let cell = row.querySelector(`.${className}`);
    if (!cell) {
      cell = document.createElement("td");
      cell.className = `ee-attendance-cell ${className}`;
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
        "Abs %",
        "Current halfyear absence percentage per subject.",
        averageHeaderCell,
      );
      ensureAttendanceHeaderCell(
        headerRow,
        "ee-attendance-total-header",
        "Abs/Hod.",
        "Current halfyear absent lessons / lessons held so far per subject.",
        percentHeader,
      );
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

  function setAttendanceCellValue(cell, text, { tone = null, title = "", empty = false } = {}) {
    cell.textContent = "";

    const value = document.createElement("span");
    value.className = empty ? "ee-attendance-empty" : "ee-attendance-stat";
    if (cell.classList.contains("ee-attendance-total-cell") && !empty) {
      value.classList.add("ee-attendance-total");
    }
    if (tone?.color && !empty) {
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

  function populateAttendancePlaceholders(table, title = "Official current-halfyear attendance data is not available yet.") {
    markInternalMutation();
    ensureAttendanceColumns(table);

    Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
      const percentCell = row.querySelector(".ee-attendance-percent-cell");
      const totalCell = row.querySelector(".ee-attendance-total-cell");
      if (!percentCell || !totalCell) return;

      setAttendanceCellValue(percentCell, "-", { empty: true, title });
      setAttendanceCellValue(totalCell, "-", { empty: true, title });
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

    entries.forEach((entry) => {
      absent += numberValue(entry.absent);
      total += numberValue(entry.total);
      if (entry.displayName) {
        displayNames.push(entry.displayName);
      }
    });

    return {
      displayNames,
      absent,
      total,
      percent: total > 0 ? (absent / total) * 100 : Number.NaN,
    };
  }

  function findMatchingSubjectEntries(rowText, subjectStats) {
    const rowAliases = buildRowAliases(rowText);
    const normalizedRowText = normalizeText(rowText);
    if (rowAliases.size === 0 && !normalizedRowText) return [];

    let matches = subjectStats.filter((entry) =>
      isExactSubjectAliasMatch(rowAliases, entry),
    );

    if (matches.length === 0 && normalizedRowText) {
      matches = subjectStats.filter((entry) =>
        Array.from(entry.aliases || []).some((alias) =>
          alias && (
            normalizedRowText === alias
            || normalizedRowText.startsWith(`${alias} `)
            || alias.startsWith(`${normalizedRowText} `)
          ),
        ),
      );
    }

    if (matches.length === 0) {
      return [];
    }

    const longestAliasLength = matches.reduce((maxLength, entry) => {
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
      matches = matches.filter((entry) =>
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

    return Array.from(
      new Map(matches.map((entry) => [entry.key, entry])).values(),
    );
  }

  function matchSubjectStats(rowText, subjectStats) {
    const matches = findMatchingSubjectEntries(rowText, subjectStats);
    if (matches.length === 0) {
      return null;
    }
    return aggregateMatchedStats(matches);
  }

  function buildSubjectAttendanceRenderSignature(table, data) {
    const rowSignature = Array.from(table.querySelectorAll("tr.predmetRow"))
      .map((row) => readPrimaryRowSubjectText(row))
      .join("|");

    return `${data.currentDate}:${data.halfKey}:${data.subjects.length}:${data.fetchedAt}:${rowSignature}`;
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
      if (!percentCell || !totalCell) return;

      const rowText = readPrimaryRowSubjectText(row);
      const matchedStats = matchSubjectStats(rowText, data.subjects);
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
        delete row.dataset.eeAttendanceSignature;
        renderDebugRows.push({
          rowText,
          matched: false,
        });
        return;
      }

      const rowSignature = `${rowText}:${matchedStats.absent}:${matchedStats.total}`;
      const title = `Current halfyear (${data.halfLabel}): ${matchedStats.absent}/${matchedStats.total} lessons absent. Formula: absent / lessons held so far in the halfyear.`;
      const tone = attendanceTone(matchedStats.percent);

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

      row.dataset.eeAttendanceSignature = rowSignature;
      renderDebugRows.push({
        rowText,
        matched: true,
        absent: matchedStats.absent,
        total: matchedStats.total,
        percent: Number.isFinite(matchedStats.percent) ? Number(matchedStats.percent.toFixed(2)) : null,
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

  function countOverallAbsenceLessons(attendancePayload, halfWindow) {
    const studentId = attendancePayload?.order?.[0] || Object.keys(attendancePayload?.students || {})[0];
    const dailyRecords = attendancePayload?.students?.[studentId] || {};
    let absent = 0;

    Object.entries(dailyRecords).forEach(([dateKey, dayEntries]) => {
      if (!isDateInRange(dateKey, halfWindow.startDate, halfWindow.endDate)) return;

      const countedPeriods = Object.entries(dayEntries || {}).filter(([periodKey, record]) =>
        periodKey !== "ad"
        && isMissedLessonRecord(record),
      );

      if (countedPeriods.length > 0) {
        absent += countedPeriods.length;
        return;
      }

      const allDayRecord = dayEntries?.ad;
      if (
        isMissedLessonRecord(allDayRecord)
      ) {
        absent += Math.max(1, numberValue(allDayRecord?.durationperiods));
      }
    });

    return absent;
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function storageSet(value) {
    return new Promise((resolve) => {
      chrome.storage.local.set(value, resolve);
    });
  }

  function markInternalMutation(durationMs = 300) {
    ignoreMutationsUntil = Math.max(ignoreMutationsUntil, Date.now() + durationMs);
  }

  function currentOrigin() {
    return window.location.origin;
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

    attendanceStatsPromise = (async () => {
      const cached = await readCachedAttendanceStats();
      if (cached) {
        attendanceStatsCache = cached;
        window.__eeGradesAttendanceDebug = cached.debug || null;
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
      const rawAbsentLessons = countOverallAbsenceLessons(attendanceInfo.payload, halfWindow);
      let absentEntries = computeSubjectAbsences(
        attendanceInfo.payload,
        mergedClassbookData,
        subjectMap,
        halfWindow,
        absenceDiagnostics,
      );
      let totalEntries = computeSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
      let subjects = finalizeSubjectStats(absentEntries, totalEntries);
      let renderedAttendanceSummary = summarizeAttendance(subjects);
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
            mergedClassbookData,
            subjectMap,
            halfWindow,
            absenceDiagnostics,
          );
          totalEntries = computeSubjectTotals(mergedClassbookData, subjectMap, halfWindow);
          subjects = finalizeSubjectStats(absentEntries, totalEntries);
          renderedAttendanceSummary = summarizeAttendance(subjects);
        }
      }

      const summaryAbsent = renderedAttendanceSummary.absent > 0
        ? renderedAttendanceSummary.absent
        : expectedAbsentLessons;
      const attendanceSummary = {
        absent: summaryAbsent,
        total: renderedAttendanceSummary.total,
        percent: renderedAttendanceSummary.total > 0
          ? (summaryAbsent / renderedAttendanceSummary.total) * 100
          : Number.NaN,
      };
      const debug = {
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
        officialHalfSummary,
        absenceDiagnostics,
        rangedResponseInfo,
        chunkDiagnostics,
        anchoredDiagnostics,
        denseDiagnostics,
        subjects: summarizeSubjectsForDebug(subjects),
      };

      const stats = {
        version: GRADES_ATTENDANCE_CACHE_VERSION,
        fetchedAt: Date.now(),
        currentDate: halfWindow.currentDate,
        halfKey: halfWindow.halfKey,
        halfLabel: halfWindow.halfLabel,
        subjects,
        attendanceSummary,
        debug,
      };

      attendanceStatsCache = stats;
      window.__eeGradesAttendanceDebug = debug;
      debugLog("Final attendance stats", debug);
      if (attendanceSummary.total < 100 || debug.mergedDateCount <= embeddedDateCount) {
        console.warn("[Edupage Extras] Grades attendance diagnostic", debug);
      }
      if (attendanceSummary.total >= 100) {
        await writeCachedAttendanceStats(stats);
      }
      return stats;
    })()
      .catch((error) => {
        debugWarn("Could not load grades attendance stats.", error);
        console.warn("[Edupage Extras] Could not load grades attendance stats.", error);
        throw error;
      })
      .finally(() => {
        attendanceStatsPromise = null;
      });

    return attendanceStatsPromise;
  }

  function enhanceGradesTable() {
    const table = document.querySelector("table.znamkyTable");
    if (!table) return;

    markInternalMutation();
    injectStyles();

    if (gradesAttendanceEnabled) {
      ensureAttendanceColumns(table);
    } else {
      clearSubjectAttendance(table);
    }

    if (gradeBadgesEnabled) {
      const averages = collectAverages(table);
      const averageSignature = buildAverageRenderSignature(averages);
      const summarySignature = buildSummaryRenderSignature(
        averageSignature,
        gradesAttendanceEnabled,
        null,
      );
      if (
        table.getAttribute(AVERAGE_RENDER_SIGNATURE_ATTR) !== averageSignature
        || table.querySelector("tr.ee-overall-row")?.dataset.eeSignature !== summarySignature
      ) {
        ensureSummaryRow(
          table,
          averages,
          summarySignature,
          { attendanceColumns: gradesAttendanceEnabled, attendanceSummary: null },
        );
        table.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, averageSignature);
      }
    } else {
      restoreAverageCells(table);
    }

    if (!gradesAttendanceEnabled) {
      clearSubjectAttendance(table);
      return;
    }

    const loadToken = ++attendanceLoadToken;
    loadSubjectAttendanceStats()
      .then((data) => {
        if (!gradesAttendanceEnabled || loadToken !== attendanceLoadToken) return;

        const liveTable = document.querySelector("table.znamkyTable");
        if (!liveTable) return;

        renderSubjectAttendance(liveTable, data);

        if (gradeBadgesEnabled) {
          const liveAverages = collectAverages(liveTable);
          const liveAverageSignature = buildAverageRenderSignature(liveAverages);
          const attendanceSummary = data.attendanceSummary || summarizeAttendance(data.subjects);
          ensureSummaryRow(
            liveTable,
            liveAverages,
            buildSummaryRenderSignature(liveAverageSignature, true, attendanceSummary),
            { attendanceColumns: true, attendanceSummary },
          );
          liveTable.setAttribute(AVERAGE_RENDER_SIGNATURE_ATTR, liveAverageSignature);
        }
      })
      .catch(() => {
        if (loadToken !== attendanceLoadToken) return;
        const liveTable = document.querySelector("table.znamkyTable");
        if (liveTable && gradesAttendanceEnabled) {
          populateAttendancePlaceholders(liveTable);
        }
      });
  }

  function scheduleEnhance() {
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(enhanceGradesTable, 160);
  }

  function initStorage() {
    chrome.storage.local.get([GRADE_BADGES_KEY, GRADES_ATTENDANCE_KEY, GRADES_ATTENDANCE_DEBUG_KEY], (result) => {
      gradeBadgesEnabled = result[GRADE_BADGES_KEY] === true;
      gradesAttendanceEnabled = result[GRADES_ATTENDANCE_KEY] !== false;
      gradesAttendanceDebugEnabled = result[GRADES_ATTENDANCE_DEBUG_KEY] === true;
      enhanceGradesTable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      let shouldEnhance = false;

      if (changes[GRADE_BADGES_KEY]) {
        gradeBadgesEnabled = changes[GRADE_BADGES_KEY].newValue === true;
        shouldEnhance = true;
      }

      if (changes[GRADES_ATTENDANCE_KEY]) {
        gradesAttendanceEnabled = changes[GRADES_ATTENDANCE_KEY].newValue !== false;
        shouldEnhance = true;
      }

      if (changes[GRADES_ATTENDANCE_DEBUG_KEY]) {
        gradesAttendanceDebugEnabled = changes[GRADES_ATTENDANCE_DEBUG_KEY].newValue === true;
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
