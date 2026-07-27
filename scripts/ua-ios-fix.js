/**
 * ua-ios-fix.js - Edupage Extras: iOS mobile /app/main fix
 *
 * EduPage's /app/main React app hides the web login (rendering only an empty
 * menu shell) whenever navigator.userAgent looks like iOS, to steer users into
 * the native app. That is why the mobile /app/main redirect works on Android
 * and desktop but shows a blank page on iPhone/iPad. Running in the MAIN world
 * at document_start, we shadow navigator.userAgent with an Android *mobile* UA
 * before EduPage's own scripts read it, so the responsive layout loads as it
 * does everywhere else.
 *
 * Scoped to /app/* so no other iOS behaviour on the site changes. Isolated-world
 * scripts (the redirect in content.js) keep seeing the real UA, so mobile
 * detection and the redirect itself are unaffected.
 */
(() => {
  "use strict";
  const realUA = navigator.userAgent || "";
  // Only iOS is gated by EduPage, and only /app/* is affected — bail otherwise.
  if (!/iP(hone|ad|od)/i.test(realUA)) return;
  if (!String(location.pathname || "").startsWith("/app/")) return;

  // Keep "Mobile" in the UA so EduPage still serves the narrow responsive layout.
  const UA =
    "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
  const shadow = (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, { get: () => value, configurable: true });
    } catch (_) {
      /* property non-configurable — skip */
    }
  };
  shadow(Navigator.prototype, "userAgent", UA);
  shadow(navigator, "userAgent", UA);
  shadow(Navigator.prototype, "appVersion", "5.0 (Linux; Android 14; Mobile)");
  shadow(Navigator.prototype, "platform", "Linux armv8l");
  shadow(Navigator.prototype, "vendor", "Google Inc.");
})();
