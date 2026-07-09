/**
 * grades-summary.js
 *
 * The synthetic "overall average" row appended below each grades table,
 * including its attendance-column cells (delegated to grades-attendance.js
 * for the actual stats/placeholder rendering).
 */

(function () {
  "use strict";

  const GE = (window.__eeGrades = window.__eeGrades || {});

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
    function computeSummaryColumnLayout(colCount, hasVysvedcenie = false) {
      // avg + 4 attendance cells (+ a Vysvedčenie average cell when that column is
      // shown). Without this, the extra Vysvedčenie column grows labelSpan and
      // shifts the whole overall row out of alignment.
      const metricColumns = 5 + (hasVysvedcenie ? 1 : 0);
      const trailingSpan = colCount >= 7 ? 1 : 0;
      const labelSpan = Math.max(1, colCount - metricColumns - trailingSpan);
      return { labelSpan, trailingSpan };
    }

    // Reads the term-end "Vysvedčenie" (final report grade) column: whether it's
    // present and the average of its numeric grades.
    //
    // Each grade renders as its own <td>, so a row's cell count (and the
    // Vysvedčenie column's index) varies per subject — confirmed live, index
    // ranged 2 to 14 across rows with a fixed 9-column header. A header-derived
    // index does not transfer to body rows, so presence is checked via the header
    // (by text) but each row's value is read structurally as ".znPriemerCell"'s
    // next sibling, same as GE.attendance.tagVysvedcenieColumn.
    function readVysvedcenieColumn(table) {
      const headerRow = table.querySelector("thead tr");
      if (!headerRow) return { present: false, average: null };
      const headerCell = Array.from(headerRow.cells).find((cell) =>
        !cell.classList.contains("ee-attendance-header")
        && GE.attendance.normalizeText(cell.textContent) === "vysvedcenie");
      if (!headerCell) return { present: false, average: null };

      const values = [];
      table.querySelectorAll("tr.predmetRow").forEach((row) => {
        const priemerCell = row.querySelector(".znPriemerCell");
        const cell = priemerCell?.nextElementSibling;
        if (!cell || cell.tagName !== "TD") return;
        const value = GE.parseAverage(GE.normalizeWhitespace(cell.textContent || ""));
        if (Number.isFinite(value) && value > 0) values.push(value);
      });
      const average = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
      return { present: true, average };
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
      label.textContent = GE.t("gradesOverall");

      const meta = document.createElement("span");
      meta.className = "ee-overall-meta";
      meta.textContent = GE.t("gradesSubjectsCount", [String(averages.length)]);

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
      avgCell.appendChild(GE.createBadgeElement(overallAvg, GE.formatAverageDisplay(overallAvg, averageScale), {
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

      const summaryTone = GE.attendance.attendanceTone(attendanceSummary?.percent);
      const predictedTone = GE.attendance.attendanceTone(predictedAttendanceSummary?.percent);
      const vysvedcenie = readVysvedcenieColumn(table);
      const { labelSpan, trailingSpan } = computeSummaryColumnLayout(colCount, vysvedcenie.present);
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
          ? GE.t("gradesOfficialHalfUnmatched", [String(attendanceSummary.absent), String(attendanceSummary.total), String(unmatchedSummary.absent), String(unmatchedSummary.total)])
          : GE.t("gradesOfficialHalf", [String(attendanceSummary.absent), String(attendanceSummary.total)]);
        const percentValue = document.createElement("span");
        percentValue.className = "ee-attendance-stat";
        if (summaryTone?.className) {
          percentValue.classList.add(summaryTone.className);
        } else {
          percentValue.style.color = summaryTone.color;
        }
        percentValue.textContent = GE.attendance.formatPercent(attendanceSummary.percent);
        percentCell.appendChild(percentValue);
        percentCell.title = summaryTitle;

        const totalValue = document.createElement("span");
        totalValue.className = "ee-attendance-stat ee-attendance-total";
        totalValue.textContent = `${attendanceSummary.absent}/${attendanceSummary.total}`;
        totalCell.appendChild(totalValue);
        totalCell.title = summaryTitle;
      } else {
        const percentPlaceholder = GE.attendance.buildAttendancePlaceholderState(
          attendanceState,
          attendanceState === "loading"
            ? GE.t("gradesAttendanceLoading")
            : GE.t("gradesAttendanceUnavailable"),
        );
        const percentEmpty = document.createElement("span");
        percentEmpty.className = percentPlaceholder.className;
        percentEmpty.textContent = percentPlaceholder.text;
        percentCell.appendChild(percentEmpty);
        percentCell.title = percentPlaceholder.title;

        const totalPlaceholder = GE.attendance.buildAttendancePlaceholderState(
          attendanceState,
          attendanceState === "loading"
            ? GE.t("gradesAttendanceLoading")
            : GE.t("gradesAttendanceUnavailable"),
        );
        const totalEmpty = document.createElement("span");
        totalEmpty.className = totalPlaceholder.className;
        totalEmpty.textContent = totalPlaceholder.text;
        totalCell.appendChild(totalEmpty);
        totalCell.title = totalPlaceholder.title;
      }

      if (predictedAttendanceSummary && Number.isFinite(predictedAttendanceSummary.percent)) {
        const predictedTitle = GE.t("gradesPredictedSummary", [String(predictedAttendanceSummary.absent), String(predictedAttendanceSummary.total)]);
        const predictedPercentValue = document.createElement("span");
        predictedPercentValue.className = "ee-attendance-stat";
        if (predictedTone?.className) {
          predictedPercentValue.classList.add(predictedTone.className);
        } else if (predictedTone?.color) {
          predictedPercentValue.style.color = predictedTone.color;
        }
        predictedPercentValue.textContent = GE.attendance.formatPercent(predictedAttendanceSummary.percent);
        predictedPercentCell.appendChild(predictedPercentValue);
        predictedPercentCell.title = predictedTitle;

        const predictedTotalValue = document.createElement("span");
        predictedTotalValue.className = "ee-attendance-stat ee-attendance-total";
        predictedTotalValue.textContent = `${predictedAttendanceSummary.absent}/${predictedAttendanceSummary.total}`;
        predictedTotalCell.appendChild(predictedTotalValue);
        predictedTotalCell.title = predictedTitle;
      } else {
        const predictedPercentPlaceholder = GE.attendance.buildAttendancePlaceholderState(
          predictionState,
          predictionState === "loading"
            ? GE.t("gradesPredictedLoading")
            : GE.t("gradesPredictedUnavailable"),
        );
        const predictedPercentEmpty = document.createElement("span");
        predictedPercentEmpty.className = predictedPercentPlaceholder.className;
        predictedPercentEmpty.textContent = predictedPercentPlaceholder.text;
        predictedPercentCell.appendChild(predictedPercentEmpty);
        predictedPercentCell.title = predictedPercentPlaceholder.title;

        const predictedTotalPlaceholder = GE.attendance.buildAttendancePlaceholderState(
          predictionState,
          predictionState === "loading"
            ? GE.t("gradesPredictedLoading")
            : GE.t("gradesPredictedUnavailable"),
        );
        const predictedTotalEmpty = document.createElement("span");
        predictedTotalEmpty.className = predictedTotalPlaceholder.className;
        predictedTotalEmpty.textContent = predictedTotalPlaceholder.text;
        predictedTotalCell.appendChild(predictedTotalEmpty);
        predictedTotalCell.title = predictedTotalPlaceholder.title;
      }

      summaryRow.appendChild(labelCell);
      summaryRow.appendChild(avgCell);
      if (vysvedcenie.present) {
        // Mirror the Priemer average, but for the final report grades — sits under
        // the Vysvedčenie column (which we keep right after Priemer).
        const vysvedCell = document.createElement("td");
        vysvedCell.className = "ee-overall-value-cell ee-overall-vysvedcenie-cell";
        if (Number.isFinite(vysvedcenie.average)) {
          vysvedCell.appendChild(GE.createBadgeElement(
            vysvedcenie.average,
            GE.formatAverageDisplay(vysvedcenie.average, averageScale),
            { largeValue: true, scale: averageScale },
          ));
        }
        summaryRow.appendChild(vysvedCell);
      }
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

  GE.summary = {
    ensureSummaryRow,
    buildSummaryRenderSignature,
    computeSummaryColumnLayout,
  };
})();
