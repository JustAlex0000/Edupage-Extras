/**
 * content.js - Edupage Extras: Dark Mode
 *
 * Edupage uses many independent modules with hardcoded colors and inline
 * styles. Static selectors cover known pages, while the normalizer below tags
 * newly rendered light surfaces and dark text so dark mode stays consistent.
 */

const DEFAULT_ROZVRH_ROOM_CHANGE_COLOR = "#1565c0";
const DEFAULT_ROZVRH_SUBSTITUTION_COLOR = "#e65100";
const LAST_SEEN_VERSION_KEY = "eeLastSeenVersion";
const UPDATE_REMINDER_ENABLED_KEY = "eeUpdateReminderEnabled";
const REPO_RELEASES_URL = "https://github.com/JustAlex0000/Edupage-Extras/releases";
const CHROME_STORE_REVIEW_URL = "https://chromewebstore.google.com/detail/edupage-extras/ljakjcljhfkjgndmopmpaakklgnkccca/reviews";
const FIREFOX_ADDONS_REVIEW_URL = "https://addons.mozilla.org/en-US/firefox/addon/edupage-extras/reviews/";
const UPDATE_TOAST_DURATION_MS = 20_000;
const UPDATE_TOAST_EXIT_DURATION_MS = 220;
const THEME_CACHE_KEY = "eeThemeCacheV1";
const ETEST_AUTO_THEME_OFF_KEY = "eeEtestAutoThemeOffEnabled";
const ACTIVITY_SHIELD_ENABLED_KEY = "eeActivityShieldEnabled";
// Any of these present means the eTest player overlay is open — header/content
// cover the normal in-progress view, sideoverlay covers the results/review
// screen reached after submitting, so all three need to be watched.
const ETEST_PLAYER_ACTIVE_SELECTOR = ".etest-player-header, .etest-player-content, .etest-player-sideoverlay";

// chrome.storage.local.get() is always async, so on every full-page nav the
// page would otherwise paint once with the light-mode default before the
// real settings resolve and we re-apply dark mode — a visible white flash.
// localStorage is synchronous and shared with the page, so we stash the
// last-applied settings there and use them for the very first paint, then
// reconcile with the real chrome.storage values right after.
function readThemeCache() {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeThemeCache(settings) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(settings));
  } catch (e) {
    // localStorage unavailable (private mode, quota, etc.) — cache is a
    // FOUC-prevention nicety, not required for correctness, so just skip.
  }
}

// Heavier pages (e.g. grades — 7+ blocking stylesheets + several scripts)
// take noticeably longer to finish loading all render-blocking CSS than
// the dashboard, and the browser paints nothing at all until every one of
// them is ready — that blank wait is what shows as a "white flash", not
// our stylesheet losing a cascade fight (it hasn't even had a chance to
// paint yet). A plain inline background-color on <html>, set synchronously
// here, paints immediately regardless of pending stylesheet loads, so the
// blank wait itself reads as dark instead of white. The complete static
// stylesheet is already registered at document_start; this script only
// reconciles cached state with authoritative extension storage.
//
// "pink" is a light pastel theme (see isLightTonedTheme() below), and a
// custom theme can pick a light bgBase too — forcing the dark navy for
// those would itself be the wrong-color flash this code exists to avoid,
// so skip the early paint and let the real light background load in.
const LIGHT_TONED_THEMES = ["pink"];
const CLASS_NAME = "ee-dark";
const THEME_CLASSES = [
  "ee-theme-dark",
  "ee-theme-ocean",
  "ee-theme-forest",
  "ee-theme-emerald",
  "ee-theme-pink",
  "ee-theme-purple",
  "ee-theme-custom",
  "ee-theme-light",
];
const CLEAN_UI_CLASS = "ee-clean-ui";
const HIDE_HELP_TEXT_CLASS = "ee-hide-help-text";
const HIDE_PAGE_HEROES_CLASS = "ee-hide-page-heroes";
const HIDE_PERSONAL_INFO_CLASS = "ee-hide-personal-info";
// "pink" is a light pastel theme, not a dark one — it still goes through the
// ee-dark code path (recolors EduPage's containers via the --ee-* vars), but
// dark-mode-specific sensory adjustments (forced color-scheme: dark, image
// dimming, icon inversion) would look broken on its light background, so
// those are gated behind SCHEME_DARK_CLASS instead of CLASS_NAME.
// (LIGHT_TONED_THEMES itself is declared above paintEarlyBackground(), which
// needs it before this point in the file.)
const SCHEME_DARK_CLASS = "ee-scheme-dark";
const SURFACE_CLASS = "ee-dark-surface";
const ELEVATED_CLASS = "ee-dark-elevated";
const MUTED_SURFACE_CLASS = "ee-dark-muted-surface";
const TEXT_CLASS = "ee-dark-text";
const MUTED_TEXT_CLASS = "ee-dark-muted-text";
const BORDER_CLASS = "ee-dark-border";
const NORMALIZED_ATTR = "data-ee-dark-normalized";

