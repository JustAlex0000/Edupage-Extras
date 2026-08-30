(function () {
  "use strict";

  if (window.top !== window) return;
  if (!/^\/login(?:\/|$)/i.test(window.location.pathname)) return;

  const AUTOLOGIN_KEY = "eeAutoLoginEnabled";
  const AUTOLOGIN_PREFERRED_ACCOUNT_KEY = "eeAutoLoginPreferredAccount";
  const STYLE_ID = "ee-autologin-style";
  let autoLoginEnabled = false;
  let preferredAccount = "";
  // EduPage's login is a multi-step modal (SSO trigger → account picker →
  // username → password). Each auto-advance fires at most once; the password
  // submit is terminal so a rejected password never loops.
  let ssoOpened = false;
  let accountPicked = false;
  let usernameSubmitted = false;
  let submitted = false;
  let userTyped = false;
  let watcherTimer = null;
  let watcherObserver = null;
  let watcherDomReadyHandler = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ee-autologin-badge {
        position: fixed;
        bottom: 12px;
        left: 12px;
        z-index: 2147483000;
        padding: 6px 12px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.7);
        color: #e0e0e0;
        font: 12px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif;
        pointer-events: none;
        opacity: 1;
        transition: opacity 0.4s ease;
      }
      .ee-autologin-badge.ee-fade {
        opacity: 0;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showBadge(text) {
    injectStyles();
    let badge = document.querySelector(".ee-autologin-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "ee-autologin-badge";
      badge.setAttribute("role", "status");
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.classList.remove("ee-fade");
    setTimeout(() => badge.classList.add("ee-fade"), 3000);
    setTimeout(() => badge.remove(), 3500);
  }

  function isVisible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight));
  }

  function isFieldFilled(input) {
    if (input.value && input.value.trim().length > 0) return true;

    try {
      const bg = window.getComputedStyle(input).backgroundColor;
      if (bg && /rgb\(232,\s*240,\s*254\)/.test(bg)) return true;
    } catch (_) { /* ignore */ }

    return false;
  }

  function findSubmitControl(container) {
    return (
      container.querySelector('button[type="submit"], input[type="submit"]') ||
      container.querySelector('button:not([type="button"]):not([type="reset"])')
    );
  }

  function submitVia(control, form) {
    setTimeout(() => {
      if (control) {
        control.click();
      } else if (form) {
        form.requestSubmit();
      }
    }, 200);
  }

  function tryAdvance() {
    if (submitted || !autoLoginEnabled || userTyped) return;

    const passwordInput = document.querySelector('input[type="password"]');
    if (isVisible(passwordInput)) {
      const form = passwordInput.closest("form");
      const container = form || document.body;
      const usernameInput = container.querySelector(
        'input[type="text"], input[type="email"], input:not([type])'
      );
      if (isVisible(usernameInput) && !isFieldFilled(usernameInput)) return;
      if (!isFieldFilled(passwordInput)) return;

      submitted = true;
      showBadge(chrome.i18n.getMessage("autoLoginSubmitting") || "Auto-logging in…");
      submitVia(findSubmitControl(container), form);
      return;
    }

    const usernameField = document.getElementById("usernamefield");
    if (!usernameSubmitted && isVisible(usernameField)) {
      if (!isFieldFilled(usernameField)) return;
      usernameSubmitted = true;
      const form = usernameField.closest("form");
      submitVia(form && findSubmitControl(form), form);
      return;
    }

    // Account picker: auto-pick when there is exactly one saved account, or
    // when a preferred account name is configured and matches exactly one
    // visible entry — otherwise leave it for the user to choose themselves.
    const savedAccounts = document.querySelectorAll(".mainlogin-userlist-item.userItem");
    if (!accountPicked && savedAccounts.length === 1 && isVisible(savedAccounts[0])) {
      accountPicked = true;
      savedAccounts[0].click();
      return;
    }
    if (!accountPicked && savedAccounts.length > 1 && preferredAccount) {
      const visibleAccounts = Array.from(savedAccounts).filter(isVisible);
      const needle = preferredAccount.toLowerCase();
      const matches = visibleAccounts.filter((account) =>
        (account.textContent || "").toLowerCase().includes(needle)
      );
      if (matches.length === 1) {
        accountPicked = true;
        matches[0].click();
        return;
      }
    }

    const ssoButton = document.querySelector(".skgdSsoLoginBtn");
    if (
      !ssoOpened &&
      !accountPicked &&
      isVisible(ssoButton) &&
      !document.querySelector(".mainlogin-outer")
    ) {
      ssoOpened = true;
      ssoButton.click();
    }
  }

  function watchManualTyping(event) {
    // A keystroke in any credential field hands control back to the user —
    // never auto-submit a half-typed password.
    const target = event.target;
    if (!target || target.tagName !== "INPUT") return;
    if (
      target.type === "password" ||
      target.id === "usernamefield" ||
      /username|current-password/.test(target.autocomplete || "")
    ) {
      userTyped = true;
      stopWatching();
    }
  }

  function stopWatching() {
    window.clearInterval(watcherTimer);
    watcherTimer = null;
    watcherObserver?.disconnect();
    watcherObserver = null;
    if (watcherDomReadyHandler) {
      document.removeEventListener("DOMContentLoaded", watcherDomReadyHandler);
      watcherDomReadyHandler = null;
    }
    document.removeEventListener("keydown", watchManualTyping, true);
  }

  function startWatching() {
    stopWatching();
    if (!autoLoginEnabled || userTyped || submitted) return;
    document.addEventListener("keydown", watchManualTyping, true);

    let attempts = 0;
    const maxAttempts = 40;
    const interval = 250;
    watcherTimer = window.setInterval(() => {
      attempts += 1;
      if (submitted || userTyped || attempts >= maxAttempts) {
        stopWatching();
        return;
      }
      tryAdvance();
      if (submitted || userTyped) stopWatching();
    }, interval);

    watcherObserver = new MutationObserver(() => {
      if (submitted || userTyped || attempts >= maxAttempts) {
        stopWatching();
        return;
      }
      tryAdvance();
      if (submitted || userTyped) stopWatching();
    });

    if (document.body) {
      watcherObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      watcherDomReadyHandler = () => {
        watcherDomReadyHandler = null;
        if (watcherObserver && document.body) {
          watcherObserver.observe(document.body, { childList: true, subtree: true });
        }
      };
      document.addEventListener("DOMContentLoaded", watcherDomReadyHandler, { once: true });
    }
  }

  function init() {
    chrome.storage.local.get([AUTOLOGIN_KEY, AUTOLOGIN_PREFERRED_ACCOUNT_KEY], (result) => {
      autoLoginEnabled = result[AUTOLOGIN_KEY] === true;
      preferredAccount = String(result[AUTOLOGIN_PREFERRED_ACCOUNT_KEY] || "").trim();
      if (!autoLoginEnabled) return;
      startWatching();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[AUTOLOGIN_PREFERRED_ACCOUNT_KEY]) {
      preferredAccount = String(changes[AUTOLOGIN_PREFERRED_ACCOUNT_KEY].newValue || "").trim();
    }
    if (!changes[AUTOLOGIN_KEY]) return;
    autoLoginEnabled = changes[AUTOLOGIN_KEY].newValue === true;
    if (!autoLoginEnabled) {
      stopWatching();
      return;
    }
    startWatching();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
