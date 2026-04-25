/**
 * activity-shield-bridge.js
 *
 * Isolated-world storage bridge for the experimental Activity Shield feature.
 */

(function () {
  "use strict";

  const PORT_ID = "ee-activity-shield-port";
  const INDICATOR_ID = "ee-activity-shield-indicator";
  const KEYS = [
    "eeActivityShieldEnabled",
    "eeActivityShieldVisibilityState",
    "eeActivityShieldHidden",
    "eeActivityShieldVisibilityEvents",
    "eeActivityShieldFocus",
    "eeActivityShieldBlur",
    "eeActivityShieldRedirect",
    "eeActivityShieldMouseleave",
    "eeActivityShieldMouseout",
    "eeActivityShieldPointercapture",
    "eeActivityShieldClipboard",
    "eeActivityShieldAnimationFrame",
    "eeActivityShieldVisualIndicator",
    "eeActivityShieldLog",
  ];

  const defaults = {
    eeActivityShieldEnabled: false,
    eeActivityShieldVisibilityState: true,
    eeActivityShieldHidden: true,
    eeActivityShieldVisibilityEvents: true,
    eeActivityShieldFocus: true,
    eeActivityShieldBlur: true,
    eeActivityShieldRedirect: true,
    eeActivityShieldMouseleave: true,
    eeActivityShieldMouseout: true,
    eeActivityShieldPointercapture: true,
    eeActivityShieldClipboard: true,
    eeActivityShieldAnimationFrame: true,
    eeActivityShieldVisualIndicator: false,
    eeActivityShieldLog: false,
  };

  let port = document.getElementById(PORT_ID);
  if (!port) {
    port = document.createElement("span");
    port.id = PORT_ID;
    port.hidden = true;
    (document.documentElement || document.head || document.body)?.append(port);
  }

  port.dataset.nativeHidden = String(document.hidden);
  port.addEventListener("ee-activity-state", () => {
    port.dataset.nativeHidden = String(document.hidden);
  });

  function setFlag(name, value) {
    port.dataset[name] = String(value === true);
  }

  function ensureIndicator() {
    let indicator = document.getElementById(INDICATOR_ID);
    if (indicator) return indicator;

    indicator = document.createElement("button");
    indicator.id = INDICATOR_ID;
    indicator.type = "button";
    indicator.title = "Edupage Extras Activity Shield";
    indicator.setAttribute("aria-label", "Edupage Extras Activity Shield");
    indicator.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "width:12px",
      "height:12px",
      "border:0",
      "border-radius:50%",
      "padding:0",
      "z-index:2147483647",
      "cursor:pointer",
      "box-shadow:0 0 0 2px rgba(0,0,0,.25),0 0 8px rgba(137,180,250,.7)",
      "background:#89b4fa",
    ].join(";");

    indicator.addEventListener("click", () => {
      window.open(chrome.runtime.getURL("menu/experimental.html"), "_blank", "noopener");
    });
    document.documentElement.append(indicator);
    return indicator;
  }

  function updateIndicator(enabled, visible) {
    const indicator = ensureIndicator();
    indicator.style.display = visible ? "block" : "none";
    indicator.style.background = enabled ? "#89b4fa" : "#f38ba8";
    indicator.title = enabled ? "Activity Shield active" : "Activity Shield paused";
  }

  function applyPrefs(prefs) {
    const enabled = prefs.eeActivityShieldEnabled === true;

    port.dataset.enabled = String(enabled);
    port.dataset.log = String(prefs.eeActivityShieldLog === true);

    setFlag("visibilityState", prefs.eeActivityShieldVisibilityState);
    setFlag("hidden", prefs.eeActivityShieldHidden);
    setFlag("visibilityEvents", prefs.eeActivityShieldVisibilityEvents);
    setFlag("focus", prefs.eeActivityShieldFocus);
    setFlag("blur", prefs.eeActivityShieldBlur);
    setFlag("redirect", prefs.eeActivityShieldRedirect);
    setFlag("mouseleave", prefs.eeActivityShieldMouseleave);
    setFlag("mouseout", prefs.eeActivityShieldMouseout);
    setFlag("pointercapture", prefs.eeActivityShieldPointercapture);
    setFlag("clipboard", prefs.eeActivityShieldClipboard);
    setFlag("animationFrame", prefs.eeActivityShieldAnimationFrame);

    updateIndicator(enabled, prefs.eeActivityShieldVisualIndicator === true);
  }

  function refresh() {
    chrome.storage.local.get(defaults, applyPrefs);
  }

  refresh();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!KEYS.some((key) => changes[key])) return;
    refresh();
  });
})();
