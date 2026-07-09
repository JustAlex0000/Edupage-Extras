/**
 * grades-badges.js
 *
 * Grade average badges/bars on each subject row, and the grade-title
 * double-click override feature (tooltip text edits persisted per grade
 * cell). Depends on the shared helpers grades-enhancer.js publishes on GE.
 */

(function () {
  "use strict";

  const GE = (window.__eeGrades = window.__eeGrades || {});

  const GRADE_TITLE_OVERRIDES_KEY = "eeGradeTitleOverrides";
  const AVERAGE_RENDER_SIGNATURE_ATTR = "data-ee-average-render-signature";
  let gradeTitleOverridesPromise = null;

    function parseGradeTitleSegments(originalTitleHtml) {
      const html = String(originalTitleHtml || "").trim();
      if (!html) {
        return { title: "", detailHtml: "" };
      }

      const titleMatch = html.match(/<b>([\s\S]*?)<\/b>/i);
      const title = GE.normalizeWhitespace(GE.stripHtmlTags(titleMatch?.[1] || ""));
      const withoutTitle = titleMatch
        ? `${html.slice(0, titleMatch.index)}${html.slice((titleMatch.index || 0) + titleMatch[0].length)}`
        : html;
      const detailHtml = withoutTitle.replace(/^(<br\s*\/?>|\s)+/i, "").trim();

      return { title, detailHtml };
    }
    function buildGradeOriginalTitleHtml(title, detailHtml = "") {
      const safeTitle = GE.normalizeWhitespace(title);
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
        GE.normalizeWhitespace(dateText),
        GE.normalizeWhitespace(gradeValue),
        Number.isInteger(columnIndex) ? columnIndex : -1,
        GE.normalizeWhitespace(defaultTitle),
      ].join("|");
    }
    function extractGradeCellMeta(gradeTip) {
      if (!(gradeTip instanceof Element)) return null;

      const row = gradeTip.closest("tr[data-predmetid]");
      const cell = gradeTip.closest("td");
      const originalTitle = String(gradeTip.getAttribute("data-ee-original-grade-title") || gradeTip.getAttribute("original-title") || "").trim();
      const gradeValue = GE.normalizeWhitespace(gradeTip.querySelector(".znZnamka")?.textContent || gradeTip.textContent || "");
      const { title, detailHtml } = parseGradeTitleSegments(originalTitle);
      const dateMatch = GE.stripHtmlTags(detailHtml).match(/D[aá]tum známky:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i);
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

      gradeTitleOverridesPromise = GE.storageGet([GRADE_TITLE_OVERRIDES_KEY])
        .then((result) => {
          GE.state.gradeTitleOverrides = result[GRADE_TITLE_OVERRIDES_KEY] && typeof result[GRADE_TITLE_OVERRIDES_KEY] === "object"
            ? result[GRADE_TITLE_OVERRIDES_KEY]
            : {};
          return GE.state.gradeTitleOverrides;
        })
        .finally(() => {
          gradeTitleOverridesPromise = null;
        });

      return gradeTitleOverridesPromise;
    }
    async function saveGradeTitleOverrides() {
      await GE.storageSet({ [GRADE_TITLE_OVERRIDES_KEY]: GE.state.gradeTitleOverrides });
    }
    function applyStoredGradeTitles(table) {
      Array.from(table.querySelectorAll("span.tips")).forEach((gradeTip) => {
        if (!(gradeTip instanceof Element) || !gradeTip.querySelector(".znZnamka")) return;
        if (!gradeTip.hasAttribute("data-ee-original-grade-title")) {
          gradeTip.setAttribute("data-ee-original-grade-title", gradeTip.getAttribute("original-title") || "");
        }

        const meta = extractGradeCellMeta(gradeTip);
        if (!meta) return;

        const overrideTitle = GE.normalizeWhitespace(GE.state.gradeTitleOverrides[meta.storageKey] || "");
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

      const currentValue = GE.normalizeWhitespace(GE.state.gradeTitleOverrides[meta.storageKey] || meta.defaultTitle);
      const updatedTitle = window.prompt(GE.t("vgGradeTitlePrompt"), currentValue);
      if (updatedTitle === null) return;

      const normalizedTitle = GE.normalizeWhitespace(updatedTitle);
      if (!normalizedTitle || normalizedTitle === meta.defaultTitle) {
        delete GE.state.gradeTitleOverrides[meta.storageKey];
      } else {
        GE.state.gradeTitleOverrides[meta.storageKey] = normalizedTitle;
      }

      await saveGradeTitleOverrides();
      GE.enhanceGradesTable();
    }
    function enhanceAverageCell(row) {
      const priemerCell = row.querySelector(".znPriemerCell");
      if (!priemerCell) return null;

      const rawText = GE.readAverageText(priemerCell);
      const avg = GE.parseAverage(rawText);
      const scale = GE.detectAverageScale(rawText, avg);
      if (Number.isNaN(avg)) return null;
      if (priemerCell.querySelector(".ee-avg-badge")) {
        return { avg, displayText: rawText, scale };
      }

      priemerCell.dataset.eeOriginalAverage = rawText;
      const badge = GE.createBadgeElement(avg, rawText, { scale });
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

      GE.virtual.closeVirtualPopover();
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

  GE.badges = {
    applyStoredGradeTitles,
    loadGradeTitleOverrides,
    handleGradeTitleEdit,
    enhanceAverageCell,
    restoreAverageCells,
    collectAverages,
    buildAverageRenderSignature,
    parseGradeTitleSegments,
    buildGradeOriginalTitleHtml,
    buildGradeTitleOverrideKey,
  };
})();
