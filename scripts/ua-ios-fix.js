/**
 * ua-ios-fix.js - Edupage Extras: iOS mobile /app/main fix
 *
 * EduPage's /app/main React app assumes that any iOS WebKit browser is its
 * native container. In an ordinary iOS browser that sends module/translation
 * requests through a bridge which is not present, leaving the app on its
 * loading screen. The page also hides its web login for an iOS user agent.
 *
 * Scoped to /app/*, this bootstrap hides the generic WebKit namespace for the
 * page lifetime, spoofs only the UA needed by the login gate, and preserves
 * the real iPhone platform so EduPage's iOS layout/keyboard fixes remain
 * enabled. A separate isolated-world bootstrap injects this file for
 * Safari-compatible hosts that do not implement Manifest V3's MAIN world.
 */
(() => {
  "use strict";
  const earlyCompat = window.__eeIosEarlyCompat;
  const realUA = earlyCompat?.realUA || navigator.userAgent || "";
  // Only iOS is gated by EduPage, and only /app/* is affected — bail otherwise.
  if (window.top !== window.self) return;
  if (!/iP(hone|ad|od)/i.test(realUA)) return;
  if (!/^\/app(?:\/|$)/i.test(String(location.pathname || ""))) return;

  const realWebkit = earlyCompat ? undefined : window.webkit;

  const androidMobileUA =
    "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

  const shadow = (object, property, value) => {
    try {
      Object.defineProperty(object, property, {
        configurable: true,
        get: () => value,
      });
      return true;
    } catch (_) {
      return false;
    }
  };

  const hasEdupageNativeBridge = () => {
    if (earlyCompat) return earlyCompat.nativeBridge === true;
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

  // Do not alter a genuine EduPage container, including its user agent and
  // native touch behavior.
  if (hasEdupageNativeBridge()) return;
  if (window.__eeIosAppCompatInstalled) return;
  window.__eeIosAppCompatInstalled = true;

  // The login gate reads userAgent. Keep platform/vendor untouched so
  // MobileAppBridge.isIOS() still enables EduPage's own iOS adaptations.
  shadow(Navigator.prototype, "userAgent", androidMobileUA);
  shadow(navigator, "userAgent", androidMobileUA);

  // Edupage.js checks only `window.webkit`, not whether EduPage's native
  // message handlers exist. It repeats that truthiness check for every RPC,
  // and lazily loaded appstorage modules do the same. Keep the generic browser
  // namespace hidden for this /app page rather than restoring it after the
  // initial script load. The captured reference above remains available only
  // for detecting a genuine EduPage bridge.
  shadow(window, "webkit", undefined);
  if (document.documentElement?.dataset) {
    document.documentElement.dataset.eeIosCompat = window.webkit === undefined
      ? "active"
      : "webkit-visible";
  }

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
    disableINoBounce();
    guardNativeSchemeFallback();
    observer.disconnect();
  }, { once: true });
})();
