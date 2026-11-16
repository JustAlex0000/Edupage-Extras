// Optional, gesture-based fullscreen restoration. Native browser exits remain available.
(() => {
  "use strict";
  if (window.top !== window || window.__eeTestFullscreenInit) return;
  window.__eeTestFullscreenInit = true;
  const KEY = "eeActivityShieldRestoreFullscreen";
  const KEYS = [KEY, "eeActivityShieldEnabled", "eeActivityShieldBlockEsc"];
  const nativeFocus = Document.prototype.hasFocus;
  const nativeHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden")?.get;
  let enabled = false, player = null, target = null, pending = false, requesting = false, attempted = false;
  let observer = null, discoveryTimer = null, revision = 0;

  function currentPlayer() {
    if (!/^\/elearning(?:\/|$)/.test(location.pathname)) return null;
    const root = document.querySelector(".etest-player");
    const view = root?.querySelector(".etest-screen-questions");
    return view?.querySelector(".etest-question-content") && view.getClientRects().length
      && getComputedStyle(view).visibility !== "hidden" ? root : null;
  }
  function reset() { player = null; target = null; pending = false; requesting = false; attempted = false; revision++; }
  function disconnect() { observer?.disconnect(); observer = null; clearTimeout(discoveryTimer); discoveryTimer = null; }
  function reconcile() {
    if (!enabled) return;
    const next = currentPlayer();
    if (next !== player) reset();
    player = next;
    if (!player) {
      target = null; pending = false;
      if (observer && discoveryTimer === null) discoveryTimer = setTimeout(disconnect, 30000);
      return;
    }
    clearTimeout(discoveryTimer); discoveryTimer = null;
    const fullscreen = document.fullscreenElement;
    const view = player.querySelector(".etest-screen-questions");
    if (fullscreen && (fullscreen === view || fullscreen.contains(view))) {
      target = fullscreen; pending = false; attempted = false;
    } else if (!fullscreen && target?.isConnected && !attempted) pending = true;
  }
  function discover() {
    if (!enabled || !document.body) return;
    if (!observer) {
      observer = new MutationObserver(reconcile);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
      discoveryTimer = setTimeout(disconnect, 30000);
    }
    reconcile();
  }
  function fullscreenChanged() { discover(); }
  function interaction(event) {
    if (!enabled || !event.isTrusted) return;
    // Never consume browser exits, modifier shortcuts or application switching.
    if (event.type === "keydown" && (event.altKey || event.ctrlKey || event.metaKey
      || ["Escape", "F11", "Tab", "Alt", "Control", "Meta", "Shift"].includes(event.key))) return;
    discover();
    if (!pending || requesting || !player || !target?.isConnected
      || !event.target?.closest?.(".etest-screen-questions") || document.fullscreenElement) return;
    try { if (!nativeFocus.call(document) || nativeHidden?.call(document)) return; }
    catch (_) { return; }
    const request = target.requestFullscreen;
    if (typeof request !== "function") { pending = false; return; }
    const stamp = revision;
    pending = false; requesting = true; attempted = true;
    try {
      // One request per observed exit, inside this genuine user gesture only.
      Promise.resolve(request.call(target)).catch(() => {}).finally(() => {
        if (revision === stamp) requesting = false;
      });
    } catch (_) { requesting = false; }
  }
  function configure(values) {
    enabled = values[KEY] === true && values.eeActivityShieldEnabled === true && values.eeActivityShieldBlockEsc !== false;
    reset(); disconnect();
    if (enabled) discover();
  }
  let values = {};
  chrome.storage.local.get(KEYS, result => {
    if (chrome.runtime.lastError) return;
    values = { ...result, ...values }; configure(values);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !KEYS.some(key => changes[key])) return;
    for (const key of KEYS) if (changes[key]) values[key] = changes[key].newValue;
    configure(values);
  });
  // Window capture observes native state before existing document-level handlers.
  window.addEventListener("fullscreenchange", fullscreenChanged, true);
  document.addEventListener("click", interaction, true);
  document.addEventListener("keydown", interaction, true);
  window.addEventListener("pageshow", discover);
  window.addEventListener("popstate", () => { reset(); discover(); });
  window.addEventListener("pagehide", () => { reset(); disconnect(); });
  document.addEventListener("DOMContentLoaded", discover, { once: true });
})();
