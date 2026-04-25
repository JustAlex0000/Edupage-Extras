(function () {
  "use strict";

  if (window.top !== window) return;

  const STYLE_ID = "ee-attendance-enhancer-style";
  const ATTENDANCE_PERCENTAGES_KEY = "attendancePercentagesEnabled";
  let observerTimer = null;
  let attendancePercentagesEnabled = true;

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
        color: var(--ee-accent) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
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

  function extractObjectLiteral(text, marker) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) return null;

    const startIndex = text.indexOf("{", markerIndex + marker.length);
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
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
        } else if (character === "\"") {
          inString = false;
        }
        continue;
      }

      if (character === "\"") {
        inString = true;
        continue;
      }

      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

    return null;
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
    return Object.fromEntries(
      Object.entries(rawHalfStats || {}).map(([key, values]) => {
        const present = numberValue(values?.present);
        const distant = numberValue(values?.distant);
        const absent = numberValue(values?.absent);
        const total = present + distant + absent;
        return [key, {
          present,
          distant,
          absent,
          total,
          percent: total > 0 ? (absent / total) * 100 : NaN,
        }];
      }),
    );
  }

  function resolveCurrentHalfKey(payload, computedHalves) {
    const availableKeys = Object.keys(computedHalves || {});
    if (availableKeys.length === 0) return null;

    const now = new Date();
    const turnoverDate = parseDateOnly(payload?.yearTurnover);

    let preferredKey = null;

    if (turnoverDate) {
      const secondHalfStart = new Date(
        turnoverDate.getFullYear(),
        turnoverDate.getMonth() + 5,
        1,
      );
      const nextTurnover = new Date(
        turnoverDate.getFullYear() + 1,
        turnoverDate.getMonth(),
        turnoverDate.getDate(),
      );

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

    if (computedHalves[preferredKey]?.total > 0) {
      return preferredKey;
    }

    const populatedKey = availableKeys
      .filter((key) => computedHalves[key]?.total > 0)
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

    const strong = document.createElement("strong");
    strong.textContent = data.total > 0 ? formatPercent(data.percent) : "-";

    const small = document.createElement("small");
    small.textContent = `${data.absent}/${data.total} hod.`;

    cell.append(strong, small);
    cell.title = `${label}: ${data.absent} / ${data.total} lessons absent`;
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
    const currentHalfLabel = halves?.[currentHalfKey] || `${currentHalfKey}. Polrok`;

    const labelCell = createSpan("ee-attendance-stat ee-attendance-stat-label", "Absencia %");
    labelCell.style.borderTopWidth = "1px";

    const firstValueCell = createValueCell(firstHalf, currentHalfKey === "1", true, halves?.["1"] || "1. Polrok");
    const secondValueCell = createValueCell(secondHalf, currentHalfKey === "2", false, halves?.["2"] || "2. Polrok");

    const detailCell = createSpan(
      "ee-attendance-stat ee-attendance-stat-detail",
      `Aktualny polrok: ${currentHalfLabel}`,
    );
    detailCell.style.borderTopWidth = "1px";
    detailCell.title = "Formula: absent / (present + distant + absent)";

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

      const studentId = Object.keys(payload.halfStats)[0];
      const rawHalfStats = payload.halfStats[studentId];
      if (!studentId || !rawHalfStats) {
        clearInjectedStats(summaryGrid);
        return;
      }

      const computedHalves = computeHalfStats(rawHalfStats);
      const currentHalfKey = resolveCurrentHalfKey(payload, computedHalves);
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
    chrome.storage.local.get([ATTENDANCE_PERCENTAGES_KEY], (result) => {
      attendancePercentagesEnabled = result[ATTENDANCE_PERCENTAGES_KEY] !== false;
      enhanceAttendanceTable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[ATTENDANCE_PERCENTAGES_KEY]) return;
      attendancePercentagesEnabled = changes[ATTENDANCE_PERCENTAGES_KEY].newValue !== false;
      enhanceAttendanceTable();
    });
  }

  function init() {
    injectStyles();
    initStorage();
    enhanceAttendanceTable();
    initObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
