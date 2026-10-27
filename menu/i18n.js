/**
 * i18n.js - lightweight localization helper for the extension pages.
 *
 * Strings live in _locales/<lang>/messages.json. Mark up HTML with:
 *   data-i18n="key"            -> sets textContent
 *   data-i18n-html="key"       -> renders our own markup (a small allowlisted
 *                                 set of inline tags) without using innerHTML
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
    const value = EE.getMessage(key, substitutions);
    return value || key;
  }

  // Bundled locale strings are trusted, but build real DOM nodes instead of
  // innerHTML anyway — structurally safer (and avoids extension-store linters
  // flagging dynamic innerHTML assignment, even though the source is our own
  // _locales/*.json). Only this small inline-tag allowlist is supported; any
  // other tag is dropped to plain text content.
  const ALLOWED_INLINE_TAGS = new Set(["strong", "em", "code", "b", "i", "br"]);

  function appendSafeInlineMarkup(target, html) {
    const tagPattern = /<(\/?)([a-zA-Z]+)\s*\/?>/g;
    const stack = [target];
    let lastIndex = 0;
    let match;
    while ((match = tagPattern.exec(html))) {
      const [whole, closing, rawTag] = match;
      const tag = rawTag.toLowerCase();
      if (match.index > lastIndex) {
        stack[stack.length - 1].appendChild(document.createTextNode(html.slice(lastIndex, match.index)));
      }
      lastIndex = match.index + whole.length;
      if (!ALLOWED_INLINE_TAGS.has(tag)) continue;
      if (tag === "br") {
        stack[stack.length - 1].appendChild(document.createElement("br"));
      } else if (closing) {
        if (stack.length > 1) stack.pop();
      } else {
        const el = document.createElement(tag);
        stack[stack.length - 1].appendChild(el);
        stack.push(el);
      }
    }
    if (lastIndex < html.length) {
      stack[stack.length - 1].appendChild(document.createTextNode(html.slice(lastIndex)));
    }
  }

  function applyI18n(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      const text = msg(element.getAttribute("data-i18n"));
      if (text) element.textContent = text;
    });

    root.querySelectorAll("[data-i18n-html]").forEach((element) => {
      const text = msg(element.getAttribute("data-i18n-html"));
      if (!text) return;
      element.textContent = "";
      appendSafeInlineMarkup(element, text);
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

    const uiLanguage = EE.getUILanguage() || "en";
    document.documentElement.lang = uiLanguage.slice(0, 2);
  }

  // chrome://extensions/shortcuts (and chrome:// URLs generally) don't exist in
  // Firefox — there's no direct deep link to its shortcuts UI, so callers need
  // to know which browser they're in to offer the right action/explanation.
  const isFirefox = /\bFirefox\//.test(navigator.userAgent || "");

  window.eeI18n = { msg, applyI18n, isFirefox };
  EE.i18n?.subscribe(() => {
    if (document.readyState !== "loading") applyI18n();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyI18n(), { once: true });
  } else {
    applyI18n();
  }
})();