let observer = null;
let normalizeTimer = null;
let pendingNormalizeRoots = new Set();
let hasBootstrappedDarkMode = false;
let currentTheme = "dark";
let currentCustomTheme = null;
let cleanUiEnabled = false;
let hideHelpTextEnabled = false;
let hidePageHeroesEnabled = false;
let hidePersonalInfoEnabled = false;
let currentRozvrhRoomChangeColor = DEFAULT_ROZVRH_ROOM_CHANGE_COLOR;
let currentRozvrhSubstitutionColor = DEFAULT_ROZVRH_SUBSTITUTION_COLOR;
let etestAutoThemeOffEnabled = false;
let etestPlayerActive = false;
let etestObserver = null;
let etestCheckTimer = null;
let lastThemeSettings = null;
const DEFAULT_CUSTOM_THEME = EE.DEFAULT_CUSTOM_THEME;

// Stable theme rules load from scripts/theme-static.css at document_start.
// This script only supplies stateful custom properties and dynamic normalization.

function parseRgb(value) {
  if (!value || value === "transparent") return null;

  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;

  const r = Number.parseFloat(parts[0]);
  const g = Number.parseFloat(parts[1]);
  const b = Number.parseFloat(parts[2]);
  const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;

  if ([r, g, b, a].some((part) => Number.isNaN(part))) return null;
  return { r, g, b, a };
}

function luminance(color) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!match) return null;
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

// Pink is statically known to be light. Custom is user-defined, so its
// "light or dark" tone is derived from the actual background color picked
// instead of guessed.
function isLightTonedTheme(theme, customTheme) {
  if (LIGHT_TONED_THEMES.includes(theme)) return true;
  if (theme !== "custom") return false;
  const rgb = hexToRgb(customTheme?.bgBase);
  return rgb ? luminance(rgb) > 0.5 : false;
}

function shouldSkipElement(element) {
  if (!(element instanceof Element)) return true;
  if (["SCRIPT", "STYLE", "LINK", "META", "TITLE", "SVG", "PATH"].includes(element.tagName)) {
    return true;
  }
  return false;
}

function resetElementClasses(element) {
  element.classList.remove(
    SURFACE_CLASS,
    ELEVATED_CLASS,
    MUTED_SURFACE_CLASS,
    TEXT_CLASS,
    MUTED_TEXT_CLASS,
    BORDER_CLASS,
  );
  element.removeAttribute(NORMALIZED_ATTR);
}

function hasVisibleBorder(styles) {
  const sides = ["Top", "Right", "Bottom", "Left"];
  const hasBorderSide = sides.some((side) => {
    const width = Number.parseFloat(styles[`border${side}Width`]);
    const style = styles[`border${side}Style`];
    return width > 0 && style !== "none" && style !== "hidden";
  });
  const outlineWidth = Number.parseFloat(styles.outlineWidth);
  const hasOutline = outlineWidth > 0
    && styles.outlineStyle !== "none"
    && styles.outlineStyle !== "hidden";
  return hasBorderSide || hasOutline;
}

