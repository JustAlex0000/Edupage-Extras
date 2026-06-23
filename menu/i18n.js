/**
 * i18n.js - lightweight localization helper for the extension pages.
 *
 * Strings live in _locales/<lang>/messages.json. Mark up HTML with:
 *   data-i18n="key"            -> sets textContent
 *   data-i18n-html="key"       -> sets innerHTML (for our own trusted markup)
 *   data-i18n-attr="attr:key"  -> sets one or more attributes (";"-separated)
 * Set data-i18n-title on <html> to localize the document <title>.
 *
 * Page scripts can also call window.eeI18n.msg(key, substitutions) for the
 * dynamic strings they build at runtime.
 */
(function () {
  "use strict";

  function msg(key, substitutions) {
    if (!key) return "";
    const value = chrome.i18n.getMessage(key, substitutions);
    return value || key;
  }

  function applyI18n(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      const text = msg(element.getAttribute("data-i18n"));
      if (text) element.textContent = text;
    });

    root.querySelectorAll("[data-i18n-html]").forEach((element) => {
      const text = msg(element.getAttribute("data-i18n-html"));
      if (text) element.innerHTML = text;
    });

    root.querySelectorAll("[data-i18n-attr]").forEach((element) => {
      element.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
        const [attr, key] = pair.split(":").map((part) => part.trim());
        if (!attr || !key) return;
        const text = msg(key);
        if (text) element.setAttribute(attr, text);
      });
    });

    const titleKey = document.documentElement.getAttribute("data-i18n-title");
    if (titleKey) {
      const title = msg(titleKey);
      if (title) document.title = title;
    }

    const uiLanguage = (typeof chrome.i18n.getUILanguage === "function"
      ? chrome.i18n.getUILanguage()
      : "en") || "en";
    document.documentElement.lang = uiLanguage.slice(0, 2);
  }

  // chrome://extensions/shortcuts (and chrome:// URLs generally) don't exist in
  // Firefox — there's no direct deep link to its shortcuts UI, so callers need
  // to know which browser they're in to offer the right action/explanation.
  const isFirefox = /\bFirefox\//.test(navigator.userAgent || "");

  window.eeI18n = { msg, applyI18n, isFirefox };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyI18n(), { once: true });
  } else {
    applyI18n();
  }
})();
