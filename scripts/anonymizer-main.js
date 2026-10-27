// Read only the displayed account name. The isolated enhancer requests it when enabled.
(() => {
  "use strict";
  const READY = "ee-anonymizer-name-ready";
  function announceReady() { document.dispatchEvent(new Event(READY)); }
  document.addEventListener("ee-anonymizer-name-request", () => {
    let name = "";
    try {
      const jq = window.$j;
      if (typeof jq === "function") {
        const bar = jq("#edubar");
        const value = typeof bar.edubar === "function" ? bar.edubar("option", "loggedUserName") : null;
        if (typeof value === "string") name = value.trim().slice(0, 200);
      }
    } catch (_) { /* The widget may not be initialized yet. */ }
    // A primitive string works across Firefox's isolated-world boundary too.
    document.dispatchEvent(new CustomEvent("ee-anonymizer-name", { detail: name }));
  });
  document.addEventListener("DOMContentLoaded", announceReady, { once: true });
  document.addEventListener("load", event => {
    if (event.target?.tagName === "SCRIPT") announceReady();
  }, true);
  window.addEventListener("pageshow", announceReady);
  announceReady();
})();