function isHeadingElement(element) {
  return /^H[1-6]$/.test(element.tagName);
}

function normalizeElement(element) {
  if (shouldSkipElement(element)) return;

  resetElementClasses(element);

  const styles = window.getComputedStyle(element);
  const background = parseRgb(styles.backgroundColor);
  const color = parseRgb(styles.color);
  const borderColors = [
    parseRgb(styles.borderTopColor),
    parseRgb(styles.borderRightColor),
    parseRgb(styles.borderBottomColor),
    parseRgb(styles.borderLeftColor),
    parseRgb(styles.outlineColor),
  ].filter(Boolean);

  let touched = false;

  if (background && background.a > 0.1) {
    const bgLum = luminance(background);
    if (bgLum > 0.86) {
      element.classList.add(SURFACE_CLASS);
      touched = true;
    } else if (bgLum > 0.72) {
      element.classList.add(ELEVATED_CLASS);
      touched = true;
    } else if (bgLum > 0.52) {
      element.classList.add(MUTED_SURFACE_CLASS);
      touched = true;
    }
  }

  if (color && color.a > 0.35) {
    const textLum = luminance(color);
    if (textLum < 0.2) {
      element.classList.add(TEXT_CLASS);
      touched = true;
    } else if (textLum < 0.42) {
      element.classList.add(MUTED_TEXT_CLASS);
      touched = true;
    }
  }

  if (!isHeadingElement(element) && hasVisibleBorder(styles) && borderColors.some((borderColor) => borderColor.a > 0.15 && luminance(borderColor) > 0.68)) {
    element.classList.add(BORDER_CLASS);
    touched = true;
  }

  if (touched) {
    element.setAttribute(NORMALIZED_ATTR, "1");
  }
}

function normalizeSubtree(root = document.documentElement) {
  if (!document.documentElement.classList.contains(CLASS_NAME)) return;
  if (!root) return;

  if (root.nodeType === Node.ELEMENT_NODE) {
    normalizeElement(root);
    root.querySelectorAll("*").forEach(normalizeElement);
  }
}

function flushNormalize() {
  normalizeTimer = null;
  const roots = Array.from(pendingNormalizeRoots);
  pendingNormalizeRoots.clear();

  if (!document.documentElement.classList.contains(CLASS_NAME)) return;

  // If a full-document pass is queued, do it once and skip the per-node work.
  if (roots.includes(document.documentElement)) {
    normalizeSubtree(document.documentElement);
    return;
  }

  roots.forEach((root) => {
    if (root && root.isConnected) {
      normalizeSubtree(root);
    }
  });
}

function scheduleNormalize(root = document.documentElement) {
  // Leading-edge: the first node in a burst gets normalized immediately so
  // freshly AJAX-injected content (e.g. switching sidebar tabs) doesn't sit
  // unstyled/white for the debounce window — only the rest of the burst is
  // still debounced, so large re-renders don't trigger a sweep per node.
  const isLeading = normalizeTimer === null && root && root.isConnected;
  if (isLeading) {
    normalizeSubtree(root);
  } else if (root) {
    pendingNormalizeRoots.add(root);
  }
  window.clearTimeout(normalizeTimer);
  normalizeTimer = window.setTimeout(flushNormalize, 80);
}

function startObserver() {
  if (observer || !document.documentElement) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only re-scan the inserted subtrees, not the whole document, so large
      // EduPage re-renders do not trigger a full-page getComputedStyle sweep.
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scheduleNormalize(node);
          }
        });
        continue;
      }

      if (
        mutation.type === "attributes" &&
        mutation.target instanceof Element &&
        !mutation.attributeName.startsWith("data-ee-") &&
        mutation.attributeName !== "class"
      ) {
        scheduleNormalize(mutation.target);
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
    childList: true,
    subtree: true,
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  window.clearTimeout(normalizeTimer);
  normalizeTimer = null;
  pendingNormalizeRoots.clear();
}

