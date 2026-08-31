/**
 * diagnostics.js - in-page diagnostics collector for "Report a Problem".
 *
 * Runs in the ISOLATED content-script world at document_start, BEFORE the
 * feature enhancers, so it can install error capture early and expose a small
 * API the enhancers may use to record structured failure context.
 *
 * It never sends anything on its own. It only responds to an explicit
 * "ee-collect-page-diagnostics" message (triggered when the user clicks
 * "Generate report" in the extension settings) with a snapshot of the current
 * page. The snapshot is built to help diagnose parsing/selector problems on
 * other schools' EduPage instances while leaking as little personal data as
 * possible:
 *
 *   - redact = true  (default): structural skeleton only. Tag names, class
 *     names, ids and data-* attribute KEYS are kept; text content and attribute
 *     VALUES are dropped. This is what is needed to fix CSS selectors and DOM
 *     walking, and contains essentially no grades, names or marks.
 *   - redact = false: also includes truncated text and attribute values, for
 *     the cases where structure alone is not enough.
 */
(function () {
  "use strict";

  if (window.__eeDiagnostics) return;

  const MAX_LOG_ENTRIES = 60;
  const TAG = "Edupage Extras";

  const errorLog = [];
  const recordedContext = [];

  function pushLog(entry) {
    errorLog.push(entry);
    if (errorLog.length > MAX_LOG_ENTRIES) errorLog.shift();
  }

  function stringifyArg(value) {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}\n${value.stack || ""}`.trim();
    }
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  // Only capture console output that is ours (tagged with the extension name),
  // so we never hoover up unrelated page logging that could contain user data.
  function isOurMessage(args) {
    return args.some((arg) => typeof arg === "string" && arg.includes(TAG));
  }

  function wrapConsole(method) {
    const original = console[method];
    if (typeof original !== "function") return;
    console[method] = function (...args) {
      try {
        if (isOurMessage(args)) {
          pushLog({
            level: method,
            time: new Date().toISOString(),
            message: args.map(stringifyArg).join(" ").slice(0, 2000),
          });
        }
      } catch (_) {
        /* never let diagnostics break the page */
      }
      return original.apply(this, args);
    };
  }

  wrapConsole("error");
  wrapConsole("warn");

  // Firefox extension pages/scripts live under moz-extension://, not
  // chrome-extension:// — match either scheme so uncaught errors/rejections
  // aren't silently dropped on Firefox (see #45).
  const EXTENSION_SCHEME_RE = /(chrome|moz)-extension:\/\//;

  function stackMentionsExtension(stack) {
    if (typeof stack !== "string") return false;
    const id = (chrome?.runtime?.id) || "";
    return (id && stack.includes(id)) ||
      EXTENSION_SCHEME_RE.test(stack) &&
      /diagnostics\.js|content\.js|timetable-sync\.js|timetable-enhancer\.js|grades-(enhancer|debug|badges|virtual|summary|attendance|export|bootstrap)\.js|attendance-enhancer\.js|activity-shield/.test(stack);
  }

  window.addEventListener("error", (event) => {
    try {
      const stack = event?.error?.stack || "";
      // Keep uncaught errors that originate from our own scripts only.
      if (!stackMentionsExtension(stack) && !EXTENSION_SCHEME_RE.test(String(event?.filename || ""))) {
        return;
      }
      pushLog({
        level: "uncaught",
        time: new Date().toISOString(),
        message: `${event.message || "Uncaught error"} @ ${event.filename || "?"}:${event.lineno || 0}`.slice(0, 1000),
        stack: stack.slice(0, 2000),
      });
    } catch (_) { /* ignore */ }
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event?.reason;
      const stack = reason?.stack || "";
      if (!stackMentionsExtension(stack)) return;
      pushLog({
        level: "unhandledrejection",
        time: new Date().toISOString(),
        message: stringifyArg(reason).slice(0, 1000),
        stack: stack.slice(0, 2000),
      });
    } catch (_) { /* ignore */ }
  }, true);

  /**
   * Public API for enhancers. They MAY call:
   *   window.__eeDiagnostics.record("attendance", { unmatchedRows: [...] })
   * to attach structured failure context to a future report. Personal data
   * should be summarised, not dumped, by the caller.
   */
  function record(feature, info) {
    try {
      recordedContext.push({
        feature: String(feature || "unknown"),
        time: new Date().toISOString(),
        info,
      });
      if (recordedContext.length > MAX_LOG_ENTRIES) recordedContext.shift();
    } catch (_) { /* ignore */ }
  }

  function has(selector) {
    try { return Boolean(document.querySelector(selector)); } catch (_) { return false; }
  }

  // EduPage is largely a JS app, so the URL path is not enough — many feature
  // views render under /user/ or inside iframes. Detect by DOM markers too.
  function detectPageType() {
    const path = (location.pathname || "").toLowerCase();
    const checks = [
      ["grades", () => path.includes("/znamky") || has("table.znamkyTable, .znamky, #znamkyMng")],
      ["attendance", () => path.includes("/dochadzka") || path.includes("/absencie") ||
        has("[id*='dochadzka'], .dailyAbsencesTable, .absenceTable, .dochadzkaTable")],
      ["timetable", () => path.includes("/rozvrh") ||
        has("[data-rt-component], .rozvrhtable, .dp_calendar, .timetableview, .dailyplan")],
      ["dashboard", () => path === "/" || path.includes("/dashboard") ||
        has("#dashboardWrapper, .dashboardWidget")],
    ];
    const matched = checks.filter(([, test]) => {
      try { return test(); } catch (_) { return false; }
    }).map(([name]) => name);
    return matched.length ? matched : ["unknown"];
  }

  // ---- DOM skeleton serialisation ----------------------------------------

  function truncate(value, max) {
    const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  // In redacted mode keep the SHAPE of a value (e.g. "85,5 %" -> "NN,N %",
  // "1/2" -> "N/N") so a maintainer can see the mark format a school uses
  // without seeing the actual grade.
  function maskNumbers(value, redact) {
    const text = truncate(value, 40);
    return redact ? text.replace(/\d/g, "N") : text;
  }

  // Text directly inside an element, ignoring nested elements (e.g. the subject
  // name in `<b>matematika<div>Teacher Name</div></b>` without the teacher).
  function ownText(el) {
    if (!el) return "";
    return truncate(
      Array.from(el.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" "),
      80,
    );
  }

  function serializeElement(el, options, depth, budget) {
    if (!el || budget.count <= 0 || depth > options.maxDepth) return null;
    budget.count -= 1;

    const node = { tag: el.tagName ? el.tagName.toLowerCase() : "?" };
    if (el.id) node.id = options.redact ? "[id]" : el.id;

    const classes = el.classList ? Array.from(el.classList) : [];
    if (classes.length) node.class = classes;

    // data-* attributes are very useful for EduPage parsing; keep their keys
    // always, and their values only when not redacting.
    const dataKeys = [];
    const attrs = {};
    if (el.attributes) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === "class" || attr.name === "id") continue;
        if (attr.name.startsWith("data-")) {
          dataKeys.push(attr.name);
          if (!options.redact) attrs[attr.name] = truncate(attr.value, 80);
        } else if (!options.redact && ["role", "type", "name", "href", "src", "colspan", "rowspan"].includes(attr.name)) {
          attrs[attr.name] = truncate(attr.value, 80);
        }
      }
    }
    if (dataKeys.length) node.dataKeys = dataKeys;
    if (!options.redact && Object.keys(attrs).length) node.attrs = attrs;

    if (!options.redact) {
      const ownText = Array.from(el.childNodes || [])
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(" ");
      const trimmed = truncate(ownText, 60);
      if (trimmed) node.text = trimmed;
    }

    const children = [];
    for (const child of Array.from(el.children || [])) {
      if (budget.count <= 0) {
        node.truncated = true;
        break;
      }
      const serialized = serializeElement(child, options, depth + 1, budget);
      if (serialized) children.push(serialized);
    }
    if (children.length) node.children = children;
    return node;
  }

  function captureContainers(options) {
    const selectors = [
      "table.znamkyTable",                                          // grades table
      ".znamky, #znamkyMng, .gradesView",                          // grades view shell
      ".rozvrhtable, [data-rt-component], .dp_calendar, .timetableview, .dailyplan", // timetable
      "[id*='dochadzka'], .dailyAbsencesTable, .absenceTable, .dochadzkaTable, .dochadzka", // attendance
      "#dashboardWrapper, .dashboardWidget",                        // dashboard
      "#maincontent, .main-content, #app, #appContent",            // broad fallback
    ];
    const captured = [];
    const seen = new Set();
    for (const selector of selectors) {
      let elements = [];
      try { elements = Array.from(document.querySelectorAll(selector)); } catch (_) { continue; }
      for (const el of elements.slice(0, 2)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const budget = { count: options.maxNodes };
        const skeleton = serializeElement(el, options, 0, budget);
        if (skeleton) {
          captured.push({ selector, skeleton });
        }
        if (captured.length >= 4) break;
      }
      if (captured.length >= 4) break;
    }
    return captured;
  }

  // Structured, compact capture of the grades table aimed at adding support for
  // new mark formats (e.g. percentage-based schools). Walks every subject row
  // instead of relying on the depth-limited skeleton, always drops names, and
  // (in redacted mode) masks digits while keeping the mark FORMAT intact.
  function captureGradesSample(options) {
    const table = document.querySelector("table.znamkyTable");
    if (!table) return null;

    const redact = options.redact;
    const subjectRows = Array.from(table.querySelectorAll("tr.predmetRow")).slice(0, 40);
    let sawPercent = false;
    let maxNumericAverage = 0;

    const subjects = subjectRows.map((row) => {
      const nameCell = row.querySelector(".fixedCell");
      const bold = nameCell ? nameCell.querySelector("b") : null;
      const subject = bold ? ownText(bold) : ownText(nameCell);

      const averageCell = row.querySelector(".znPriemerCell, .znPriemerOstatnychCell");
      const rawAverage = averageCell
        ? (averageCell.getAttribute("data-ee-original-average") || averageCell.textContent || "")
        : "";
      if (/%/.test(rawAverage)) sawPercent = true;
      const numericAverage = parseFloat(String(rawAverage).replace(",", "."));
      if (Number.isFinite(numericAverage)) maxNumericAverage = Math.max(maxNumericAverage, numericAverage);

      const marks = Array.from(row.querySelectorAll(".znZnamka"))
        .slice(0, 10)
        .map((node) => {
          const text = String(node.textContent || "");
          if (/%/.test(text)) sawPercent = true;
          return maskNumbers(text, redact);
        })
        .filter(Boolean);

      const tooltips = Array.from(row.querySelectorAll("[data-ee-original-grade-title]"))
        .slice(0, 3)
        .map((node) => maskNumbers(node.getAttribute("data-ee-original-grade-title"), redact))
        .filter(Boolean);

      return {
        subjectId: row.getAttribute("data-predmetid") || null,
        subject: subject || null,
        averageText: maskNumbers(rawAverage, redact),
        marks,
        tooltips,
      };
    });

    const scaleGuess = sawPercent ? "percent" : (maxNumericAverage > 5 ? "percent" : "grade");

    return {
      subjectCount: subjects.length,
      truncated: table.querySelectorAll("tr.predmetRow").length > subjectRows.length,
      scaleGuess,
      tableClasses: Array.from(table.classList || []),
      subjects,
    };
  }

  function collect(message) {
    const redact = message?.redact !== false; // default: redact
    const options = {
      redact,
      maxDepth: 8,
      maxNodes: redact ? 600 : 350,
    };

    let containers = [];
    try { containers = captureContainers(options); } catch (error) {
      containers = [{ error: stringifyArg(error) }];
    }

    let gradesSample = null;
    try { gradesSample = captureGradesSample(options); } catch (error) {
      gradesSample = { error: stringifyArg(error) };
    }

    return {
      frame: {
        isTop: window.top === window.self,
        url: redact ? `${location.origin}${location.pathname}` : location.href,
        origin: location.origin,
        title: redact ? "[hidden]" : truncate(document.title, 120),
      },
      pageType: detectPageType(),
      redacted: redact,
      errors: errorLog.slice(),
      recordedContext: recordedContext.slice(),
      gradesAttendanceDebugDataset: (() => {
        const raw = document.documentElement?.dataset?.eeGradesAttendanceDebug;
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw);
          return redact ? { present: true, keys: Object.keys(parsed) } : parsed;
        } catch (_) {
          return { present: true, parseError: true };
        }
      })(),
      gradesSample,
      containers,
      collectedAt: new Date().toISOString(),
    };
  }

  // ---- On-demand page style inspector -----------------------------------
  // This is deliberately session-only. It helps turn a visual mismatch into a
  // useful, privacy-safe report without collecting any page text or identifiers.
  const INSPECTOR_ATTR = "data-ee-page-style-inspector";
  const INSPECTOR_HIGHLIGHT = "ee-page-style-inspector-target";
  const INSPECTOR_STORAGE_KEY = "eePageStyleInspector";
  const MAX_INSPECTOR_ITEMS = 100;
  const inspector = { enabled: false, mode: "theme", items: [], highlighted: null, root: null, status: null };

  function inspectorText(key, fallback) {
    try { return chrome.i18n?.getMessage(key) || fallback; } catch (_) { return fallback; }
  }

  function safeClassNames(element, limit = 8) {
    return Array.from(element?.classList || [])
      .filter((name) => !name.startsWith("ee-") && name.length <= 80)
      .slice(0, limit);
  }

  function persistInspector() {
    try {
      sessionStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({
        version: 1,
        active: inspector.enabled,
        mode: inspector.mode,
        items: inspector.items.slice(-MAX_INSPECTOR_ITEMS),
      }));
    } catch (_) { /* session storage is optional */ }
  }

  function restoreInspector() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(INSPECTOR_STORAGE_KEY) || "null");
      if (!saved || saved.version !== 1 || !Array.isArray(saved.items)) return false;
      inspector.items = saved.items.slice(-MAX_INSPECTOR_ITEMS);
      inspector.mode = ["theme", "redesign", "cleanup"].includes(saved.mode) ? saved.mode : "theme";
      return saved.active === true;
    } catch (_) {
      return false;
    }
  }

  function clearInspectorItems() {
    inspector.items = [];
    persistInspector();
    if (inspector.status) {
      inspector.status.textContent = inspectorText("pageStyleInspectorCleared", "Report cleared.");
    }
  }

  function selectorPart(element) {
    const tag = String(element?.tagName || "div").toLowerCase();
    const classNames = safeClassNames(element, 4)
      .filter((name) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name));
    return `${tag}${classNames.map((name) => `.${name}`).join("")}`;
  }

  function safeStyleSelector(selector) {
    const value = String(selector || "").trim();
    // Rule selectors are useful for a style fix, but never retain DOM IDs or
    // attribute selectors: either can encode a user-specific value.
    if (!value || value.length > 240 || /[#[\]]/.test(value)) return null;
    return value;
  }

  function matchedStyleSources(element) {
    const sources = { inlineProperties: [], backgroundSelectors: [], colorSelectors: [] };
    if (element.style) {
      ["background", "background-color", "color"].forEach((property) => {
        if (element.style.getPropertyValue(property)) sources.inlineProperties.push(property);
      });
    }

    const addMatchingRules = (rules) => {
      Array.from(rules || []).forEach((rule) => {
        if (sources.backgroundSelectors.length >= 8 && sources.colorSelectors.length >= 8) return;
        if (rule.cssRules) addMatchingRules(rule.cssRules);
        if (!rule.selectorText || !rule.style) return;
        const selector = safeStyleSelector(rule.selectorText);
        if (!selector) return;
        try {
          if (!element.matches(selector)) return;
        } catch (_) {
          return;
        }
        if (
          sources.backgroundSelectors.length < 8
          && (rule.style.getPropertyValue("background") || rule.style.getPropertyValue("background-color"))
        ) {
          sources.backgroundSelectors.push(selector);
        }
        if (sources.colorSelectors.length < 8 && rule.style.getPropertyValue("color")) {
          sources.colorSelectors.push(selector);
        }
      });
    };

    Array.from(document.styleSheets || []).forEach((sheet) => {
      try { addMatchingRules(sheet.cssRules); } catch (_) { /* cross-origin stylesheet */ }
    });
    return sources;
  }

  function describeElement(element) {
    const styles = getComputedStyle(element);
    const border = (side) => ({
      color: styles.getPropertyValue(`border-${side}-color`),
      width: styles.getPropertyValue(`border-${side}-width`),
      style: styles.getPropertyValue(`border-${side}-style`),
    });
    const ancestors = [];
    let current = element;
    for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
      ancestors.push({ tag: String(current.tagName || "div").toLowerCase(), classes: safeClassNames(current) });
    }
    const rect = element.getBoundingClientRect();
    return {
      selector: ancestors.map(selectorPart).reverse().join(" > "),
      tag: String(element.tagName || "div").toLowerCase(),
      classes: safeClassNames(element, 16),
      ancestors,
      styleSources: matchedStyleSources(element),
      size: { width: Math.round(rect.width), height: Math.round(rect.height) },
      computed: {
        display: styles.display,
        visibility: styles.visibility,
        position: styles.position,
        opacity: styles.opacity,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage && styles.backgroundImage !== "none" ? "present" : "none",
        border: { top: border("top"), right: border("right"), bottom: border("bottom"), left: border("left") },
        boxShadow: styles.boxShadow && styles.boxShadow !== "none" ? "present" : "none",
        outline: styles.outline,
        fontSize: styles.fontSize,
        fontWeight: styles.fontWeight,
      },
    };
  }

  function inspectorReport() {
    const rootStyles = getComputedStyle(document.documentElement);
    const themeVariables = ["--ee-page-bg", "--ee-card-bg", "--ee-header-bg", "--ee-text", "--ee-muted-text", "--ee-border", "--ee-link", "--ee-current-period"]
      .reduce((values, name) => {
        const value = rootStyles.getPropertyValue(name).trim();
        if (value) values[name] = value;
        return values;
      }, {});
    return {
      schema: "ee-page-style-inspector/v1",
      theme: {
        darkMode: document.documentElement.classList.contains("ee-dark"),
        documentClasses: safeClassNames(document.documentElement, 24),
        variables: themeVariables,
      },
      items: inspector.items,
      privacy: "No page text, IDs, attribute values, screenshots, or URLs are included.",
    };
  }

  async function copyInspectorReport() {
    const report = JSON.stringify(inspectorReport(), null, 2);
    try {
      await navigator.clipboard.writeText(report);
      inspector.status.textContent = inspectorText("pageStyleInspectorCopied", "Report copied.");
    } catch (_) {
      const fallback = document.createElement("textarea");
      fallback.value = report;
      fallback.setAttribute("readonly", "");
      fallback.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      inspector.status.textContent = copied
        ? inspectorText("pageStyleInspectorCopied", "Report copied.")
        : inspectorText("pageStyleInspectorCopyFailed", "Could not copy the report automatically.");
    }
  }

  function setInspectorMode(mode) {
    inspector.mode = mode;
    inspector.root?.querySelectorAll("button[data-ee-inspector-mode]").forEach((button) => {
      const active = button.dataset.eeInspectorMode === mode;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    });
    persistInspector();
    if (inspector.status) {
      const labels = {
        theme: inspectorText("pageStyleInspectorTheme", "Theme mapping"),
        redesign: inspectorText("pageStyleInspectorRedesign", "Redesign"),
        cleanup: inspectorText("pageStyleInspectorCleanup", "Cleanup"),
      };
      inspector.status.textContent = `${inspectorText("pageStyleInspectorSelected", "Selected:")} ${labels[mode]}.`;
    }
  }

  function clearInspectorHighlight() {
    inspector.highlighted?.classList.remove(INSPECTOR_HIGHLIGHT);
    inspector.highlighted = null;
  }

  function disableInspector() {
    clearInspectorHighlight();
    inspector.root?.remove();
    inspector.root = null;
    inspector.status = null;
    inspector.enabled = false;
    persistInspector();
    document.removeEventListener("pointermove", onInspectorPointerMove, true);
    document.removeEventListener("click", onInspectorClick, true);
  }

  function buildInspector() {
    if (inspector.root?.isConnected || !document.documentElement) return;
    inspector.root = null;
    const root = document.createElement("div");
    root.setAttribute(INSPECTOR_ATTR, "");
    const hint = document.createElement("span");
    hint.textContent = inspectorText("pageStyleInspectorHint", "Cmd/Ctrl+Shift-click an element");
    root.appendChild(hint);
    const addButton = (label, attribute, value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute(attribute, value || "");
      button.textContent = label;
      root.appendChild(button);
      return button;
    };
    const themeButton = addButton(inspectorText("pageStyleInspectorTheme", "Theme"), "data-ee-inspector-mode", "theme");
    const redesignButton = addButton(inspectorText("pageStyleInspectorRedesign", "Redesign"), "data-ee-inspector-mode", "redesign");
    const cleanupButton = addButton(inspectorText("pageStyleInspectorCleanup", "Cleanup"), "data-ee-inspector-mode", "cleanup");
    const copyButton = addButton(inspectorText("pageStyleInspectorCopy", "Copy report"), "data-ee-inspector-copy");
    const clearButton = addButton(inspectorText("pageStyleInspectorClear", "Clear"), "data-ee-inspector-clear");
    const doneButton = addButton(inspectorText("pageStyleInspectorDone", "Done"), "data-ee-inspector-done");
    const status = document.createElement("span");
    status.setAttribute("data-ee-inspector-status", "");
    status.setAttribute("aria-live", "polite");
    root.appendChild(status);
    const style = document.createElement("style");
    style.textContent = `
      [${INSPECTOR_ATTR}] { position: fixed !important; z-index: 2147483647 !important; right: 12px !important; bottom: 12px !important; display: flex !important; align-items: center !important; gap: 6px !important; max-width: calc(100vw - 24px) !important; padding: 8px !important; border: 1px solid #6b7280 !important; border-radius: 6px !important; background: #111827 !important; color: #f9fafb !important; font: 13px/1.2 system-ui, sans-serif !important; box-shadow: 0 3px 12px rgba(0,0,0,.35) !important; pointer-events: auto !important; }
      [${INSPECTOR_ATTR}], [${INSPECTOR_ATTR}] * { pointer-events: auto !important; box-sizing: border-box !important; }
      [${INSPECTOR_ATTR}] button { min-height: 30px !important; border: 1px solid #6b7280 !important; border-radius: 4px !important; background: #1f2937 !important; color: inherit !important; cursor: pointer !important; padding: 4px 7px !important; font: inherit !important; }
      [${INSPECTOR_ATTR}] button[data-active="true"] { background: #0369a1 !important; border-color: #bae6fd !important; color: #fff !important; }
      [${INSPECTOR_ATTR}] button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
      .${INSPECTOR_HIGHLIGHT} { outline: 2px solid #f59e0b !important; outline-offset: 2px !important; }
      @media (max-width: 720px) { [${INSPECTOR_ATTR}] { left: 8px; right: 8px; bottom: 8px; flex-wrap: wrap; } }
    `;
    root.appendChild(style);
    // EduPage sometimes replaces body during client-side navigation. Keeping
    // this debug-only toolbar directly under html lets the active session
    // survive that replacement without a broad observer.
    document.documentElement.appendChild(root);
    inspector.root = root;
    inspector.status = status;
    [themeButton, redesignButton, cleanupButton].forEach((button) => {
      button.addEventListener("click", () => setInspectorMode(button.dataset.eeInspectorMode));
    });
    copyButton.addEventListener("click", copyInspectorReport);
    clearButton.addEventListener("click", clearInspectorItems);
    doneButton.addEventListener("click", disableInspector);
    setInspectorMode(inspector.mode);
  }

  function onInspectorPointerMove(event) {
    if (!inspector.enabled) return;
    const element = event.target instanceof Element ? event.target : null;
    if (!element || element.closest(`[${INSPECTOR_ATTR}]`)) return;
    if (inspector.highlighted === element) return;
    clearInspectorHighlight();
    element.classList.add(INSPECTOR_HIGHLIGHT);
    inspector.highlighted = element;
  }

  function onInspectorClick(event) {
    if (!inspector.enabled || !(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
    const element = event.target instanceof Element ? event.target : null;
    if (!element || element.closest(`[${INSPECTOR_ATTR}]`)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    inspector.items.push({ kind: inspector.mode, ...describeElement(element) });
    if (inspector.items.length > MAX_INSPECTOR_ITEMS) inspector.items.shift();
    persistInspector();
    clearInspectorHighlight();
    inspector.status.textContent = inspectorText("pageStyleInspectorCaptured", "Captured") + ` (${inspector.items.length})`;
  }

  function enableInspector() {
    if (inspector.enabled) return;
    inspector.enabled = true;
    persistInspector();
    document.addEventListener("pointermove", onInspectorPointerMove, true);
    document.addEventListener("click", onInspectorClick, true);
    buildInspector();
  }

  if (window.top === window.self && restoreInspector()) enableInspector();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "ee-collect-page-diagnostics") {
      // The collect request is broadcast to every frame in the tab (EduPage
      // renders some views in iframes). Instead of racing on a single
      // sendResponse, each frame reports its own snapshot back to the
      // background aggregator, keyed by requestId. The background keeps the top
      // frame plus any frame that actually captured content.
      let data;
      try {
        data = collect(message);
      } catch (error) {
        data = {
          collectError: stringifyArg(error),
          frame: { isTop: window.top === window.self, origin: location.origin },
          containers: [],
        };
      }
      try {
        chrome.runtime.sendMessage({
          type: "ee-page-diagnostics-result",
          requestId: message.requestId || null,
          data,
        });
      } catch (_) { /* background may be asleep; ignore */ }
      // Also answer the direct call so a caller can detect the frame responded.
      try { sendResponse({ ok: true }); } catch (_) { /* ignore */ }
      return false;
    }
    if (message?.type === "ee-toggle-page-style-inspector") {
      if (message.enabled) enableInspector();
      else disableInspector();
      try { sendResponse({ ok: true }); } catch (_) { /* ignore */ }
      return false;
    }
    return undefined;
  });

  window.__eeDiagnostics = {
    record,
    getErrors: () => errorLog.slice(),
  };
})();
