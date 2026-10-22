// Only the preference crosses into the page world; localized UI stays isolated.
(() => {
  "use strict";
  if (window.top !== window) return;
  const KEY = "eeEtestResultsEnabled";
  const PORT = "ee-etest-results-port";
  const BANNER = "ee-etest-results-info";
  let enabled = false;

  function updateBanner() {
    let banner = document.getElementById(BANNER);
    const panel = enabled && /^\/elearning(?:\/|$)/.test(window.location.pathname)
      ? document.querySelector(".etest-results-students-main") : null;
    const question = panel?.querySelector(".etest-question");
    if (!question || !document.body) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER;
      banner.setAttribute("role", "note");
      banner.style.cssText = "--ee-results-info-accent:#3b82f6;margin:0 0 20px;padding:14px 18px;border:1px solid color-mix(in srgb,var(--ee-results-info-accent) 30%,var(--ee-card-bg,#fff));border-left:4px solid var(--ee-results-info-accent);border-radius:10px;background:linear-gradient(110deg,color-mix(in srgb,var(--ee-results-info-accent) 13%,var(--ee-card-bg,#fff)),color-mix(in srgb,var(--ee-results-info-accent) 5%,var(--ee-card-bg,#fff)));color:var(--ee-text,#1e3a5f);font-size:14px;font-weight:500;line-height:1.6;";
    }
    banner.textContent = EE.getMessage("etestResultsInfo");
    if (banner.nextElementSibling !== question) question.before(banner);
  }

  function publish() {
    if (!document.body) return;
    let port = document.getElementById(PORT);
    if (!port) {
      port = document.createElement("span");
      port.id = PORT;
      port.hidden = true;
      document.body.append(port);
    }
    port.dataset.enabled = String(enabled);
    document.dispatchEvent(new Event("ee-etest-results-state"));
    updateBanner();
  }

  document.addEventListener("DOMContentLoaded", publish, { once: true });
  EE.i18n?.subscribe(updateBanner);
  document.addEventListener("ee-etest-results-ready", publish);
  document.addEventListener("ee-etest-results-render", updateBanner);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[KEY]) return;
    enabled = changes[KEY].newValue === true;
    publish();
  });
  chrome.storage.local.get({ [KEY]: false }, (prefs) => {
    // Storage may be unavailable after an extension reload.
    if (chrome.runtime.lastError) return;
    enabled = prefs[KEY] === true;
    publish();
  });
})();