function clearNormalizedClasses() {
  document.querySelectorAll(`[${NORMALIZED_ATTR}]`).forEach(resetElementClasses);
}

function normalizeTheme(theme) {
  return EE.normalizeTheme(theme);
}

function shouldSuppressThemeForPath(pathname = window.location.pathname) {
  return /^\/login(?:\/|$)/i.test(String(pathname || ""));
}

function resolveAppliedTheme({
  darkModeEnabled = false,
  theme = currentTheme,
  pathname = window.location.pathname,
  etestAutoThemeOffEnabled: suppressForEtest = false,
  etestPlayerActive: playerActive = false,
} = {}) {
  if (!darkModeEnabled || shouldSuppressThemeForPath(pathname)) {
    return "light";
  }
  if (suppressForEtest && playerActive) {
    return "light";
  }
  return normalizeTheme(theme);
}

function isEtestAutoThemeOffActive(result = {}) {
  return result[ETEST_AUTO_THEME_OFF_KEY] !== false
    && result[ACTIVITY_SHIELD_ENABLED_KEY] === true;
}

function normalizeColor(value, fallback) {
  return EE.normalizeColor(value, fallback);
}

function normalizeCustomTheme(theme) {
  return EE.normalizeCustomTheme(theme);
}

function applyCustomThemeProperties(theme) {
  const colors = normalizeCustomTheme(theme);
  const root = document.documentElement;
  root.style.setProperty("--ee-custom-bg-base", colors.bgBase);
  root.style.setProperty("--ee-custom-bg-raised", colors.bgRaised);
  root.style.setProperty("--ee-custom-bg-elevated", colors.bgElevated);
  root.style.setProperty("--ee-custom-bg-muted", colors.bgMuted);
  root.style.setProperty("--ee-custom-border", colors.border);
  root.style.setProperty("--ee-custom-text-main", colors.textMain);
  root.style.setProperty("--ee-custom-text-muted", colors.textMuted);
  root.style.setProperty("--ee-custom-accent", colors.accent);
  root.style.setProperty("--ee-custom-warning", colors.warning);
  root.style.setProperty("--ee-custom-danger", colors.danger);
  root.style.setProperty("--ee-custom-table-header-bg", colors.tableHeaderBg);
}

// Applied unconditionally (not gated behind html.ee-dark or any ee-theme-*
// class) so the homepage schedule highlight colors stay correct in every
// theme, including "light" — where ee-dark is never added at all.
function applyRozvrhColorProperties(roomChangeColor, substitutionColor) {
  const root = document.documentElement;
  root.style.setProperty("--ee-rozvrh-room-change-color", normalizeColor(roomChangeColor, DEFAULT_ROZVRH_ROOM_CHANGE_COLOR));
  root.style.setProperty("--ee-rozvrh-substitution-color", normalizeColor(substitutionColor, DEFAULT_ROZVRH_SUBSTITUTION_COLOR));
}

function setThemeClasses(theme, cleanEnabled, helpHidden, heroesHidden, personalInfoHidden, schemeIsLight) {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  root.classList.toggle(CLEAN_UI_CLASS, cleanEnabled);
  root.classList.toggle(HIDE_HELP_TEXT_CLASS, helpHidden);
  root.classList.toggle(HIDE_PAGE_HEROES_CLASS, heroesHidden);
  root.classList.toggle(HIDE_PERSONAL_INFO_CLASS, personalInfoHidden);
  root.classList.add(`ee-theme-${theme}`);
  root.classList.toggle(SCHEME_DARK_CLASS, theme !== "light" && !schemeIsLight);
  root.dataset.eeTheme = theme;
}

// Watches for the eTest player overlay opening/closing (see
// ETEST_PLAYER_ACTIVE_SELECTOR) so the theme can be force-suppressed while a
// test is in progress — a recolored page during a test can be mistaken for
// tampering (see the in-menu theme disclaimer), so this automates the
// "switch to default theme before testing" advice for users who opt in.
function checkEtestPlayerActive() {
  if (!etestAutoThemeOffEnabled || typeof document.querySelector !== "function") return;
  const active = Boolean(document.querySelector(ETEST_PLAYER_ACTIVE_SELECTOR));
  if (active === etestPlayerActive) return;
  etestPlayerActive = active;
  if (lastThemeSettings) applyTheme(lastThemeSettings);
}

