// Restore the question view for the student's loaded results; keep native evaluation.
(() => {
  "use strict";
  if (window.top !== window) return;
  const PORT = "ee-etest-results-port";
  let enabled = false;
  const patches = new Map();
  const METHODS = ["zobrazovatOtazky"];
  let observer = null;
  let deadline = null;
  let pending = null;

  function onResultsRoute() {
    return /^\/elearning(?:\/|$)/.test(window.location.pathname);
  }

  function mayShow(obj, level, userid) {
    if (!enabled || !onResultsRoute() || level !== "l2or3") return false;
    const student = window.EdubarUtils?.isStudentOrParent?.();
    if (!student || userid !== `Student${student}`) return false;
    const row = obj.getBestVysledokRow?.(userid);
    // Visibility depends on a loaded own result, not EduPage's changing status names.
    return !!row;
  }

  function restore() {
    for (const [name, patch] of patches) {
      if (patch.owner[name] === patch.wrapper) patch.owner[name] = patch.original;
    }
    patches.clear();
  }

  function install() {
    if (!enabled || !onResultsRoute()) {
      restore();
      return;
    }
    const resultOwner = window.ETestSuperPridelenie?.prototype;
    const targets = METHODS.map((name) => ({ name, owner: resultOwner }));
    let installed = false;
    for (const { name, owner } of targets) {
      const patch = patches.get(name);
      if (patch && patch.owner === owner && owner?.[name] === patch.wrapper) continue;
      if (patch && patch.owner[name] === patch.wrapper) patch.owner[name] = patch.original;
      patches.delete(name);
      const original = owner?.[name];
      if (typeof original !== "function") continue;
      const wrapper = function (level, userid) {
        try {
          if (mayShow(this, level, userid)) {
            return true;
          }
        } catch (_) { /* Unsupported EduPage versions keep their native behavior. */ }
        return original.apply(this, arguments);
      };
      owner[name] = wrapper;
      patches.set(name, { owner, original, wrapper });
      installed = true;
    }
    return installed;
  }

  function refreshVisibleResults() {
    const selected = document.querySelector('[data-tab="results:results"].selected');
    const panel = document.querySelector(".etest-empty-list, .etest-results-students-main");
    const jq = window.jQuery;
    if (!selected || !panel || typeof jq !== "function") return;
    // The results viewer exposes a local redraw; do not reload or save test data.
    for (let elem = panel.parentElement; elem; elem = elem.parentElement) {
      const actions = jq(elem).data("publicActions");
      if (typeof actions?.changePohlad === "function") {
        actions.changePohlad("results");
        return;
      }
    }
  }

  function stopWatching() {
    observer?.disconnect();
    observer = null;
    clearTimeout(deadline);
    clearTimeout(pending);
    deadline = pending = null;
  }

  function notifyView() {
    document.dispatchEvent(new Event("ee-etest-results-render"));
  }

  function watch() {
    const installed = install();
    if (installed) {
      try { refreshVisibleResults(); } catch (_) { /* Unsupported renderer. */ }
    }
    notifyView();
    if (!enabled || !onResultsRoute()) {
      stopWatching();
      return installed;
    }
    if (observer || !document.body) return installed;
    observer = new MutationObserver(() => {
      if (pending !== null) return;
      pending = setTimeout(() => {
        pending = null;
        const installed = install();
        if (installed) {
          try { refreshVisibleResults(); } catch (_) { /* Unsupported renderer. */ }
        }
        notifyView();
        if (!onResultsRoute()) stopWatching();
      }, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    deadline = setTimeout(stopWatching, 15000);
    return installed;
  }

  function sync() {
    const next = document.getElementById(PORT)?.dataset.enabled === "true";
    if (next === enabled) return;
    enabled = next;
    stopWatching();
    if (!watch()) {
      try { refreshVisibleResults(); } catch (_) { /* Fail quietly on unsupported pages. */ }
    }
    notifyView();
  }

  document.addEventListener("ee-etest-results-state", sync);
  // Capture runs before EduPage's handlers, including both Answers entry points.
  document.addEventListener("click", watch, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") watch();
  }, true);
  document.addEventListener("DOMContentLoaded", () => { sync(); watch(); }, { once: true });
  window.addEventListener("popstate", watch);
  window.addEventListener("pageshow", watch);
  window.addEventListener("pagehide", () => { stopWatching(); restore(); });
  document.dispatchEvent(new Event("ee-etest-results-ready"));
  sync();

  if (globalThis.__EE_TEST__) globalThis.__eeTestExports = { mayShow, install, sync, watch };
})();
