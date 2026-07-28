/**
 * ua-ios-fix.js - Edupage Extras: iOS mobile /app/main fix
 *
 * EduPage's /app/main React app assumes that any iOS WebKit browser is its
 * native container. In an ordinary iOS browser that sends module/translation
 * requests through a bridge which is not present, leaving the app on its
 * loading screen. The page also hides its web login for an iOS user agent.
 *
 * Scoped to /app/*, this bootstrap temporarily hides the generic WebKit
 * namespace while EduPage installs its request transport, spoofs only the UA
 * needed by the login gate, and preserves the real iPhone platform so
 * EduPage's iOS layout/keyboard fixes remain enabled.
 */
(() => {
  "use strict";
  const realUA = navigator.userAgent || "";
  const realWebkit = window.webkit;
  // Only iOS is gated by EduPage, and only /app/* is affected — bail otherwise.
  if (!/iP(hone|ad|od)/i.test(realUA)) return;
  if (!String(location.pathname || "").startsWith("/app/")) return;

  const androidMobileUA =
    "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

  const shadow = (object, property, value) => {
    try {
      const ownDescriptor = Object.getOwnPropertyDescriptor(object, property);
      Object.defineProperty(object, property, {
        configurable: true,
        get: () => value,
      });
      return () => {
        try {
          if (ownDescriptor) {
            Object.defineProperty(object, property, ownDescriptor);
          } else {
            delete object[property];
          }
        } catch (_) {
          /* best-effort restoration */
        }
      };
    } catch (_) {
      return null;
    }
  };

  // The login gate reads userAgent. Keep platform/vendor untouched so
  // MobileAppBridge.isIOS() still enables EduPage's own iOS adaptations.
  shadow(Navigator.prototype, "userAgent", androidMobileUA);
  shadow(navigator, "userAgent", androidMobileUA);

  const hasEdupageNativeBridge = () => {
    const handlers = realWebkit?.messageHandlers;
    return Boolean(
      window.AscNativeWebview
      || window.NativeWebviewProvider
      || window.NativePersistenceProvider
      || handlers?.webViewANE
      || handlers?.NativeWebviewProvider
      || handlers?.NativePersistenceProvider
    );
  };

  // Edupage.js checks only `window.webkit`, not whether EduPage's native
  // message handlers exist. Hide it until that script has evaluated so its
  // native-only XMLHttpRequest replacement is not installed in Orion/Safari.
  const restoreWebkit = hasEdupageNativeBridge()
    ? null
    : shadow(window, "webkit", undefined);

  let webkitRestored = !restoreWebkit;
  const restoreBrowserWebkit = () => {
    if (webkitRestored) return;
    webkitRestored = true;
    restoreWebkit();
  };

  const disableINoBounce = () => {
    try {
      window.iNoBounce?.disable?.();
    } catch (_) {
      /* optional third-party helper */
    }
  };

  const guardNativeSchemeFallback = () => {
    const bridge = window.MobileAppBridge;
    if (!bridge || bridge.__eeBrowserCompat || hasEdupageNativeBridge()) return;
    const nativeRunFlexMethod = bridge.runFlexMethod;
    if (typeof nativeRunFlexMethod !== "function") return;
    bridge.runFlexMethod = function (...args) {
      if (!hasEdupageNativeBridge()
          && !window.AscNativeWebview
          && typeof window.MobileAppData === "undefined") {
        return false;
      }
      return nativeRunFlexMethod.apply(this, args);
    };
    bridge.__eeBrowserCompat = true;
  };

  const handleScript = (script) => {
    if (!(script instanceof HTMLScriptElement)) return;
    const src = script.src || "";
    if (src.includes("/app/pics/jsw/Edupage.js")) {
      script.addEventListener("load", () => {
        restoreBrowserWebkit();
        guardNativeSchemeFallback();
      }, { once: true });
      script.addEventListener("error", restoreBrowserWebkit, { once: true });
    }
    if (src.includes("/global/pics/js/edubarUtils.js")) {
      script.addEventListener("load", guardNativeSchemeFallback, { once: true });
    }
    if (src.includes("/app/pics/js/inobounce.js")) {
      script.addEventListener("load", disableINoBounce, { once: true });
    }
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLScriptElement) handleScript(node);
        node.querySelectorAll?.("script").forEach(handleScript);
      }
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  document.querySelectorAll("script").forEach(handleScript);

  window.addEventListener("DOMContentLoaded", () => {
    restoreBrowserWebkit();
    disableINoBounce();
    guardNativeSchemeFallback();
    observer.disconnect();
  }, { once: true });
})();