function scheduleEtestCheck() {
  if (etestCheckTimer) return;
  etestCheckTimer = window.setTimeout(() => {
    etestCheckTimer = null;
    checkEtestPlayerActive();
  }, 150);
}

function stopEtestObserver() {
  if (etestObserver) {
    etestObserver.disconnect();
    etestObserver = null;
  }
  window.clearTimeout(etestCheckTimer);
  etestCheckTimer = null;
  etestPlayerActive = false;
}

function ensureEtestObserver() {
  if (!etestAutoThemeOffEnabled) {
    stopEtestObserver();
    return;
  }
  if (etestObserver || !document.documentElement) return;
  etestObserver = new MutationObserver(scheduleEtestCheck);
  etestObserver.observe(document.documentElement, { childList: true, subtree: true });
  checkEtestPlayerActive();
}

function applyTheme({
  darkModeEnabled = false,
  theme = currentTheme,
  customTheme = currentCustomTheme,
  cleanEnabled = cleanUiEnabled,
  helpHidden = hideHelpTextEnabled,
  heroesHidden = hidePageHeroesEnabled,
  personalInfoHidden = hidePersonalInfoEnabled,
  rozvrhRoomChangeColor = currentRozvrhRoomChangeColor,
  rozvrhSubstitutionColor = currentRozvrhSubstitutionColor,
  etestAutoThemeOff = etestAutoThemeOffEnabled,
} = {}) {
  lastThemeSettings = {
    darkModeEnabled, theme, customTheme, cleanEnabled, helpHidden, heroesHidden, personalInfoHidden,
    rozvrhRoomChangeColor, rozvrhSubstitutionColor, etestAutoThemeOff,
  };
  etestAutoThemeOffEnabled = etestAutoThemeOff;
  const normalizedTheme = normalizeTheme(theme);
  const selectedTheme = resolveAppliedTheme({
    darkModeEnabled,
    theme: normalizedTheme,
    pathname: window.location.pathname,
    etestAutoThemeOffEnabled: etestAutoThemeOff,
    etestPlayerActive,
  });
  currentTheme = normalizedTheme;
  currentCustomTheme = normalizeCustomTheme(customTheme);
  cleanUiEnabled = cleanEnabled;
  hideHelpTextEnabled = helpHidden;
  hidePageHeroesEnabled = heroesHidden;
  hidePersonalInfoEnabled = personalInfoHidden;
  currentRozvrhRoomChangeColor = normalizeColor(rozvrhRoomChangeColor, DEFAULT_ROZVRH_ROOM_CHANGE_COLOR);
  currentRozvrhSubstitutionColor = normalizeColor(rozvrhSubstitutionColor, DEFAULT_ROZVRH_SUBSTITUTION_COLOR);
  applyCustomThemeProperties(currentCustomTheme);
  applyRozvrhColorProperties(currentRozvrhRoomChangeColor, currentRozvrhSubstitutionColor);
  setThemeClasses(selectedTheme, cleanEnabled, helpHidden, heroesHidden, personalInfoHidden, isLightTonedTheme(selectedTheme, currentCustomTheme));

  if (selectedTheme !== "light") {
    document.documentElement.classList.add(CLASS_NAME);
    normalizeSubtree();
    startObserver();
  } else {
    stopObserver();
    document.documentElement.classList.remove(CLASS_NAME);
    clearNormalizedClasses();
  }
  ensureEtestObserver();
}

