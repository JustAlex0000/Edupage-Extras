// Template for a new page enhancer. NOT listed in manifest.json — copy it to
// scripts/<feature>-enhancer.js, work through the TODOs, then wire up the
// four touchpoints listed in CONTRIBUTING.md ("Adding a feature"):
// manifest `js` entry, settings row, _locales strings, a test.
//
// Content scripts run at document_start in ALL frames — <body> may not exist
// yet when storage callbacks fire, and the script runs again in every iframe.
// This skeleton handles both; see ARCHITECTURE.md for why.
(function () {
  "use strict";

  // TODO: top-frame guard — drop only if the feature must run inside iframes.
  if (window.top !== window) return;

  // TODO: path guard — bail early on pages this enhancer doesn't touch.
  if (!/^\/example\//i.test(window.location.pathname)) return;

  // TODO: storage toggle key — ee-prefixed camelCase (see CONTRIBUTING.md).
  const FEATURE_KEY = "eeExampleFeatureEnabled";
  // TODO: any DOM ids/classes the enhancer injects use an "ee-" prefix.
  const CONTAINER_ID = "ee-example-container";
  // TODO: default-on (`!== false`) vs default-off (`=== true`) — cosmetic
  // enhancements safe everywhere default on; behavior-changing or
  // school-specific features default off.
  let featureEnabled = true;
  let observerTimer = null;

  function getMessage(key, fallback) {
    try {
      return chrome.i18n.getMessage(key) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  // Idempotent: called repeatedly by the observer; must be cheap when there
  // is nothing to do, and must clean up after itself when the toggle is off.
  function enhance() {
    const existing = document.getElementById(CONTAINER_ID);
    if (!featureEnabled) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    // TODO: find the anchor element on the page; return silently if the page
    // content hasn't rendered yet — the observer will call again.
    const anchor = document.querySelector(".example-anchor");
    if (!anchor) return;

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    // TODO: build UI. Use --ee-* CSS variables for any colors, and
    // getMessage("exampleKey", "Fallback") for any visible string (add the
    // key to _locales/en, sk and cs — key sets must stay identical).
    container.textContent = getMessage("exampleFeatureLabel", "Example");
    anchor.appendChild(container);
  }

  // EduPage renders most content asynchronously — a debounced
  // MutationObserver re-runs enhance() as the page fills in.
  function scheduleEnhance() {
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      enhance();
    }, 150);
  }

  function initObserver() {
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function initStorage() {
    chrome.storage.local.get([FEATURE_KEY], (result) => {
      featureEnabled = result[FEATURE_KEY] !== false; // default-on form
      enhance();
    });

    // Re-apply live when the user flips the toggle in settings — enhance()
    // handles both adding (enabled) and removing (disabled) the UI.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes[FEATURE_KEY]) return;
      featureEnabled = changes[FEATURE_KEY].newValue !== false;
      enhance();
    });
  }

  function init() {
    initStorage();
    initObserver();
  }

  // document_start: body may not exist yet.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
