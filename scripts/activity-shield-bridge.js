/**
 * activity-shield-bridge.js
 *
 * Isolated-world storage bridge for the experimental Activity Shield feature.
 */

(function () {
  "use strict";

  const CHANNEL_REQUEST = "ee-activity-shield-request";
  const CHANNEL_READY = "ee-activity-shield-ready";
  const CHANNEL_CONNECT = "ee-activity-shield-connect";
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
    "eeActivityShieldBlockEsc",
    "eeActivityShieldJquerySweep",
    "eeActivityShieldFullscreenSpoof",
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
    eeActivityShieldBlockEsc: true,
    eeActivityShieldJquerySweep: true,
    eeActivityShieldFullscreenSpoof: true,
    eeActivityShieldVisualIndicator: false,
    eeActivityShieldLog: false,
  };

  const flags = {
    enabled: "eeActivityShieldEnabled",
    log: "eeActivityShieldLog",
    visibilityState: "eeActivityShieldVisibilityState",
    hidden: "eeActivityShieldHidden",
    visibilityEvents: "eeActivityShieldVisibilityEvents",
    focus: "eeActivityShieldFocus",
    blur: "eeActivityShieldBlur",
    redirect: "eeActivityShieldRedirect",
    mouseleave: "eeActivityShieldMouseleave",
    mouseout: "eeActivityShieldMouseout",
    pointercapture: "eeActivityShieldPointercapture",
    clipboard: "eeActivityShieldClipboard",
    animationFrame: "eeActivityShieldAnimationFrame",
    blockEsc: "eeActivityShieldBlockEsc",
    jquerySweep: "eeActivityShieldJquerySweep",
    fullscreenSpoof: "eeActivityShieldFullscreenSpoof",
  };
  let channel = null;
  let connected = false;
  let latestPrefs = defaults;
  let revision = 0;
  let refreshGeneration = 0;

  function sendPrefs() {
    if (!connected) return;
    const preferences = {};
    for (const [name, key] of Object.entries(flags)) preferences[name] = latestPrefs[key] === true;
    channel.postMessage({ type: "preferences", revision, preferences });
  }

  function connect(event) {
    if (event.source !== window || event.data?.type !== CHANNEL_READY || channel) return;
    const messageChannel = new MessageChannel();
    channel = messageChannel.port1;
    channel.onmessage = ({ data }) => {
      if (data?.type !== "connected" || connected) return;
      connected = true;
      window.removeEventListener("message", connect, true);
      sendPrefs();
    };
    window.postMessage({ type: CHANNEL_CONNECT }, "*", [messageChannel.port2]);
  }

  window.addEventListener("message", connect, true);
  window.postMessage({ type: CHANNEL_REQUEST }, "*");

  function t(key) {
    try {
      return EE.getMessage(key) || key;
    } catch (_) {
      return key;
    }
  }

  function ensureIndicator() {
    let indicator = document.getElementById(INDICATOR_ID);
    if (indicator) return indicator;

    indicator = document.createElement("button");
    indicator.id = INDICATOR_ID;
    indicator.type = "button";
    indicator.title = t("activityShieldIndicatorName");
    indicator.setAttribute("aria-label", t("activityShieldIndicatorName"));
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
      window.open(chrome.runtime.getURL("menu/settings.html"), "_blank", "noopener");
    });
    document.body.append(indicator);
    return indicator;
  }

  function updateIndicator(enabled, visible) {
    if (window.top !== window) return;
    if (!visible) {
      document.getElementById(INDICATOR_ID)?.remove();
      return;
    }
    if (!document.body) return;
    const indicator = ensureIndicator();
    indicator.style.background = enabled ? "#89b4fa" : "#f38ba8";
    const label = t(enabled ? "activityShieldIndicatorActive" : "activityShieldIndicatorPaused");
    indicator.title = label;
    indicator.setAttribute("aria-label", label);
  }

  function applyPrefs(prefs) {
    const enabled = prefs.eeActivityShieldEnabled === true;
    latestPrefs = prefs;
    revision += 1;
    sendPrefs();
    updateIndicator(enabled, prefs.eeActivityShieldVisualIndicator === true);
  }

  function refresh() {
    const generation = ++refreshGeneration;
    try {
      chrome.storage.local.get(defaults, (prefs) => {
        if (generation !== refreshGeneration || chrome.runtime.lastError) return;
        applyPrefs(prefs);
      });
    } catch (_) {
      // An extension reload can invalidate this frame's storage context.
    }
  }

  refresh();
  EE.i18n?.subscribe(refresh);
  document.addEventListener("DOMContentLoaded", () => {
    updateIndicator(latestPrefs.eeActivityShieldEnabled === true, latestPrefs.eeActivityShieldVisualIndicator === true);
  }, { once: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!KEYS.some((key) => changes[key])) return;
    refresh();
  });
})();
