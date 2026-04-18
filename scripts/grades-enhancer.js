/**
 * grades-enhancer.js
 *
 * Enhances the Edupage /znamky/ table in-place:
 * - average badges and bars
 * - absence summary on the attendance page
 */

(function () {
  "use strict";

  const STYLE_ID = "ee-grades-enhancer-style";
  const PROCESSED_ATTR = "data-ee-enhanced";
  const GRADE_BADGES_KEY = "gradeBadgesEnabled";
  const ABSENCE_COLUMNS_KEY = "absenceColumnsEnabled";
  const ABSENCE_DATA_KEY = "absenceData";
  const ABSENCE_DATA_VERSION = 2;
  const DASH = "-";
  const ABSENCE_SUMMARY_ID = "ee-absence-summary";

  let absenceData = null;
  let absenceColumnsEnabled = false;
  let gradeBadgesEnabled = true;
  let scriptExtractionAttempts = 0;

  function parseAverage(text) {
    if (!text) return NaN;
    const match = text.trim().match(/^(\d+(?:[.,]\d+)?)/);
    return match ? Number.parseFloat(match[1].replace(",", ".")) : NaN;
  }

  function gradeColor(avg) {
    if (Number.isNaN(avg)) return "#888";
    if (avg <= 1.5) return "#2e7d32";
    if (avg <= 2.5) return "#558b2f";
    if (avg <= 3.5) return "#f57f17";
    if (avg <= 4.5) return "#e65100";
    return "#c62828";
  }

  function absenceColor(percent) {
    if (percent === null || Number.isNaN(percent)) return "#a6adc8";
    if (percent < 10) return "#2e7d32";
    if (percent <= 20) return "#f57f17";
    return "#c62828";
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return DASH;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return DASH;
    return `${value.toFixed(1)}%`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isAttendancePage() {
    const href = window.location.href;
    return href.includes("mode=attendance")
      || href.includes("bW9kZT1hdHRlbmRhbmNl")
      || Array.from(document.scripts).some((script) => (script.textContent || "").includes("/dashboard/dochadzka.js#initZiak"));
  }

  function readBalancedObject(source, startIndex) {
    let depth = 0;
    let inString = false;
    let quote = "";
    let escaped = false;

    for (let index = startIndex; index < source.length; index += 1) {
      const char = source[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        quote = char;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return source.slice(startIndex, index + 1);
        }
      }
    }

    return "";
  }

  function parseJsonObject(source) {
    try {
      return JSON.parse(source);
    } catch (error) {
      return null;
    }
  }

  function findAttendancePayload(source) {
    let cursor = 0;

    while (cursor < source.length) {
      const markerIndex = source.indexOf("return f(", cursor);
      if (markerIndex === -1) return null;

      const objectStart = source.indexOf("{", markerIndex);
      if (objectStart === -1) return null;

      const parsed = parseJsonObject(readBalancedObject(source, objectStart));
      if (parsed && parsed.students) {
        return parsed;
      }

      cursor = markerIndex + 9;
    }

    return null;
  }

  function findSubjectCatalog(source) {
    let cursor = 0;

    while (cursor < source.length) {
      const index = source.indexOf('"subjects"', cursor);
      if (index === -1) return {};

      const colonIndex = source.indexOf(":", index);
      const objectStart = source.indexOf("{", colonIndex);
      if (objectStart === -1) return {};

      const parsed = parseJsonObject(readBalancedObject(source, objectStart));
      if (parsed && !Array.isArray(parsed) && Object.values(parsed).some((item) => item && (item.name || item.short || item.nazov))) {
        return parsed;
      }

      cursor = index + 10;
    }

    return {};
  }

  function shouldCountAbsence(record, absentTypes) {
    const typeId = String(record.studentabsent_typeid || "");
    const type = absentTypes[typeId] || {};
    const label = normalizeName(`${type.name || ""} ${type.short || ""}`);

    if (typeId === "-1" || /neospraved/.test(label)) return true;
    if (typeId === "-2" || /ospraved/.test(label)) return true;
    return false;
  }

  function isUnexcused(record, absentTypes) {
    const typeId = String(record.studentabsent_typeid || "");
    const type = absentTypes[typeId] || {};
    return typeId === "-1" || /neospraved/.test(normalizeName(`${type.name || ""} ${type.short || ""}`));
  }

  function addSubjectStats(map, subjectName, patch) {
    const subjectKey = normalizeName(subjectName);
    if (!subjectKey) return;

    const current = map.get(subjectKey) || {
      subject: subjectName,
      subjectKey,
      aliases: [],
      absences: 0,
      lessons: 0,
      excused: 0,
      unexcused: 0,
    };

    if (Array.isArray(patch.aliases)) {
      patch.aliases.forEach((alias) => {
        const normalizedAlias = normalizeName(alias);
        if (normalizedAlias && !current.aliases.includes(normalizedAlias)) {
          current.aliases.push(normalizedAlias);
        }
      });
    }
    current.absences += patch.absences || 0;
    current.lessons += patch.lessons || 0;
    current.excused += patch.excused || 0;
    current.unexcused += patch.unexcused || 0;
    map.set(subjectKey, current);
  }

  function subjectInfoForId(subjectId, subjectCatalog) {
    const raw = String(subjectId || "").trim();
    if (!raw) return null;

    const subject = subjectCatalog[raw];
    if (subject && (subject.name || subject.short || subject.nazov)) {
      return {
        name: subject.name || subject.nazov || subject.short,
        aliases: [subject.name, subject.nazov, subject.short, raw].filter(Boolean),
      };
    }

    return Number.isNaN(Number(raw)) ? { name: raw, aliases: [raw] } : null;
  }

  function collectLessonCounts(parentLabels, subjectCatalog, statsBySubject) {
    if (!isPlainObject(parentLabels)) return;

    Object.values(parentLabels).forEach((day) => {
      if (!day || !Array.isArray(day.subjects)) return;

      day.subjects.forEach((periodSubjects) => {
        if (!Array.isArray(periodSubjects)) return;

        periodSubjects.forEach((subjectId) => {
          const subjectInfo = subjectInfoForId(subjectId, subjectCatalog);
          if (subjectInfo) {
            addSubjectStats(statsBySubject, subjectInfo.name, {
              lessons: 1,
              aliases: subjectInfo.aliases,
            });
          }
        });
      });
    });
  }

  function overallStats(payload) {
    if (!isPlainObject(payload?.stats)) return null;

    const stats = Object.values(payload.stats).find((item) => item && (item.present !== undefined || item.absent !== undefined));
    if (!stats) return null;

    const present = Number(stats.present) || 0;
    const absent = Number(stats.absent) || 0;
    const excused = Number(stats.excused) || 0;
    const unexcused = Number(stats.unexcused) || 0;
    const total = present + absent;
    if (!total && !absent) return null;

    return {
      totalAbsences: absent,
      totalLessons: total,
      excused,
      unexcused,
      overallPercent: total > 0 ? Math.round((absent / total) * 1000) / 10 : null,
    };
  }

  function buildAbsenceDataFromPayload(payload, subjectCatalog) {
    if (!payload || !isPlainObject(payload.students)) return null;

    const statsBySubject = new Map();
    const absentTypes = payload.studentabsent_types || {};

    collectLessonCounts(payload.parentLabels, subjectCatalog, statsBySubject);

    Object.values(payload.students).forEach((studentDays) => {
      if (!isPlainObject(studentDays)) return;

      Object.values(studentDays).forEach((dayRecords) => {
        if (!isPlainObject(dayRecords)) return;

        Object.values(dayRecords).forEach((record) => {
          if (!record || typeof record !== "object" || record.presence !== "A") return;
          if (!shouldCountAbsence(record, absentTypes)) return;

          const subjectInfo = subjectInfoForId(record.subjectid, subjectCatalog);
          if (!subjectInfo) return;

          const unexcused = isUnexcused(record, absentTypes) ? 1 : 0;
          addSubjectStats(statsBySubject, subjectInfo.name, {
            absences: 1,
            aliases: subjectInfo.aliases,
            excused: unexcused ? 0 : 1,
            unexcused,
          });
        });
      });
    });

    const rawSubjects = Array.from(statsBySubject.values());
    const totalAbsences = rawSubjects.reduce((sum, subject) => sum + subject.absences, 0);
    const totalLessonsFromLabels = rawSubjects.reduce((sum, subject) => sum + subject.lessons, 0);
    const stats = overallStats(payload);
    const labelsOnlyCoverAbsenceDays = stats?.totalLessons && totalLessonsFromLabels > 0 && stats.totalLessons > totalLessonsFromLabels * 2;

    const subjects = rawSubjects.map((subject) => ({
      ...subject,
      lessons: labelsOnlyCoverAbsenceDays ? 0 : subject.lessons,
      percent: !labelsOnlyCoverAbsenceDays && subject.lessons > 0
        ? Math.round((subject.absences / subject.lessons) * 1000) / 10
        : null,
    }));

    const totalLessons = stats?.totalLessons || totalLessonsFromLabels;
    const summaryAbsences = stats?.totalAbsences || totalAbsences;

    return {
      subjects,
      totalAbsences: summaryAbsences,
      totalLessons,
      overallPercent: stats?.overallPercent ?? (totalLessons > 0 ? Math.round((summaryAbsences / totalLessons) * 1000) / 10 : null),
    };
  }

  function extractAbsenceDataFromSource(source) {
    if (!source || !source.includes("/dashboard/dochadzka.js#initZiak") || !source.includes('"students"')) {
      return null;
    }

    const subjectCatalog = findSubjectCatalog(source);
    const payload = findAttendancePayload(source);
    return buildAbsenceDataFromPayload(payload, subjectCatalog);
  }

  function extractAbsenceDataFromScripts() {
    if (absenceData || scriptExtractionAttempts >= 8) return;
    scriptExtractionAttempts += 1;

    const scripts = Array.from(document.scripts)
      .map((script) => script.textContent || "")
      .filter((text) => text.includes("/dashboard/dochadzka.js#initZiak") && text.includes('"students"'));

    for (const text of scripts) {
      const parsedAbsenceData = extractAbsenceDataFromSource(text);

      if (parsedAbsenceData && saveAbsenceData({ ...parsedAbsenceData, source: "embedded-script" })) {
        return;
      }
    }
  }

  function saveAbsenceData(data) {
    if (!data || !Array.isArray(data.subjects) || data.subjects.length === 0) return false;
    absenceData = {
      ...data,
      version: ABSENCE_DATA_VERSION,
    };
    chrome.storage.local.set({
      [ABSENCE_DATA_KEY]: {
        ...absenceData,
        cachedAt: Date.now(),
        source: data.source || "attendance-page",
      },
    });
    return true;
  }

  function buildBadgeHtml(avg, displayText) {
    if (Number.isNaN(avg)) return "";
    const color = gradeColor(avg);
    const pct = Math.max(4, Math.min(100, ((5 - avg) / 4) * 96 + 4));
    return `
      <div class="ee-avg-badge" style="--avg-color:${color};--avg-pct:${pct.toFixed(1)}%">
        <span class="ee-avg-value">${displayText}</span>
        <div class="ee-avg-bar-track"><div class="ee-avg-bar-fill"></div></div>
      </div>`;
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

      .ee-absence-header,
      .ee-absence-count-cell,
      .ee-absence-percent-cell {
        min-width: 74px !important;
        text-align: right !important;
        white-space: nowrap !important;
      }

      .ee-absence-pill {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        min-width: 42px;
        color: var(--absence-color);
        font-size: 13px;
        font-weight: 700;
      }

      .ee-absence-meta {
        display: block;
        color: #777;
        font-size: 10px;
        line-height: 1.1;
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

      table.znamkyTable tr.predmetRow:hover .ee-avg-value {
        text-decoration: underline dotted;
      }

      table.znamkyTable th:last-of-type,
      table.znamkyTable .znPriemerCell {
        min-width: 64px !important;
      }

      html.ee-dark .ee-absence-meta {
        color: #a6adc8 !important;
      }

      .ee-absence-summary {
        margin: 12px auto;
        max-width: 980px;
        border: 1px solid #d8dee9;
        border-radius: 8px;
        background: #ffffff;
        color: #1f2937;
        font-family: Arial, sans-serif;
        padding: 12px;
      }

      .ee-absence-summary h2 {
        margin: 0 0 8px;
        color: #1565c0;
        font-size: 17px;
      }

      .ee-absence-summary-overview {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }

      .ee-absence-summary-stat {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 8px 10px;
      }

      .ee-absence-summary-stat strong {
        display: block;
        color: #111827;
        font-size: 18px;
      }

      .ee-absence-summary-stat span {
        color: #6b7280;
        font-size: 12px;
      }

      .ee-absence-summary-table {
        border-collapse: collapse;
        width: 100%;
      }

      .ee-absence-summary-table th,
      .ee-absence-summary-table td {
        border-top: 1px solid #e5e7eb;
        padding: 7px 8px;
        text-align: right;
      }

      .ee-absence-summary-table th:first-child,
      .ee-absence-summary-table td:first-child {
        text-align: left;
      }

      html.ee-dark .ee-absence-summary {
        background: var(--ee-bg-raised) !important;
        border-color: var(--ee-border) !important;
        color: var(--ee-text-main) !important;
      }

      html.ee-dark .ee-absence-summary h2 {
        color: var(--ee-accent) !important;
      }

      html.ee-dark .ee-absence-summary-stat,
      html.ee-dark .ee-absence-summary-table th,
      html.ee-dark .ee-absence-summary-table td {
        border-color: var(--ee-border) !important;
      }

      html.ee-dark .ee-absence-summary-stat strong,
      html.ee-dark .ee-absence-summary-stat span {
        color: var(--ee-text-main) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeAbsenceColumns(table) {
    table
      .querySelectorAll(".ee-absence-header, .ee-absence-count-cell, .ee-absence-percent-cell")
      .forEach((cell) => cell.remove());
  }

  function enhanceAverageCell(row, averages) {
    const priemerCell = row.querySelector(".znPriemerCell");
    if (!priemerCell || priemerCell.querySelector(".ee-avg-badge")) return;

    const link = priemerCell.querySelector("a");
    const rawText = (link ? link.textContent : priemerCell.textContent).trim();
    if (!rawText) return;
    priemerCell.dataset.eeOriginalAverage = rawText;

    const avg = parseAverage(rawText);
    if (!Number.isNaN(avg)) averages.push(avg);

    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildBadgeHtml(avg, rawText);
    const badge = wrapper.firstElementChild;
    if (!badge) return;

    if (link) {
      link.textContent = "";
      link.appendChild(badge);
    } else {
      priemerCell.textContent = "";
      priemerCell.appendChild(badge);
    }
  }

  function renderAbsenceCells(table) {
    removeAbsenceColumns(table);
    updateSummaryColspan(table);
  }

  function restoreAverageCells(table) {
    table.querySelectorAll(".znPriemerCell").forEach((priemerCell) => {
      const originalText = priemerCell.dataset.eeOriginalAverage;
      const badge = priemerCell.querySelector(".ee-avg-badge");
      if (!originalText || !badge) return;

      const link = priemerCell.querySelector("a");
      if (link) {
        link.textContent = originalText;
      } else {
        priemerCell.textContent = originalText;
      }
      delete priemerCell.dataset.eeOriginalAverage;
    });
    table.querySelector("tr.ee-overall-row")?.remove();
    table.removeAttribute(PROCESSED_ATTR);
  }

  function updateSummaryColspan(table) {
    const summaryRow = table.querySelector("tr.ee-overall-row");
    const labelCell = summaryRow?.querySelector("td");
    if (!labelCell) return;

    const headerRow = table.querySelector("thead tr");
    const colCount = headerRow
      ? Array.from(headerRow.cells).reduce((sum, cell) => sum + (Number.parseInt(cell.colSpan, 10) || 1), 0)
      : Math.max(5, table.querySelector("tr")?.cells.length || 5);

    labelCell.colSpan = Math.max(1, colCount - 2);
  }

  function ensureSummaryRow(table, averages) {
    if (table.querySelector("tr.ee-overall-row") || averages.length === 0) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const headerRow = table.querySelector("thead tr");
    const colCount = headerRow
      ? Array.from(headerRow.cells).reduce((sum, cell) => sum + (Number.parseInt(cell.colSpan, 10) || 1), 0)
      : Math.max(5, table.querySelector("tr")?.cells.length || 5);

    const overallAvg = averages.reduce((a, b) => a + b, 0) / averages.length;
    const overallColor = gradeColor(overallAvg);
    const overallPct = Math.max(4, Math.min(100, ((5 - overallAvg) / 4) * 96 + 4));

    const summaryRow = document.createElement("tr");
    summaryRow.className = "ee-overall-row";

    const labelCell = document.createElement("td");
    labelCell.className = "fixedCell";
    labelCell.colSpan = Math.max(1, colCount - 2);
    labelCell.innerHTML = `
      <span class="ee-overall-label">Overall</span>
      <span class="ee-absence-meta">${averages.length} subjects</span>
    `;

    const avgCell = document.createElement("td");
    avgCell.colSpan = 2;
    avgCell.style.cssText = "text-align:right;padding:8px 10px;";
    avgCell.innerHTML = `
      <div class="ee-avg-badge" style="--avg-color:${overallColor};--avg-pct:${overallPct.toFixed(1)}%">
        <span class="ee-avg-value" style="font-size:17px;">${overallAvg.toFixed(2)}</span>
        <div class="ee-avg-bar-track"><div class="ee-avg-bar-fill"></div></div>
      </div>`;

    summaryRow.appendChild(labelCell);
    summaryRow.appendChild(avgCell);
    tbody.appendChild(summaryRow);
  }

  function enhanceGradesTable() {
    const table = document.querySelector("table.znamkyTable");
    if (!table) return;

    injectStyles();

    if (!gradeBadgesEnabled) {
      restoreAverageCells(table);
      renderAbsenceCells(table);
      return;
    }

    const averages = [];
    table.querySelectorAll("tr.predmetRow").forEach((row) => enhanceAverageCell(row, averages));
    ensureSummaryRow(table, averages);
    table.setAttribute(PROCESSED_ATTR, "1");
    renderAbsenceCells(table);
  }

  function removeAbsenceSummary() {
    document.getElementById(ABSENCE_SUMMARY_ID)?.remove();
  }

  function renderAbsencePageSummary() {
    if (!absenceColumnsEnabled || !isAttendancePage()) {
      removeAbsenceSummary();
      return;
    }

    extractAbsenceDataFromScripts();
    if (!absenceData) return;

    injectStyles();
    const subjects = [...absenceData.subjects]
      .filter((subject) => subject.absences > 0 || subject.lessons > 0)
      .sort((left, right) => right.absences - left.absences || left.subject.localeCompare(right.subject));
    const signature = JSON.stringify({
      totalAbsences: absenceData.totalAbsences,
      totalLessons: absenceData.totalLessons,
      overallPercent: absenceData.overallPercent,
      subjects: subjects.map((subject) => [
        subject.subject,
        subject.absences,
        subject.lessons,
        subject.percent,
      ]),
    });

    const rows = subjects.map((subject) => {
      const color = absenceColor(subject.percent);
      return `
        <tr>
          <td>${escapeHtml(subject.subject)}</td>
          <td><span class="ee-absence-pill" style="--absence-color:${color}">${formatNumber(subject.absences)}</span></td>
          <td>${formatNumber(subject.lessons)}</td>
          <td><span class="ee-absence-pill" style="--absence-color:${color}">${formatPercent(subject.percent)}</span></td>
        </tr>`;
    }).join("");

    const panel = document.getElementById(ABSENCE_SUMMARY_ID) || document.createElement("section");
    if (panel.dataset.signature === signature) return;

    panel.id = ABSENCE_SUMMARY_ID;
    panel.className = "ee-absence-summary";
    panel.dataset.signature = signature;
    panel.innerHTML = `
      <h2>Absence summary</h2>
      <div class="ee-absence-summary-overview">
        <div class="ee-absence-summary-stat"><strong>${formatNumber(absenceData.totalAbsences)}</strong><span>Total absences</span></div>
        <div class="ee-absence-summary-stat"><strong>${formatNumber(absenceData.totalLessons)}</strong><span>Total lessons</span></div>
        <div class="ee-absence-summary-stat"><strong>${formatPercent(absenceData.overallPercent)}</strong><span>Overall absence rate</span></div>
      </div>
      <table class="ee-absence-summary-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Absences</th>
            <th>Lessons</th>
            <th>Absence %</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4">No subject absence data found.</td></tr>'}</tbody>
      </table>
    `;

    const mount = document.querySelector("#eb_main_content, .userContentInner, .skinContent, main") || document.body;
    if (!panel.isConnected) {
      mount.insertBefore(panel, mount.firstChild);
    }
  }

  function initStorage() {
    chrome.storage.local.get([GRADE_BADGES_KEY, ABSENCE_COLUMNS_KEY, ABSENCE_DATA_KEY], (result) => {
      gradeBadgesEnabled = result[GRADE_BADGES_KEY] !== false;
      absenceColumnsEnabled = result[ABSENCE_COLUMNS_KEY] === true;
      if (result[ABSENCE_DATA_KEY]?.version === ABSENCE_DATA_VERSION) {
        absenceData = result[ABSENCE_DATA_KEY];
      } else if (result[ABSENCE_DATA_KEY]) {
        chrome.storage.local.remove(ABSENCE_DATA_KEY);
      }
      enhanceGradesTable();
      renderAbsencePageSummary();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes[ABSENCE_COLUMNS_KEY] && !changes[GRADE_BADGES_KEY]) return;
      if (changes[GRADE_BADGES_KEY]) {
        gradeBadgesEnabled = changes[GRADE_BADGES_KEY].newValue !== false;
      }
      if (changes[ABSENCE_COLUMNS_KEY]) {
        absenceColumnsEnabled = changes[ABSENCE_COLUMNS_KEY].newValue === true;
      }
      enhanceGradesTable();
      renderAbsencePageSummary();
    });
  }

  function initMessages() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (!event.data || event.data.source !== "edupage-extras" || event.data.type !== "ee-absence-data") return;
      if (saveAbsenceData(event.data.data)) {
        enhanceGradesTable();
        renderAbsencePageSummary();
      }
    });
  }

  function initObserver() {
    const observer = new MutationObserver(() => {
      if (document.querySelector("table.znamkyTable")) {
        enhanceGradesTable();
      }
      renderAbsencePageSummary();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function init() {
    injectStyles();
    initStorage();
    initMessages();
    enhanceGradesTable();
    renderAbsencePageSummary();
    initObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
