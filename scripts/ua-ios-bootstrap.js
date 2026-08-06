/**
 * ua-ios-bootstrap.js - MAIN-world fallback for iOS /app compatibility
 *
 * Chromium executes ua-ios-fix.js directly in the MAIN world through the
 * manifest. Safari-compatible WebExtension hosts such as Orion may ignore the
 * `world` key and isolate that script from EduPage. A dynamically inserted
 * external script can also lose the race against EduPage's parser-loaded app
 * bootstrap, so install the two critical property shadows synchronously with
 * a constant inline page script before loading the packaged follow-up.
 */
(() => {
  "use strict";

  if (window.top !== window.self) return;
  if (!/iP(hone|ad|od)/i.test(navigator.userAgent || "")) return;
  if (!/^\/app(?:\/|$)/i.test(String(location.pathname || ""))) return;

  // Constant source only: never interpolate page or extension data into this
  // page-world script. EduPage currently sends no CSP header on /app/main, so
  // Orion/WebKit can execute it synchronously when the node is inserted.
  const EARLY_COMPAT_SOURCE = `(() => {
    "use strict";
    if (window.top !== window.self) return;
    const realUA = navigator.userAgent || "";
    if (!/iP(hone|ad|od)/i.test(realUA)) return;
    if (!/^\\/app(?:\\/|$)/i.test(String(location.pathname || ""))) return;

    const handlers = window.webkit?.messageHandlers;
    const nativeBridge = Boolean(
      window.AscNativeWebview
      || window.NativeWebviewProvider
      || window.NativePersistenceProvider
      || handlers?.webViewANE
      || handlers?.NativeWebviewProvider
      || handlers?.NativePersistenceProvider
    );
    if (nativeBridge) {
      document.documentElement.dataset.eeIosCompatEarly = "native";
      return;
    }
    if (window.__eeIosEarlyCompat?.active) return;

    const shadow = (object, property, value) => {
      try {
        Object.defineProperty(object, property, {
          configurable: true,
          get: () => value,
        });
        return object[property] === value;
      } catch (_) {
        return false;
      }
    };
    const androidMobileUA =
      "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    const uaSpoofed = shadow(navigator, "userAgent", androidMobileUA);
    const webkitHidden = shadow(window, "webkit", undefined);

    window.__eeIosEarlyCompat = {
      active: true,
      nativeBridge: false,
      realUA,
      uaSpoofed,
      webkitHidden,
    };
    document.documentElement.dataset.eeIosCompatEarly = webkitHidden
      ? "ready"
      : "webkit-visible";
  })();`;

  const inject = () => {
    const root = document.documentElement;
    if (!root) return false;

    const early = document.createElement("script");
    early.textContent = EARLY_COMPAT_SOURCE;
    early.dataset.eeIosEarlyBootstrap = "true";
    root.prepend(early);
    early.remove();

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("scripts/ua-ios-fix.js");
    script.async = false;
    script.dataset.eeIosMainBootstrap = "true";
    script.addEventListener("load", () => script.remove(), { once: true });
    script.addEventListener("error", () => script.remove(), { once: true });
    root.prepend(script);
    if (!root.dataset.eeIosCompatEarly) {
      root.dataset.eeIosCompatBootstrap = "inline-blocked";
    }
    return true;
  };

  if (inject()) return;

  const observer = new MutationObserver(() => {
    if (!inject()) return;
    observer.disconnect();
  });
  observer.observe(document, { childList: true });
})();