function initDarkMode() {
  if (!hasBootstrappedDarkMode) {
    hasBootstrappedDarkMode = true;
    const cached = readThemeCache();
    if (cached) {
      applyTheme(cached);
    } else {
      applyTheme({ darkModeEnabled: false, theme: "dark", cleanEnabled: false, helpHidden: false });
    }
  }

  chrome.storage.local.get(
    [...EE.THEME_STORAGE_KEY_LIST, ETEST_AUTO_THEME_OFF_KEY, ACTIVITY_SHIELD_ENABLED_KEY],
    (result) => {
      const themeSettings = EE.readThemeSettings(result);
      const settings = {
        darkModeEnabled: themeSettings.darkModeEnabled,
        theme: themeSettings.theme,
        customTheme: themeSettings.customTheme,
        cleanEnabled: themeSettings.cleanUiEnabled,
        helpHidden: themeSettings.hideHelpTextEnabled,
        heroesHidden: themeSettings.hidePageHeroesEnabled,
        personalInfoHidden: themeSettings.hidePersonalInfoEnabled,
        rozvrhRoomChangeColor: themeSettings.rozvrhRoomChangeColor,
        rozvrhSubstitutionColor: themeSettings.rozvrhSubstitutionColor,
        etestAutoThemeOff: isEtestAutoThemeOffActive(result),
      };
      applyTheme(settings);
      writeThemeCache(settings);
    },
  );
}

// Deliberate test hook: tests set globalThis.__EE_TEST__ before evaluating
// this file in a vm sandbox and read the internals from __eeTestExports —
// a missing name then fails loudly instead of a string-replace anchor
// silently no-opping after a refactor. Never set in the real extension.
if (globalThis.__EE_TEST__) {
  globalThis.__eeTestExports = {
    normalizeTheme,
    hasVisibleBorder,
    isHeadingElement,
    shouldSuppressThemeForPath,
    resolveAppliedTheme,
    isEtestAutoThemeOffActive,
    resolveReviewUrl,
    getUpdateToastExitDuration,
    UPDATE_TOAST_DURATION_MS,
  };
}

initDarkMode();

function resolveReviewUrl(userAgent) {
  return /\bFirefox\//.test(String(userAgent || ""))
    ? FIREFOX_ADDONS_REVIEW_URL
    : CHROME_STORE_REVIEW_URL;
}

function getUpdateToastExitDuration(reducedMotion) {
  return reducedMotion ? 0 : UPDATE_TOAST_EXIT_DURATION_MS;
}

