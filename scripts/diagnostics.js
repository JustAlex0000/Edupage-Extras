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
      // Subject name only — the teacher sits in a nested <div> we deliberately skip.
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

      // Original (pre-enhancement) grade tooltips show the title + date format.
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
    return undefined;
  });

  window.__eeDiagnostics = {
    record,
    getErrors: () => errorLog.slice(),
  };
})();
