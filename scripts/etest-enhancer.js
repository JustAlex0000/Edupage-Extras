(function () {
  "use strict";

  if (window.top !== window) return;
  if (!/^\/elearning\//i.test(window.location.pathname)) return;

  const ETEST_COPY_KEY = "eeEtestCopyEnabled";
  const COPY_BTN_CLASS = "etest-question-copybtn";
  const COPY_ALL_BTN_CLASS = "ee-etest-copyall-btn";
  let etestCopyEnabled = true;
  let observerTimer = null;

  function getMessage(key, fallback) {
    try {
      return chrome.i18n.getMessage(key) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function extractTextFromContent(content) {
    if (!content) return "";
    const clone = content.cloneNode(true);
    const title = clone.querySelector(".etest-question-title");
    if (title) title.remove();
    clone.querySelectorAll("input, textarea, select").forEach((el) => el.remove());
    clone.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:-9999px;";
    document.body.appendChild(clone);
    const text = (clone.innerText || clone.textContent || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    clone.remove();
    return text;
  }

  function extractQuestionText(playactionsEl) {
    return extractTextFromContent(playactionsEl.closest(".etest-question-content"));
  }

  function collectAllQuestionsText() {
    const contents = document.querySelectorAll(".etest-question-content");
    const parts = [];
    contents.forEach((content, index) => {
      const text = extractTextFromContent(content);
      if (text) parts.push(`${index + 1}. ${text}`);
    });
    return parts.join("\n\n");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      ta.remove();
    }
    return Promise.resolve();
  }

  function flashFeedback(btn, iconEl, ok) {
    const originalClass = iconEl.className;
    iconEl.className = ok ? "fa fa-fw fa-check" : "fa fa-fw fa-times";
    btn.classList.add(ok ? "ee-copy-ok" : "ee-copy-fail");
    setTimeout(() => {
      iconEl.className = originalClass;
      btn.classList.remove("ee-copy-ok", "ee-copy-fail");
    }, 1200);
  }

  function makeCopyButton(playactionsEl) {
    const btn = document.createElement("a");
    btn.className = COPY_BTN_CLASS;
    const label = getMessage("etestCopyQuestion", "Copy question");
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.tabIndex = 0;
    btn.setAttribute("role", "button");
    const icon = document.createElement("i");
    icon.className = "fa fa-fw fa-copy";
    icon.setAttribute("aria-hidden", "true");
    btn.appendChild(icon);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const text = extractQuestionText(playactionsEl);
      if (!text) return;
      copyText(text)
        .then(() => flashFeedback(btn, icon, true))
        .catch(() => flashFeedback(btn, icon, false));
    });
    return btn;
  }

  function makeCopyAllButton() {
    const btn = document.createElement("a");
    btn.className = "etest-screen-action-btn flat-button flat-button-blue " + COPY_ALL_BTN_CLASS;
    btn.setAttribute("role", "button");
    btn.tabIndex = 0;
    const label = getMessage("etestCopyAllQuestions", "Copy whole test");
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label + " ";
    const icon = document.createElement("i");
    icon.className = "fa fa-fw fa-copy";
    icon.setAttribute("aria-hidden", "true");
    btn.appendChild(labelSpan);
    btn.appendChild(icon);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const text = collectAllQuestionsText();
      if (!text) return;
      copyText(text)
        .then(() => flashFeedback(btn, icon, true))
        .catch(() => flashFeedback(btn, icon, false));
    });
    return btn;
  }

  function removeButtons() {
    document.querySelectorAll("." + COPY_BTN_CLASS).forEach((el) => el.remove());
    document.querySelectorAll("." + COPY_ALL_BTN_CLASS).forEach((el) => el.remove());
  }

  function ensureButtons() {
    if (!etestCopyEnabled) {
      removeButtons();
      return;
    }
    document.querySelectorAll(".etest-question-playactions").forEach((playactions) => {
      if (playactions.querySelector("." + COPY_BTN_CLASS)) return;
      playactions.insertBefore(makeCopyButton(playactions), playactions.firstChild);
    });

    const actions = document.querySelector(".etest-screen-actions");
    if (actions && !actions.querySelector("." + COPY_ALL_BTN_CLASS) && document.querySelector(".etest-question-content")) {
      actions.appendChild(makeCopyAllButton());
    }
  }

  function scheduleEnsure() {
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      ensureButtons();
    }, 150);
  }

  function initObserver() {
    const observer = new MutationObserver(scheduleEnsure);
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function initStorage() {
    chrome.storage.local.get([ETEST_COPY_KEY], (result) => {
      etestCopyEnabled = result[ETEST_COPY_KEY] !== false;
      ensureButtons();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes[ETEST_COPY_KEY]) return;
      etestCopyEnabled = changes[ETEST_COPY_KEY].newValue !== false;
      ensureButtons();
    });
  }

  function init() {
    initStorage();
    initObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
