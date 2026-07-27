/**
 * grades-sort-filter.js
 *
 * Local sorting and filtering for the primary /znamky/ table. Subject rows
 * are always moved together with their following category/event rows; the
 * native floating header clone is deliberately left untouched.
 */

(function () {
  "use strict";

  const GE = (window.__eeGrades = window.__eeGrades || {});
  const tableStates = new WeakMap();
  const collators = new Map();

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function compareNullableNumbers(left, right, direction = 1) {
    const leftValid = Number.isFinite(left);
    const rightValid = Number.isFinite(right);
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    if (!leftValid) return 0;
    return (left - right) * direction;
  }

  function compareAverageQuality(left, right, bestFirst) {
    const leftValid = Number.isFinite(left.average);
    const rightValid = Number.isFinite(right.average);
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    if (!leftValid) return 0;
    if (left.averageScale !== right.averageScale) {
      return left.originalIndex - right.originalIndex;
    }

    const leftQuality = left.averageScale === "percent" ? -left.average : left.average;
    const rightQuality = right.averageScale === "percent" ? -right.average : right.average;
    return (leftQuality - rightQuality) * (bestFirst ? 1 : -1);
  }

  function getCollator(locale) {
    const key = locale || "default";
    if (!collators.has(key)) {
      collators.set(key, new Intl.Collator(locale || undefined, { numeric: true, sensitivity: "base" }));
    }
    return collators.get(key);
  }

  function sortSubjectEntries(entries, mode, locale = "") {
    if (mode === "original") {
      return [...entries].sort((left, right) => left.originalIndex - right.originalIndex);
    }

    const collator = getCollator(locale);
    return [...entries].sort((left, right) => {
      let result = 0;
      if (mode === "subject-asc") result = collator.compare(left.name, right.name);
      if (mode === "subject-desc") result = collator.compare(right.name, left.name);
      if (mode === "grades-desc") result = compareNullableNumbers(left.gradeCount, right.gradeCount, -1);
      if (mode === "grades-asc") result = compareNullableNumbers(left.gradeCount, right.gradeCount, 1);
      if (mode === "average-best") result = compareAverageQuality(left, right, true);
      if (mode === "average-worst") result = compareAverageQuality(left, right, false);
      return result
        || collator.compare(left.name, right.name)
        || left.originalIndex - right.originalIndex;
    });
  }

  function getTableState(table) {
    let state = tableStates.get(table);
    if (!state) {
      state = {
        originalIndices: new WeakMap(),
        originalIndicesByKey: new Map(),
        nextOriginalIndex: 0,
        sortMode: "original",
        query: "",
        hideEmpty: false,
        controls: null,
      };
      tableStates.set(table, state);
    }
    return state;
  }

  function readSubjectName(row) {
    const cell = row.querySelector("th.fixedCell, td.fixedCell, th, td");
    return GE.normalizeWhitespace(cell?.textContent || "");
  }

  function collectGradeNodes(rows) {
    const nodes = new Set();
    rows.forEach((row) => {
      row.querySelectorAll?.(".znZnamka").forEach((node) => nodes.add(node));
    });
    return nodes;
  }

  function collectSubjectGroups(table) {
    const state = getTableState(table);
    const groups = [];
    let current = null;

    Array.from(table.rows || []).forEach((row) => {
      if (row.classList.contains("predmetRow")) {
        if (current) groups.push(current);
        if (!state.originalIndices.has(row)) {
          const subjectKey = row.dataset?.predmetid
            ? `id:${row.dataset.predmetid}`
            : `name:${normalizeSearchText(readSubjectName(row))}`;
          if (!state.originalIndicesByKey.has(subjectKey)) {
            state.originalIndicesByKey.set(subjectKey, state.nextOriginalIndex++);
          }
          state.originalIndices.set(row, state.originalIndicesByKey.get(subjectKey));
        }
        current = {
          subjectRow: row,
          rows: [row],
          parent: row.parentNode,
          originalIndex: state.originalIndices.get(row),
        };
        return;
      }

      if (!current) return;
      const isBoundary = row.classList.contains("ee-overall-row")
        || row.classList.contains("header")
        || row.parentNode !== current.parent;
      if (isBoundary) {
        groups.push(current);
        current = null;
        return;
      }
      current.rows.push(row);
    });
    if (current) groups.push(current);

    return groups.map((group) => {
      const name = readSubjectName(group.subjectRow);
      const averageCell = group.subjectRow.querySelector(".znPriemerCell");
      const averageText = GE.readAverageText(averageCell);
      const average = GE.parseAverage(averageText);
      return {
        ...group,
        name,
        normalizedName: normalizeSearchText(name),
        gradeCount: collectGradeNodes(group.rows).size,
        average,
        averageScale: GE.detectAverageScale(averageText, average),
      };
    });
  }

  function groupByParent(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
      if (!groups.has(entry.parent)) groups.set(entry.parent, []);
      groups.get(entry.parent).push(entry);
    });
    return groups;
  }

  function reorderGroups(entries, mode) {
    let mutated = false;
    groupByParent(entries).forEach((parentEntries, parent) => {
      const sorted = sortSubjectEntries(parentEntries, mode, document.documentElement.lang);
      const current = parentEntries.map((entry) => entry.subjectRow);
      const changed = sorted.some((entry, index) => entry.subjectRow !== current[index]);
      if (!changed) return;

      const boundary = parentEntries[parentEntries.length - 1].rows.slice(-1)[0].nextElementSibling;
      sorted.forEach((entry) => entry.rows.forEach((row) => parent.insertBefore(row, boundary)));
      mutated = true;
    });
    return mutated;
  }

  function applyFilters(entries, query, hideEmpty) {
    const normalizedQuery = normalizeSearchText(query);
    let visibleCount = 0;
    let mutated = false;

    entries.forEach((entry) => {
      const visible = (!normalizedQuery || entry.normalizedName.includes(normalizedQuery))
        && (!hideEmpty || entry.gradeCount > 0);
      if (visible) visibleCount += 1;
      entry.rows.forEach((row) => {
        const shouldHide = !visible;
        if (row.classList.contains("ee-subject-filtered") === shouldHide) return;
        row.classList.toggle("ee-subject-filtered", shouldHide);
        mutated = true;
      });
    });

    return { visibleCount, mutated };
  }

  function updateStatus(state, visibleCount, totalCount) {
    if (!state.controls?.status) return;
    state.controls.status.textContent = GE.t("gradesFilterCount", [String(visibleCount), String(totalCount)]);
  }

  function apply(table) {
    const state = getTableState(table);
    const entries = collectSubjectGroups(table);
    if (entries.length === 0) return;

    const reordered = reorderGroups(entries, state.sortMode);
    const filtered = applyFilters(entries, state.query, state.hideEmpty);
    if (reordered || filtered.mutated) GE.markInternalMutation();
    updateStatus(state, filtered.visibleCount, entries.length);
  }

  function makeLabel(text, control) {
    const label = document.createElement("label");
    label.className = "ee-grades-control";
    const caption = document.createElement("span");
    caption.className = "ee-grades-control-label";
    caption.textContent = text;
    label.append(caption, control);
    return label;
  }

  function makeSortSelect(state, table) {
    const select = document.createElement("select");
    select.className = "ee-grades-select";
    [
      ["original", "gradesSortOriginal"],
      ["subject-asc", "gradesSortSubjectAsc"],
      ["subject-desc", "gradesSortSubjectDesc"],
      ["grades-desc", "gradesSortCountDesc"],
      ["grades-asc", "gradesSortCountAsc"],
      ["average-best", "gradesSortAverageBest"],
      ["average-worst", "gradesSortAverageWorst"],
    ].forEach(([value, key]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = GE.t(key);
      select.appendChild(option);
    });
    select.value = state.sortMode;
    select.addEventListener("change", () => {
      state.sortMode = select.value;
      apply(table);
    });
    return select;
  }

  function makeSearchInput(state, table) {
    const input = document.createElement("input");
    input.type = "search";
    input.className = "ee-grades-search";
    input.placeholder = GE.t("gradesFilterPlaceholder");
    input.autocomplete = "off";
    input.value = state.query;
    input.addEventListener("input", () => {
      state.query = input.value;
      apply(table);
    });
    return input;
  }

  function ensureControls(table) {
    if (!table.parentElement) return;
    const state = getTableState(table);
    const toolbar = GE.ensureGradesToolbar(table);
    if (!toolbar) return;

    let controls = toolbar.querySelector(":scope > .ee-grades-sort-filter");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "ee-grades-sort-filter";

      const search = makeSearchInput(state, table);
      const sort = makeSortSelect(state, table);
      const hideEmpty = document.createElement("input");
      hideEmpty.type = "checkbox";
      hideEmpty.checked = state.hideEmpty;
      hideEmpty.addEventListener("change", () => {
        state.hideEmpty = hideEmpty.checked;
        apply(table);
      });

      const hideLabel = document.createElement("label");
      hideLabel.className = "ee-grades-check";
      hideLabel.append(hideEmpty, document.createTextNode(GE.t("gradesFilterHideEmpty")));

      const status = document.createElement("span");
      status.className = "ee-grades-filter-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");

      controls.append(
        makeLabel(GE.t("gradesFilterSubject"), search),
        makeLabel(GE.t("gradesSortLabel"), sort),
        hideLabel,
        status,
      );
      toolbar.prepend(controls);
      state.controls = { controls, search, sort, hideEmpty, status };
    } else if (!state.controls) {
      state.controls = {
        controls,
        search: controls.querySelector(".ee-grades-search"),
        sort: controls.querySelector(".ee-grades-select"),
        hideEmpty: controls.querySelector("input[type=checkbox]"),
        status: controls.querySelector(".ee-grades-filter-status"),
      };
    }

    apply(table);
  }

  function disable(table) {
    if (!table?.parentElement) return;
    const state = getTableState(table);
    state.sortMode = "original";
    state.query = "";
    state.hideEmpty = false;

    const entries = collectSubjectGroups(table);
    const reordered = entries.length > 0 && reorderGroups(entries, "original");
    const filtered = entries.length > 0
      ? applyFilters(entries, "", false)
      : { mutated: false };

    state.controls?.controls?.remove();
    state.controls = null;

    const toolbar = table.previousElementSibling;
    if (toolbar?.classList?.contains("ee-grades-toolbar") && toolbar.children.length === 0) {
      toolbar.remove();
    }
    if (reordered || filtered.mutated) GE.markInternalMutation();
  }

  GE.sortFilter = {
    normalizeSearchText,
    sortSubjectEntries,
    collectSubjectGroups,
    applyFilters,
    ensureControls,
    disable,
    apply,
  };
})();
