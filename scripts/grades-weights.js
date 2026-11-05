/** Read the current viewer's weight definitions, including entries without grades. */
(function () {
  "use strict";
  if (window.top !== window) return;
  const GE = (window.__eeGrades = window.__eeGrades || {});
  const signatures = new WeakMap();
  let panelListeners = null;
  let waitingObserver = null;
  let waitingTimer = null;
  let waitingTable = null;
  let attemptedTables = new WeakSet();

  function values(value) {
    return value && typeof value === "object" ? Object.values(value) : [];
  }

  function buildWeightDefinitions(blob) {
    const subjects = new Map();
    function add(entries, kind) {
      for (const entry of entries) {
        const subject = String(entry?.PredmetID ?? "").trim();
        const name = typeof entry?.p_meno === "string" ? entry.p_meno.trim() : "";
        const raw = entry?.p_vaha;
        if (!subject || !name || !["number", "string"].includes(typeof raw)
          || String(raw).trim() === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) continue;
        const item = { kind, name, weight: Number(raw) / 20 };
        if (!subjects.has(subject)) subjects.set(subject, []);
        const list = subjects.get(subject);
        if (!list.some((other) => other.kind === kind && other.name === name && other.weight === item.weight)) {
          list.push(item);
        }
      }
    }
    add(values(blob?.kategorie), "category");
    add(values(blob?.vsetkyUdalosti?.edupage), "event");
    return subjects;
  }

  function readWeightDefinitions(table) {
    const marker = ".znamkyStudentViewer(";
    // Match the widget method, never EduPage's randomly generated element ID.
    // Resolve its current target so old scripts from a different view cannot win.
    for (const script of Array.from(document.querySelectorAll("script:not([src])")).reverse()) {
      const source = script.textContent || "";
      let index = source.lastIndexOf(marker);
      while (index !== -1) {
        const target = /(?:\$j|jQuery|\$)\(\s*(["'])#([^"']+)\1\s*\)\s*$/.exec(source.slice(0, index));
        const root = target && document.getElementById(target[2]);
        if (root?.contains(table)) {
          const start = index + marker.length + (source.slice(index + marker.length).match(/^\s*/)?.[0].length || 0);
          if (source[start] !== "{") return new Map();
          try {
            const json = EE.extractBalanced(source, start);
            return json ? buildWeightDefinitions(JSON.parse(json)) : new Map();
          } catch {
            // Unsupported/malformed viewer data must not log student data.
            return new Map();
          }
        }
        index = index === 0 ? -1 : source.lastIndexOf(marker, index - 1);
      }
    }
    return new Map();
  }

  function clear() {
    panelListeners?.abort();
    panelListeners = null;
    stopWaiting();
    attemptedTables = new WeakSet();
    document.querySelectorAll(".ee-grade-weights").forEach((node) => node.remove());
  }

  function stopWaiting() {
    waitingObserver?.disconnect();
    waitingObserver = null;
    window.clearTimeout(waitingTimer);
    waitingTimer = null;
    waitingTable = null;
  }

  function waitForViewerData(table) {
    if (waitingTable === table || attemptedTables.has(table) || !document.head) return;
    stopWaiting();
    attemptedTables.add(table);
    waitingTable = table;
    // The shared grades observer watches the body. A late initializer may
    // instead arrive in the head; watch only that surface for at most 10s.
    waitingObserver = new MutationObserver((mutations) => {
      if (hasViewerScriptMutation(mutations)) GE.enhanceGradesTable();
    });
    waitingObserver.observe(document.head, { childList: true, characterData: true, subtree: true });
    waitingTimer = window.setTimeout(stopWaiting, 10000);
  }

  function hasViewerScriptMutation(mutations) {
    return mutations.some((mutation) => [mutation.target, ...Array.from(mutation.addedNodes || [])].some((node) => {
      const element = node.nodeType === 3 ? node.parentElement : node;
      if (element?.matches?.("script:not([src])") && element.textContent.includes(".znamkyStudentViewer(")) return true;
      return Array.from(element?.querySelectorAll?.("script:not([src])") || [])
        .some((script) => script.textContent.includes(".znamkyStudentViewer("));
    }));
  }

  function render(table, enabled) {
    if (!enabled || !/^\/znamky(?:\/|$)/i.test(window.location.pathname)) {
      clear();
      return;
    }
    const definitions = readWeightDefinitions(table);
    if (definitions.size > 0) stopWaiting();
    else waitForViewerData(table);
    const subjects = Array.from(table.querySelectorAll("tr.predmetRow"), (row) => ({
      id: String(row.dataset.predmetid || ""),
      name: GE.normalizeWhitespace(row.querySelector(".fixedCell > b")?.textContent
        || GE.attendance.readPrimaryRowSubjectText(row)),
      items: definitions.get(String(row.dataset.predmetid || "")),
    })).filter((subject) => subject.items?.length);
    if (!subjects.length) {
      panelListeners?.abort();
      document.querySelectorAll(".ee-grade-weights").forEach((node) => node.remove());
      return;
    }
    const toolbar = GE.ensureGradesToolbar(table);
    if (!toolbar) return;
    const previous = toolbar.querySelector(".ee-grade-weights");
    // Remove the earlier row disclosures, and tools belonging to replaced tables.
    document.querySelectorAll(".ee-grade-weights").forEach((node) => { if (node !== previous) node.remove(); });
    const signature = JSON.stringify(subjects);
    const stored = previous && signatures.get(previous);
    if (stored?.signature === signature && stored.table === table) return;
    const selected = previous?.querySelector("select")?.value;
    const details = document.createElement("details");
    details.className = "ee-grade-weights";
    details.open = previous?.open || false;
    const summary = document.createElement("summary");
    summary.className = "ee-grades-export-btn";
    summary.textContent = GE.t("eeGradeWeightsButton");
    summary.title = GE.t("eeGradeWeightsSummary");
    details.appendChild(summary);
    const panel = document.createElement("div");
    panel.className = "ee-grade-weights-panel";
    const label = document.createElement("label");
    label.className = "ee-grades-control";
    const caption = document.createElement("span");
    caption.className = "ee-grades-control-label";
    caption.textContent = GE.t("eeGradeWeightsSubject");
    const select = document.createElement("select");
    select.className = "ee-grades-select";
    for (const subject of subjects) {
      const option = document.createElement("option");
      option.value = subject.id;
      option.textContent = subject.name;
      select.appendChild(option);
    }
    if (subjects.some((subject) => subject.id === selected)) select.value = selected;
    label.append(caption, select);
    panel.appendChild(label);
    const content = document.createElement("div");
    panel.appendChild(content);
    function showSubject() {
      content.replaceChildren();
      const items = subjects.find((subject) => subject.id === select.value)?.items || [];
      const formatter = new Intl.NumberFormat(EE.getUILanguage?.() || document.documentElement.lang || "en", { maximumFractionDigits: 10 });
      const hasBothKinds = items.some((item) => item.kind === "category") && items.some((item) => item.kind === "event");
      for (const kind of ["category", "event"]) {
        const group = items.filter((item) => item.kind === kind);
        if (!group.length) continue;
        if (hasBothKinds) {
          const heading = document.createElement("h4");
          heading.textContent = GE.t(kind === "category" ? "eeGradeWeightsCategories" : "eeGradeWeightsEvents");
          content.appendChild(heading);
        }
        const list = document.createElement("dl");
        for (const item of group) {
          const entry = document.createElement("div");
          const name = document.createElement("dt");
          name.textContent = item.name;
          const weight = document.createElement("dd");
          weight.textContent = `${formatter.format(item.weight)}×`;
          entry.append(name, weight);
          list.appendChild(entry);
        }
        content.appendChild(list);
      }
    }
    select.addEventListener("change", showSubject);
    showSubject();
    details.appendChild(panel);
    panelListeners?.abort();
    panelListeners = new AbortController();
    document.addEventListener("click", (event) => {
      if (!details.contains(event.target)) details.open = false;
    }, { signal: panelListeners.signal });
    details.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      details.open = false;
      summary.focus();
      event.stopPropagation();
    });
    signatures.set(details, { signature, table });
    if (previous) previous.replaceWith(details);
    else toolbar.appendChild(details);
  }

  function needsTableBind(table) {
    const panel = table?.previousElementSibling?.querySelector(".ee-grade-weights");
    return Boolean(panel && signatures.get(panel)?.table !== table);
  }

  GE.weights = { render, clear, buildWeightDefinitions, readWeightDefinitions, hasViewerScriptMutation, needsTableBind };
})();