// Shows a one-time toast the first time the page loads after an update —
// not on first install (lastSeen is unset then, so we just record the
// version silently). Respects the same "Update Reminders" toggle the
// GitHub-install update checker already uses, so muting one mutes both.
function showUpdateToast(version) {
  if (document.getElementById("ee-update-toast")) return;

  const toast = document.createElement("div");
  toast.id = "ee-update-toast";
  toast.setAttribute("role", "dialog");
  toast.setAttribute("aria-labelledby", "ee-update-toast-title");
  toast.setAttribute("aria-describedby", "ee-update-toast-body");
  toast.style.cssText = [
    "position: fixed", "bottom: 20px", "right: 20px", "z-index: 2147483000",
    "width: min(420px, calc(100vw - 40px))", "box-sizing: border-box",
    "padding: 22px 22px 32px", "border-radius: 12px",
    "background: #171d28", "color: #eef2f7",
    "font: 14px/1.45 -apple-system, 'Segoe UI', Roboto, sans-serif",
    "box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35)",
    "border: 1px solid rgba(255, 255, 255, 0.12)", "overflow: hidden",
    "transition: transform 220ms ease, opacity 220ms ease",
  ].join(";");

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  let autoDismissTimer = null;
  const dismissToast = () => {
    if (toast.dataset.eeClosing === "true") return;
    toast.dataset.eeClosing = "true";
    if (autoDismissTimer !== null) clearTimeout(autoDismissTimer);

    const exitDuration = getUpdateToastExitDuration(reducedMotion);
    if (exitDuration === 0) {
      toast.remove();
      return;
    }
    toast.style.opacity = "0";
    toast.style.transform = "translateX(calc(100% + 32px))";
    setTimeout(() => toast.remove(), exitDuration);
  };

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", chrome.i18n.getMessage("updateToastClose") || "Close update notice");
  closeButton.style.cssText = [
    "position: absolute", "top: 18px", "right: 18px", "width: 34px", "height: 34px",
    "display: inline-flex", "align-items: center", "justify-content: center",
    "padding: 0", "border: 1px solid #7f2c36", "border-radius: 50%", "background: #3a1f25",
    "color: #ff9da5", "cursor: pointer",
  ].join(";");
  const closeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  closeIcon.setAttribute("viewBox", "0 0 24 24");
  closeIcon.setAttribute("width", "18");
  closeIcon.setAttribute("height", "18");
  closeIcon.setAttribute("aria-hidden", "true");
  const closePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  closePath.setAttribute("d", "m7 7 10 10M17 7 7 17");
  closePath.setAttribute("fill", "none");
  closePath.setAttribute("stroke", "currentColor");
  closePath.setAttribute("stroke-width", "2.5");
  closePath.setAttribute("stroke-linecap", "round");
  closeIcon.appendChild(closePath);
  closeButton.appendChild(closeIcon);
  closeButton.addEventListener("click", dismissToast);

  const title = document.createElement("strong");
  title.id = "ee-update-toast-title";
  title.style.cssText = "display: block; margin: 0 42px 8px 0; font-size: 16px;";
  title.textContent = (chrome.i18n.getMessage("updateToastTitle") || "Edupage Extras updated to v{version}")
    .replace("{version}", version);

  const body = document.createElement("p");
  body.id = "ee-update-toast-body";
  body.style.cssText = "margin: 0 0 18px 0; color: #b9c2cf;";
  body.textContent = chrome.i18n.getMessage("updateToastBody") || "See what changed in this version.";

  const actions = document.createElement("div");
  actions.style.cssText = "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;";
  const actionButtonStyle = [
    "display: inline-flex", "min-height: 42px", "width: 100%", "box-sizing: border-box",
    "align-items: center", "justify-content: center", "padding: 0 12px",
    "border: 1px solid rgba(255, 255, 255, 0.16)", "border-radius: 7px",
    "background: #232d3d", "color: #eef2f7", "cursor: pointer",
    "font: 600 13px/1 -apple-system, 'Segoe UI', Roboto, sans-serif",
    "text-decoration: none",
  ].join(";");

  const viewLink = document.createElement("a");
  viewLink.href = REPO_RELEASES_URL;
  viewLink.target = "_blank";
  viewLink.rel = "noopener noreferrer";
  viewLink.textContent = chrome.i18n.getMessage("updateToastViewChanges") || "What's new";
  viewLink.style.cssText = actionButtonStyle;

  const rateLink = document.createElement("a");
  rateLink.href = resolveReviewUrl(navigator.userAgent);
  rateLink.target = "_blank";
  rateLink.rel = "noopener noreferrer";
  rateLink.textContent = chrome.i18n.getMessage("updateToastRateUs") || "Rate us";
  rateLink.style.cssText = actionButtonStyle;

  const progressTrack = document.createElement("div");
  progressTrack.setAttribute("aria-hidden", "true");
  progressTrack.style.cssText = [
    "position: absolute", "bottom: 12px", "left: 22px", "right: 22px", "height: 4px",
    "border-radius: 999px", "background: rgba(255, 255, 255, 0.16)", "overflow: hidden",
  ].join(";");

  const progress = document.createElement("div");
  progress.style.cssText = [
    "width: 100%", "height: 100%", "border-radius: 999px", "background: #4fc3f7", "transform: scaleX(1)",
    "transform-origin: left center", "transition: transform 20s linear",
  ].join(";");
  progressTrack.appendChild(progress);

  actions.append(viewLink, rateLink);
  toast.append(closeButton, title, body, actions, progressTrack);

  const startAutoDismiss = () => {
    if (reducedMotion) {
      progressTrack.style.display = "none";
      autoDismissTimer = setTimeout(dismissToast, UPDATE_TOAST_DURATION_MS);
      return;
    }

    requestAnimationFrame(() => {
      if (toast.dataset.eeClosing !== "true") progress.style.transform = "scaleX(0)";
    });
    autoDismissTimer = setTimeout(dismissToast, UPDATE_TOAST_DURATION_MS);
  };

  // Runs from a storage callback, which can resolve before <body> exists on
  // slow-loading pages (this script runs at document_start) — wait for it
  // instead of throwing.
  if (document.body) {
    document.body.appendChild(toast);
    startAutoDismiss();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(toast);
      startAutoDismiss();
    }, { once: true });
  }
}

