/**
 * grades-export.js
 *
 * .json/.csv/.txt export of the grades table (added in #25), plus the
 * toolbar button row that triggers each download.
 */

(function () {
  "use strict";

  const GE = (window.__eeGrades = window.__eeGrades || {});

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
      const value = GE.parseAverage(rawText);
      return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
    }
    function buildGradesJsonPayload(table) {
      const withAttendance = GE.state.gradesAttendanceEnabled;
      const subjects = [];

      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const name = GE.attendance.readPrimaryRowSubjectText(row);
        if (!name) return;

        const priemerCell = row.querySelector(".znPriemerCell");
        const rawAverage = (priemerCell?.dataset.eeOriginalAverage || GE.readAverageText(priemerCell) || "").trim();
        const averageNumber = readSubjectAverageNumber(rawAverage);
        const scale = GE.detectAverageScale(rawAverage, Number.isFinite(averageNumber) ? averageNumber : Number.NaN);

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
      link.download = `edupage-grades-${GE.formatDateISO(new Date())}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // Per-grade rows for the .csv/.txt export: one row per grade cell, with
    // the same weight resolution the projection math uses (per-cell tooltip
    // weight first, then the category sub-row's "Váha udalosti" label, then 1).
    function collectGradeRowsForExport(table) {
      const rows = [];
      Array.from(table.querySelectorAll("tr.predmetRow")).forEach((row) => {
        const name = GE.attendance.readPrimaryRowSubjectText(row);
        if (!name) return;

        const priemerCell = row.querySelector(".znPriemerCell");
        const rawAverage = (priemerCell?.dataset.eeOriginalAverage || GE.readAverageText(priemerCell) || "").trim();

        const seen = new Set();
        [row, ...GE.virtual.findSubjectSubRows(row)].forEach((container) => {
          if (typeof container.querySelectorAll !== "function") return;
          const rowWeight = container === row ? null : GE.virtual.parseGradeWeight(container.textContent || "");
          container.querySelectorAll("span.tips").forEach((tip) => {
            if (seen.has(tip)) return;
            seen.add(tip);
            const valueEl = tip.querySelector(".znZnamka");
            if (!valueEl) return;
            const gradeValue = GE.normalizeWhitespace(valueEl.textContent || "");
            if (!gradeValue) return;

            const originalTitle = String(
              tip.getAttribute("data-ee-original-grade-title")
              || tip.getAttribute("original-title")
              || tip.getAttribute("title")
              || "",
            ).trim();
            const { title, detailHtml } = GE.badges.parseGradeTitleSegments(originalTitle);
            const dateMatch = GE.stripHtmlTags(detailHtml).match(/D[aá]tum zn[aá]mky:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i);
            const tooltipWeight = GE.virtual.parseGradeWeight(GE.stripHtmlTags(originalTitle));

            rows.push({
              subject: name,
              date: dateMatch?.[1] || "",
              grade: gradeValue,
              weight: tooltipWeight !== null ? tooltipWeight : (rowWeight !== null ? rowWeight : 1),
              title,
              average: rawAverage,
            });
          });
        });
      });
      return rows;
    }
    function buildGradesCsv(table) {
      const rows = [["subject", "date", "grade", "weight", "title", "average"]];
      collectGradeRowsForExport(table).forEach((entry) => {
        rows.push([entry.subject, entry.date, entry.grade, String(entry.weight), entry.title, entry.average]);
      });
      return "\ufeff" + rows.map((row) => row.map(EE.csvEscape).join(",")).join("\n") + "\n";
    }
    function buildGradesTxt(table) {
      const lines = [];
      lines.push(`Známky — ${GE.formatDateISO(new Date())}`);
      let currentSubject = null;
      collectGradeRowsForExport(table).forEach((entry) => {
        if (entry.subject !== currentSubject) {
          currentSubject = entry.subject;
          lines.push("");
          lines.push(`== ${entry.subject}${entry.average ? ` (⌀ ${entry.average})` : ""} ==`);
        }
        const date = entry.date ? `${entry.date}  ` : "";
        const weight = entry.weight !== 1 ? ` (w${entry.weight})` : "";
        lines.push(`  - ${date}${entry.grade}${weight}${entry.title ? ` — ${entry.title}` : ""}`);
      });
      return lines.join("\n") + "\n";
    }
    function downloadGradesFlat(table, format) {
      const stamp = GE.formatDateISO(new Date());
      if (format === "csv") {
        EE.downloadTextFile(`edupage-grades-${stamp}.csv`, "text/csv;charset=utf-8", buildGradesCsv(table));
      } else {
        EE.downloadTextFile(`edupage-grades-${stamp}.txt`, "text/plain;charset=utf-8", buildGradesTxt(table));
      }
    }
    function ensureCsvExportButton(table) {
      if (!table.parentElement) return;
      if (table.previousElementSibling?.classList?.contains("ee-grades-toolbar")) return;

      const toolbar = document.createElement("div");
      toolbar.className = "ee-grades-toolbar";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "ee-grades-export-btn";
      button.textContent = GE.t("gradesExportJson");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        downloadGradesJson(table);
      });

      toolbar.appendChild(button);

      [["csv", GE.t("gradesExportCsv")], ["txt", GE.t("gradesExportTxt")]].forEach(([format, label]) => {
        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.className = "ee-grades-export-btn";
        exportButton.textContent = label;
        exportButton.addEventListener("click", (event) => {
          event.preventDefault();
          downloadGradesFlat(table, format);
        });
        toolbar.appendChild(exportButton);
      });

      table.parentElement.insertBefore(toolbar, table);
    }

  GE.gradesExport = {
    ensureCsvExportButton,
  };
})();
