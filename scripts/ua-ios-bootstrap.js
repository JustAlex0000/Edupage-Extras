/**
 * ua-ios-bootstrap.js - MAIN-world fallback for iOS /app compatibility
 *
 * Chromium executes ua-ios-fix.js directly in the MAIN world through the
 * manifest. Safari-compatible WebExtension hosts such as Orion may ignore the
 * `world` key and isolate that script from EduPage. Inject the same packaged
 * script into the page so those hosts get the compatibility fix as well.
 */
(() => {
  "use strict";

  if (window.top !== window.self) return;
  if (!/iP(hone|ad|od)/i.test(navigator.userAgent || "")) return;
  if (!String(location.pathname || "").startsWith("/app/")) return;

  const inject = () => {
    const root = document.documentElement;
    if (!root) return false;

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("scripts/ua-ios-fix.js");
    script.async = false;
    script.dataset.eeIosMainBootstrap = "true";
    script.addEventListener("load", () => script.remove(), { once: true });
    script.addEventListener("error", () => script.remove(), { once: true });
    root.prepend(script);
    return true;
  };

  if (inject()) return;

  const observer = new MutationObserver(() => {
    if (!inject()) return;
    observer.disconnect();
  });
  observer.observe(document, { childList: true });
})();
