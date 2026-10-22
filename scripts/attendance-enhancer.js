(function () {
  "use strict";

  if (window.top !== window) return;

  const STYLE_ID = "ee-attendance-enhancer-style";
  const ATTENDANCE_PERCENTAGES_KEY = "attendancePercentagesEnabled";
  const HALFYEAR_START_KEY = "eeHalfyearStartDate";
  let observerTimer = null;
  let attendancePercentagesEnabled = true;
  let halfyearStartOverride = "";

  function t(key, substitutions) {
    try {
      return EE.getMessage(key, substitutions) || key;
    } catch (_) {
      return key;
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ee-attendance-stat {
        box-sizing: border-box;
      }

      .ee-attendance-stat-label,
      .ee-attendance-stat-detail {
        display: flex;
        align-items: center;
        min-height: 42px;
        padding: 6px 10px;
      }

      .ee-attendance-stat-label {
        justify-content: flex-end;
        font-weight: bold;
        white-space: pre-wrap;
      }

      .ee-attendance-stat-value {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        min-height: 42px;
        padding: 6px 8px;
        text-align: center;
        white-space: nowrap;
      }

      .ee-attendance-stat-value strong {
        font-size: 13px;
        line-height: 1.1;
      }

      .ee-attendance-stat-value small {
        color: #666;
        font-size: 11px;
        line-height: 1.1;
      }

      .ee-attendance-stat-current {
        background: rgba(62, 131, 184, 0.08);
        color: #1565c0;
        font-weight: bold;
      }

      .ee-attendance-stat-current small {
        color: inherit;
      }

      .ee-attendance-stat-detail {
        grid-column: span 4;
        color: #555;
        font-size: 12px;
        white-space: pre-wrap;
      }

      html.ee-dark .ee-attendance-stat-value small,
      html.ee-dark .ee-attendance-stat-detail {
        color: var(--ee-text-muted) !important;
      }

      html.ee-dark .ee-attendance-stat-current {
        background: rgba(137, 180, 250, 0.16) !important;
        color: var(--ee-link) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function parseDateOnly(value) {
    return EE.parseDateOnly(value);
  }

  function normalizeDateInput(value) {
    const text = String(value || "");
    return parseDateOnly(text) ? text : "";
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

  function extractObjectLiteral(text, marker) {
    return EE.extractObjectLiteral(text, marker);
  }

  function parseInlineAttendanceData() {
    const scripts = document.querySelectorAll("script:not([src])");

    for (const script of scripts) {
      const text = script.textContent || "";
      if (!text.includes("\"halfStats\":")) continue;

      try {
        const halfStatsText = extractObjectLiteral(text, "\"halfStats\":");
        if (!halfStatsText) continue;

        const halvesText = extractObjectLiteral(text, "\"halves\":");
        const halfStats = JSON.parse(halfStatsText);
        const halves = halvesText ? JSON.parse(halvesText) : { "1": "1. Polrok", "2": "2. Polrok" };
        const turnoverMatch = text.match(/"year_turnover":"(\d{4}-\d{2}-\d{2})"/);
        const selectedYearMatch = text.match(/"selectedYear":(\d{4})/);

        return {
          halfStats,
          halves,
          yearTurnover: turnoverMatch?.[1] || null,
          selectedYear: selectedYearMatch ? Number.parseInt(selectedYearMatch[1], 10) : null,
        };
      } catch (error) {
        console.warn("[Edupage Extras] Could not parse attendance half stats.", error);
      }
    }

    return null;
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function computeHalfStats(rawHalfStats) {
    // Slovak schools (and EduPage's own reports) compute absence % as
    //   absent / (present + absent)
    // i.e. school-authorized "distant" lessons (trips, competitions, sick-bay,
    // etc.) are excluded from the denominator. The previous version included
    // `distant` in the denominator, which made our percentage smaller than the
    // school's. attendedTotal is the denominator used for %; recordedTotal is
    // only used to know whether any data exists for the half at all.
    return Object.fromEntries(
      Object.entries(rawHalfStats || {}).map(([key, values]) => {
        const present = numberValue(values?.present);
        const distant = numberValue(values?.distant);
        const absent = numberValue(values?.absent);
        const attendedTotal = present + absent;
        const recordedTotal = present + distant + absent;
        return [key, {
          present,
          distant,
          absent,
          attendedTotal,
          recordedTotal,
          // Kept for backward compatibility with anything that read .total
          // before; equals the new attendedTotal denominator.
          total: attendedTotal,
          percent: attendedTotal > 0 ? (absent / attendedTotal) * 100 : NaN,
        }];
      }),
    );
  }

  function resolveCurrentHalfKey(payload, computedHalves, secondHalfOverride) {
    const availableKeys = Object.keys(computedHalves || {});
    if (availableKeys.length === 0) return null;

    const now = new Date();
    const turnoverDate = parseDateOnly(payload?.yearTurnover);

    let preferredKey = null;

    if (turnoverDate) {
      const secondHalfStart = resolveSecondHalfStartDate(turnoverDate, secondHalfOverride);
      const nextTurnover = new Date(turnoverDate.getFullYear() + 1, turnoverDate.getMonth(), turnoverDate.getDate());

      if (now >= turnoverDate && now < secondHalfStart) {
        preferredKey = "1";
      } else if (now >= secondHalfStart && now < nextTurnover) {
        preferredKey = "2";
      }
    } else if (Number.isInteger(payload?.selectedYear)) {
      const firstHalfStart = new Date(payload.selectedYear, 8, 1);
      const secondHalfStart = new Date(payload.selectedYear + 1, 1, 1);
      const nextSchoolYear = new Date(payload.selectedYear + 1, 8, 1);

      if (now >= firstHalfStart && now < secondHalfStart) {
        preferredKey = "1";
      } else if (now >= secondHalfStart && now < nextSchoolYear) {
        preferredKey = "2";
      }
    }

    if (!preferredKey) {
      preferredKey = now.getMonth() >= 1 && now.getMonth() <= 7 ? "2" : "1";
    }

    if (computedHalves[preferredKey]?.recordedTotal > 0) {
      return preferredKey;
    }

    const populatedKey = availableKeys
      .filter((key) => computedHalves[key]?.recordedTotal > 0)
      .sort((left, right) => Number.parseInt(right, 10) - Number.parseInt(left, 10))[0];

    return populatedKey || preferredKey || availableKeys[0];
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "-";

    const formatter = new Intl.NumberFormat(document.documentElement.lang || navigator.language || "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatter.format(value)} %`;
  }

  function createSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    if (text !== undefined) {
      span.textContent = text;
    }
    return span;
  }

  function createValueCell(data, highlight, addLeftBorder, label) {
    const cell = createSpan("ee-attendance-stat ee-attendance-stat-value");
    if (highlight) {
      cell.classList.add("ee-attendance-stat-current");
    }

    cell.style.borderTopWidth = "1px";
    if (addLeftBorder) {
      cell.style.borderLeftWidth = "1px";
    }

    const attended = numberValue(data?.attendedTotal);
    const distant = numberValue(data?.distant);
    const hasAttended = attended > 0;

    const strong = document.createElement("strong");
    strong.textContent = hasAttended ? formatPercent(data.percent) : "-";

    const small = document.createElement("small");
    small.textContent = t("attHoursShort", [String(data.absent), String(attended)]);

    cell.append(strong, small);

    const tooltipParts = [
      t("attTooltipAbsent", [label, String(data.absent), String(attended)]),
    ];
    if (distant > 0) {
      tooltipParts.push(t("attTooltipDistant", [String(distant)]));
    }
    cell.title = tooltipParts.join("\n");
    return cell;
  }

  function findAttendanceTable() {
    return Array.from(document.querySelectorAll("table.dash_dochadzka")).find((table) =>
      table.querySelector("tbody div.grid"),
    ) || null;
  }

  function findSummaryGrid(table) {
    const bodies = Array.from(table.querySelectorAll("tbody"));

    for (const body of bodies) {
      const firstRow = body.querySelector("tr");
      const label = firstRow?.textContent;
      if (normalizeText(label) === "suhrn") {
        return body.querySelector("div.grid");
      }
    }

    return null;
  }

  function clearInjectedStats(grid) {
    grid.querySelectorAll(".ee-attendance-stat").forEach((element) => element.remove());
  }

  function renderAttendancePercentages(grid, halves, computedHalves, currentHalfKey) {
    clearInjectedStats(grid);

    const firstHalf = computedHalves["1"] || { absent: 0, total: 0, percent: NaN };
    const secondHalf = computedHalves["2"] || { absent: 0, total: 0, percent: NaN };
    const currentHalfLabel = halves?.[currentHalfKey] || t("attHalfFallback", [String(currentHalfKey)]);

    const labelCell = createSpan("ee-attendance-stat ee-attendance-stat-label", t("attAbsencePercentLabel"));
    labelCell.style.borderTopWidth = "1px";

    const firstValueCell = createValueCell(firstHalf, currentHalfKey === "1", true, halves?.["1"] || t("attHalfFallback", ["1"]));
    const secondValueCell = createValueCell(secondHalf, currentHalfKey === "2", false, halves?.["2"] || t("attHalfFallback", ["2"]));

    const detailCell = createSpan(
      "ee-attendance-stat ee-attendance-stat-detail",
      t("attCurrentHalf", [currentHalfLabel]),
    );
    detailCell.style.borderTopWidth = "1px";
    detailCell.title = t("attDetailFormula");

    grid.append(labelCell, firstValueCell, secondValueCell, detailCell);
  }

  function enhanceAttendanceTable() {
    try {
      const table = findAttendanceTable();
      if (!table) return;

      const summaryGrid = findSummaryGrid(table);
      if (!summaryGrid) return;
      if (!attendancePercentagesEnabled) {
        clearInjectedStats(summaryGrid);
        return;
      }

      const payload = parseInlineAttendanceData();
      if (!payload?.halfStats) {
        clearInjectedStats(summaryGrid);
        return;
      }

      // Parent accounts with multiple children get one halfStats key per
      // child, and nothing on this page tells us which child the rendered
      // table belongs to — showing the wrong child's numbers would be worse
      // than showing none, so skip rather than guess.
      const studentIds = Object.keys(payload.halfStats);
      if (studentIds.length > 1) {
        clearInjectedStats(summaryGrid);
        return;
      }

      const studentId = studentIds[0];
      const rawHalfStats = payload.halfStats[studentId];
      if (!studentId || !rawHalfStats) {
        clearInjectedStats(summaryGrid);
        return;
      }

      const computedHalves = computeHalfStats(rawHalfStats);
      const currentHalfKey = resolveCurrentHalfKey(payload, computedHalves, halfyearStartOverride);
      if (!currentHalfKey) {
        clearInjectedStats(summaryGrid);
        return;
      }

      renderAttendancePercentages(summaryGrid, payload.halves, computedHalves, currentHalfKey);
    } catch (error) {
      console.warn("[Edupage Extras] Attendance enhancement failed.", error);
    }
  }

  function scheduleEnhance() {
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(enhanceAttendanceTable, 160);
  }

  function initObserver() {
    const observer = new MutationObserver(() => {
      if (document.querySelector("table.dash_dochadzka")) {
        scheduleEnhance();
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function initStorage() {
    chrome.storage.local.get([ATTENDANCE_PERCENTAGES_KEY, HALFYEAR_START_KEY], (result) => {
      attendancePercentagesEnabled = result[ATTENDANCE_PERCENTAGES_KEY] !== false;
      halfyearStartOverride = normalizeDateInput(result[HALFYEAR_START_KEY]);
      enhanceAttendanceTable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      let shouldEnhance = false;
      if (changes[ATTENDANCE_PERCENTAGES_KEY]) {
        attendancePercentagesEnabled = changes[ATTENDANCE_PERCENTAGES_KEY].newValue !== false;
        shouldEnhance = true;
      }
      if (changes[HALFYEAR_START_KEY]) {
        halfyearStartOverride = normalizeDateInput(changes[HALFYEAR_START_KEY].newValue);
        shouldEnhance = true;
      }
      if (!shouldEnhance) return;
      enhanceAttendanceTable();
    });
  }

  function init() {
    injectStyles();
    initStorage();
    initObserver();
  }

  // Deliberate test hook — see tests/attendance-enhancer.test.js.
  if (globalThis.__EE_TEST__) {
    globalThis.__eeTestExports = { parseDateOnly, normalizeDateInput, resolveSecondHalfStartDate, computeHalfStats };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => EE.withLanguageReady(init), { once: true });
  } else {
    EE.withLanguageReady(init);
  }
})();