function checkForUpdateToast() {
  const currentVersion = chrome.runtime.getManifest().version;
  chrome.storage.local.get([LAST_SEEN_VERSION_KEY, UPDATE_REMINDER_ENABLED_KEY], (result) => {
    const lastSeenVersion = result[LAST_SEEN_VERSION_KEY];
    const reminderEnabled = result[UPDATE_REMINDER_ENABLED_KEY] !== false;
    if (lastSeenVersion && lastSeenVersion !== currentVersion && reminderEnabled) {
      showUpdateToast(currentVersion);
    }
    if (lastSeenVersion !== currentVersion) {
      chrome.storage.local.set({ [LAST_SEEN_VERSION_KEY]: currentVersion });
    }
  });
}

// content.js runs in every frame (theming applies everywhere), but the
// update toast/lastSeenVersion bookkeeping must run once per page load —
// otherwise iframe-embedded EduPage views race on eeLastSeenVersion (every
// frame reads the old value, any of them can write the new one first) and
// can either duplicate/clip the toast inside a small iframe or, worse,
// suppress it entirely on the real page (see #46).
if (window.top === window) {
  checkForUpdateToast();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    !EE.THEME_STORAGE_KEY_LIST.some((key) => changes[key])
    && !changes[ETEST_AUTO_THEME_OFF_KEY]
    && !changes[ACTIVITY_SHIELD_ENABLED_KEY]
  ) return;

  chrome.storage.local.get(
    [...EE.THEME_STORAGE_KEY_LIST, ETEST_AUTO_THEME_OFF_KEY, ACTIVITY_SHIELD_ENABLED_KEY],
    (result) => {
      const themeSettings = EE.readThemeSettings(result);
      const settings = {
        darkModeEnabled: themeSettings.darkModeEnabled,
        theme: themeSettings.theme,
        customTheme: themeSettings.customTheme,
        cleanEnabled: themeSettings.cleanUiEnabled,
        helpHidden: themeSettings.hideHelpTextEnabled,
        heroesHidden: themeSettings.hidePageHeroesEnabled,
        personalInfoHidden: themeSettings.hidePersonalInfoEnabled,
        rozvrhRoomChangeColor: themeSettings.rozvrhRoomChangeColor,
        rozvrhSubstitutionColor: themeSettings.rozvrhSubstitutionColor,
        etestAutoThemeOff: isEtestAutoThemeOffActive(result),
      };
      applyTheme(settings);
      writeThemeCache(settings);
    },
  );
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "ee-set-theme") {
    applyTheme({
      darkModeEnabled: message.darkModeEnabled === true,
      theme: message.theme,
      customTheme: message.customTheme || currentCustomTheme,
      cleanEnabled: message.cleanUiEnabled === true,
      helpHidden: message.hideHelpTextEnabled === true,
      heroesHidden: message.hidePageHeroesEnabled === true,
      personalInfoHidden: message.hidePersonalInfoEnabled === true,
      rozvrhRoomChangeColor: message.rozvrhRoomChangeColor || currentRozvrhRoomChangeColor,
      rozvrhSubstitutionColor: message.rozvrhSubstitutionColor || currentRozvrhSubstitutionColor,
      etestAutoThemeOff: message.etestAutoThemeOff === true,
    });
  }
  if (message && message.type === "ee-preview-update-toast") {
    showUpdateToast(chrome.runtime.getManifest().version);
  }
  return false;
});
