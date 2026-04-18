/**
 * content.js - Edupage Extras: Dark Mode
 *
 * Edupage uses many independent modules with hardcoded colors and inline
 * styles. Static selectors cover known pages, while the normalizer below tags
 * newly rendered light surfaces and dark text so dark mode stays consistent.
 */

const STORAGE_KEY = "darkModeEnabled";
const THEME_KEY = "themeMode";
const CLEAN_UI_KEY = "cleanUiEnabled";
const HIDE_HELP_TEXT_KEY = "hideHelpTextEnabled";
const CLASS_NAME = "ee-dark";
const THEME_CLASSES = ["ee-theme-dark", "ee-theme-ocean", "ee-theme-forest", "ee-theme-light"];
const CLEAN_UI_CLASS = "ee-clean-ui";
const HIDE_HELP_TEXT_CLASS = "ee-hide-help-text";
const STYLE_ID = "ee-dark-mode-style";
const SURFACE_CLASS = "ee-dark-surface";
const ELEVATED_CLASS = "ee-dark-elevated";
const MUTED_SURFACE_CLASS = "ee-dark-muted-surface";
const TEXT_CLASS = "ee-dark-text";
const MUTED_TEXT_CLASS = "ee-dark-muted-text";
const BORDER_CLASS = "ee-dark-border";
const NORMALIZED_ATTR = "data-ee-dark-normalized";

let observer = null;
let normalizeTimer = null;
let hasBootstrappedDarkMode = false;
let currentTheme = "dark";
let cleanUiEnabled = true;
let hideHelpTextEnabled = true;

function buildDarkCSS() {
  return `
    html.ee-dark {
      color-scheme: dark !important;
      --ee-bg-base: #11111b;
      --ee-bg-raised: #181825;
      --ee-bg-elevated: #1e1e2e;
      --ee-bg-muted: #2a2b3d;
      --ee-border: #313244;
      --ee-text-main: #cdd6f4;
      --ee-text-muted: #a6adc8;
      --ee-accent: #89b4fa;
      --ee-warning: #fab387;
      --ee-danger: #f38ba8;
    }

    html.ee-theme-ocean {
      --ee-bg-base: #071a1f;
      --ee-bg-raised: #0c252c;
      --ee-bg-elevated: #12343d;
      --ee-bg-muted: #1d4b55;
      --ee-border: #2e6470;
      --ee-text-main: #d8f3f0;
      --ee-text-muted: #9cc6c8;
      --ee-accent: #61d4d4;
      --ee-warning: #ffd166;
      --ee-danger: #ff6b7a;
    }

    html.ee-theme-forest {
      --ee-bg-base: #11170f;
      --ee-bg-raised: #182316;
      --ee-bg-elevated: #21311d;
      --ee-bg-muted: #30452b;
      --ee-border: #466241;
      --ee-text-main: #e5f2df;
      --ee-text-muted: #b2c7aa;
      --ee-accent: #93d36b;
      --ee-warning: #e9c46a;
      --ee-danger: #ef767a;
    }

    html.ee-dark,
    html.ee-dark body {
      background-color: var(--ee-bg-base) !important;
      color: var(--ee-text-main) !important;
    }

    html.ee-dark ::selection {
      background-color: #45475a !important;
      color: var(--ee-text-main) !important;
    }

    html.ee-dark input,
    html.ee-dark textarea,
    html.ee-dark select,
    html.ee-dark button {
      background-color: var(--ee-bg-elevated) !important;
      color: var(--ee-text-main) !important;
      border-color: var(--ee-border) !important;
    }

    html.ee-dark input::placeholder,
    html.ee-dark textarea::placeholder {
      color: var(--ee-text-muted) !important;
    }

    /* Known Edupage containers and modules */
    html.ee-dark .bgDiv,
    html.ee-dark .userHomeWidget,
    html.ee-dark .userTopDiv,
    html.ee-dark .userContentInner,
    html.ee-dark .withMargin,
    html.ee-dark .userTopDivInner,
    html.ee-dark .wmaxL1,
    html.ee-dark .skinContent,
    html.ee-dark .skinBody,
    html.ee-dark .mainBox,
    html.ee-dark .edubarMainNoSkin,
    html.ee-dark #bar_mainDiv,
    html.ee-dark #eb_main_content,
    html.ee-dark .smartb,
    html.ee-dark .timeline-container,
    html.ee-dark .timeline-item,
    html.ee-dark .tml-item,
    html.ee-dark .grid-container,
    html.ee-dark .notifBox,
    html.ee-dark .hwMainListMain,
    html.ee-dark body.skindefault {
      background-color: var(--ee-bg-base) !important;
      color: var(--ee-text-main) !important;
    }

    html.ee-dark .userTopLogo,
    html.ee-dark .userTopLogo div {
      color: var(--ee-text-main) !important;
      background-color: transparent !important;
      background-image: none !important;
    }

    html.ee-dark .userButton,
    html.ee-dark .userRozvrh,
    html.ee-dark .rozvrhItem,
    html.ee-dark .rozvrhItemAlign,
    html.ee-dark .userCal2,
    html.ee-dark .calendar,
    html.ee-dark .gotoDay,
    html.ee-dark .day,
    html.ee-dark .userCalInner,
    html.ee-dark .usercalendarTitle,
    html.ee-dark .usercalendarTitle h1,
    html.ee-dark #edubar,
    html.ee-dark .edubarHeader,
    html.ee-dark .edubarHeaderRight,
    html.ee-dark .edubarSidebar,
    html.ee-dark .edubarSidemenu2,
    html.ee-dark #edubarStartButton,
    html.ee-dark .profilemenu,
    html.ee-dark .profilemenu li,
    html.ee-dark .profilemenu a,
    html.ee-dark .edubarProfilebox,
    html.ee-dark .hwItem,
    html.ee-dark .hwItemBg,
    html.ee-dark .hwItemInner,
    html.ee-dark .hwListElem,
    html.ee-dark .edubarRibbon,
    html.ee-dark .ribbon-tab,
    html.ee-dark .ribbon-section,
    html.ee-dark .ribbon-button,
    html.ee-dark .hwDateItem,
    html.ee-dark .hwWeekItem,
    html.ee-dark .tml-in-reply,
    html.ee-dark .ttday,
    html.ee-dark .ttItem,
    html.ee-dark .tt-day,
    html.ee-dark .timetable,
    html.ee-dark .timetable-cell,
    html.ee-dark .substitution-item,
    html.ee-dark .attendance-box,
    html.ee-dark .attendanceItem,
    html.ee-dark .dialog,
    html.ee-dark .popup,
    html.ee-dark .gadgetBox,
    html.ee-dark .hw-content,
    html.ee-dark .print-box,
    html.ee-dark .modal-content,
    html.ee-dark .zsvHeader,
    html.ee-dark .zsvFilterElem,
    html.ee-dark #znamkyTableHeaderBg,
    html.ee-dark .zsvActionButtonsInner,
    html.ee-dark table.znamkyTable,
    html.ee-dark table.znamkyTable tr {
      background-color: var(--ee-bg-raised) !important;
      color: var(--ee-text-main) !important;
      border-color: var(--ee-border) !important;
    }

    html.ee-dark .userButton:hover,
    html.ee-dark .profilemenu a:hover,
    html.ee-dark .edubarMenuitem.active > a,
    html.ee-dark .edubarMenuitem:hover > a,
    html.ee-dark .zsvHeaderTab.selected,
    html.ee-dark .zsvHeaderTab:hover,
    html.ee-dark .flat-button:hover,
    html.ee-dark table.znamkyTable tr.predmetRow:nth-child(even) {
      background-color: var(--ee-bg-elevated) !important;
    }

    html.ee-dark .userButton {
      border: 1px solid var(--ee-border) !important;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3) !important;
      transition: transform 0.2s, background-color 0.2s !important;
    }

    html.ee-dark .userButton:hover {
      border-color: var(--ee-accent) !important;
      transform: translateY(-2px);
    }

    html.ee-dark .userButton .title,
    html.ee-dark h1,
    html.ee-dark h2,
    html.ee-dark h3,
    html.ee-dark table.znamkyTable td,
    html.ee-dark table.znamkyTable th {
      color: var(--ee-text-main) !important;
    }

    html.ee-dark .userButton .subtitle,
    html.ee-dark .userButton .subtitle *,
    html.ee-dark .zsvHeaderTitle span,
    html.ee-dark .edubarMenuitem > a,
    html.ee-dark .rozvrhItem .casy {
      color: var(--ee-text-muted) !important;
    }

    html.ee-dark .subtitle b,
    html.ee-dark .rozvrhItem .predmet,
    html.ee-dark .calendar .day .date,
    html.ee-dark .event.schoolevent b,
    html.ee-dark #edubarStartButton span,
    html.ee-dark #edubarStartButton div,
    html.ee-dark .edubarMenuitem.active > a,
    html.ee-dark .edubarMenuitem:hover > a,
    html.ee-dark table.znamkyTable thead th,
    html.ee-dark a {
      color: var(--ee-accent) !important;
    }

    html.ee-dark .calendar .day.today,
    html.ee-dark .rozvrhItem.selected {
      background-color: #1e3a5f !important;
      border: 1px solid var(--ee-accent) !important;
    }

    html.ee-dark .events li {
      background-color: var(--ee-bg-muted) !important;
      color: var(--ee-text-main) !important;
      border: none !important;
    }

    html.ee-dark .events li a {
      color: inherit !important;
    }

    html.ee-dark .notif {
      background-color: var(--ee-danger) !important;
      color: var(--ee-bg-base) !important;
    }

    html.ee-dark .zsvHeaderTabs {
      background-color: transparent !important;
    }

    html.ee-dark .zsvHeaderTab,
    html.ee-dark .dropDownPanel,
    html.ee-dark .dropDown,
    html.ee-dark .zsvFilterItem select,
    html.ee-dark .flat-button {
      background-color: var(--ee-bg-elevated) !important;
      color: var(--ee-text-main) !important;
      border-color: var(--ee-border) !important;
    }

    html.ee-dark .ee-avg-bar-track {
      background-color: var(--ee-border) !important;
    }

    html.ee-dark tr.ee-overall-row td {
      background-color: var(--ee-bg-elevated) !important;
      border-top-color: var(--ee-accent) !important;
      color: var(--ee-text-main) !important;
    }

    html.ee-dark tr.ee-overall-row .ee-overall-label {
      color: var(--ee-accent) !important;
    }

    html.ee-dark .warning,
    html.ee-dark .hasChange {
      color: var(--ee-warning) !important;
      border-color: var(--ee-warning) !important;
    }

    /* Runtime-normalized unknown Edupage markup */
    html.ee-dark .${SURFACE_CLASS} {
      background-color: var(--ee-bg-raised) !important;
      background-image: none !important;
    }

    html.ee-dark .${ELEVATED_CLASS} {
      background-color: var(--ee-bg-elevated) !important;
      background-image: none !important;
    }

    html.ee-dark .${MUTED_SURFACE_CLASS} {
      background-color: var(--ee-bg-muted) !important;
      background-image: none !important;
    }

    html.ee-dark .${TEXT_CLASS} {
      color: var(--ee-text-main) !important;
    }

    html.ee-dark .${MUTED_TEXT_CLASS} {
      color: var(--ee-text-muted) !important;
    }

    html.ee-dark .${BORDER_CLASS} {
      border-color: var(--ee-border) !important;
      outline-color: var(--ee-border) !important;
    }

    /* Inline hardcoded light backgrounds that are common in Edupage widgets */
    html.ee-dark *[style*="background-color: white"],
    html.ee-dark *[style*="background: white"],
    html.ee-dark *[style*="background-color: #fff"],
    html.ee-dark *[style*="background: #fff"],
    html.ee-dark *[style*="background-color:#ffffff"],
    html.ee-dark *[style*="background-color: #ffffff"],
    html.ee-dark *[style*="background-color: rgb(255, 255, 255)"],
    html.ee-dark *[style*="background-color: #f5f5f5"],
    html.ee-dark *[style*="background-color: #eeeeee"],
    html.ee-dark *[style*="background-color: #f6f7f9"] {
      background-color: var(--ee-bg-raised) !important;
      color: var(--ee-text-main) !important;
    }

    html.ee-dark img {
      filter: brightness(0.82) contrast(1.08) !important;
    }

    html.ee-dark .user-button-icon,
    html.ee-dark .ebicon,
    html.ee-dark .qbutton img,
    html.ee-dark img[src*="Icon"],
    html.ee-dark img[src*="icon"] {
      filter: invert(0.82) hue-rotate(180deg) !important;
    }

    html.ee-dark * {
      box-shadow: none !important;
    }

    html.ee-dark .userButton,
    html.ee-dark .profilemenu,
    html.ee-dark .day {
      box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.4) !important;
    }

    html.ee-clean-ui .adsbygoogle,
    html.ee-clean-ui iframe[src*="ads"],
    html.ee-clean-ui [class*="advert"],
    html.ee-clean-ui [id*="advert"],
    html.ee-clean-ui [class*="banner"],
    html.ee-clean-ui [id*="banner"] {
      display: none !important;
    }

    html.ee-clean-ui .skinContent,
    html.ee-clean-ui .userContentInner,
    html.ee-clean-ui #eb_main_content,
    html.ee-clean-ui .mainBox,
    html.ee-clean-ui .userTopDivInner,
    html.ee-clean-ui .userTopDiv .withMargin,
    html.ee-clean-ui .userRozvrh {
      margin-left: auto !important;
      margin-right: auto !important;
      max-width: 1180px !important;
    }

    html.ee-clean-ui .userTopDiv {
      display: block !important;
      padding-left: 12px !important;
      padding-right: 12px !important;
    }

    html.ee-clean-ui .userTopDivInner {
      display: flex !important;
      justify-content: center !important;
      width: calc(100% - 24px) !important;
    }

    html.ee-clean-ui .userRozvrh {
      width: min(100%, 1180px) !important;
    }

    html.ee-clean-ui .userButton,
    html.ee-clean-ui .userHomeWidget,
    html.ee-clean-ui .hwItem,
    html.ee-clean-ui .timeline-item,
    html.ee-clean-ui .tml-item,
    html.ee-clean-ui .notifBox,
    html.ee-clean-ui table.znamkyTable,
    html.ee-clean-ui .zsvHeader {
      border-radius: 8px !important;
    }

    html.ee-hide-help-text .ee-help-text {
      display: none !important;
    }
  `;
}

function ensureStylesheet() {
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.textContent = buildDarkCSS();
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildDarkCSS();
  (document.head || document.documentElement).appendChild(style);
}

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

function shouldSkipElement(element) {
  if (!(element instanceof Element)) return true;
  if (element.id === STYLE_ID) return true;
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

  if (borderColors.some((borderColor) => borderColor.a > 0.15 && luminance(borderColor) > 0.68)) {
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

function scheduleNormalize(root = document.documentElement) {
  window.clearTimeout(normalizeTimer);
  normalizeTimer = window.setTimeout(() => normalizeSubtree(root), 80);
}

function startObserver() {
  if (observer || !document.documentElement) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        scheduleNormalize(document.documentElement);
        window.setTimeout(markHelpText, 40);
        return;
      }

      if (
        mutation.type === "attributes" &&
        mutation.target instanceof Element &&
        !mutation.attributeName.startsWith("data-ee-") &&
        mutation.attributeName !== "class"
      ) {
        scheduleNormalize(mutation.target);
        return;
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
}

function clearNormalizedClasses() {
  document.querySelectorAll(`[${NORMALIZED_ATTR}]`).forEach(resetElementClasses);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function markHelpText() {
  document.querySelectorAll(".ee-help-text").forEach((element) => element.classList.remove("ee-help-text"));
  if (!hideHelpTextEnabled) return;

  const helpPhrases = [
    "potrebujete pomoc",
    "chcete sa dozvediet",
    "edupage",
  ];

  document.querySelectorAll(".userTopLogo, .userTopDiv *").forEach((element) => {
    if (!(element instanceof Element) || element.children.length > 4) return;
    const text = normalizeText(element.textContent);
    if (!text || text.length > 220) return;
    if (!helpPhrases.some((phrase) => text.includes(phrase))) return;

    const target = element.closest(".userTopLogo, .userTopDiv > div, .userTopDivInner > div") || element;
    target.classList.add("ee-help-text");
  });
}

function normalizeTheme(theme) {
  return ["dark", "ocean", "forest", "light"].includes(theme) ? theme : "dark";
}

function setThemeClasses(theme, cleanEnabled, helpHidden) {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  root.classList.toggle(CLEAN_UI_CLASS, cleanEnabled);
  root.classList.toggle(HIDE_HELP_TEXT_CLASS, helpHidden);
  root.classList.add(`ee-theme-${theme}`);
  root.dataset.eeTheme = theme;
}

function applyTheme({
  darkModeEnabled = true,
  theme = currentTheme,
  cleanEnabled = cleanUiEnabled,
  helpHidden = hideHelpTextEnabled,
} = {}) {
  const selectedTheme = darkModeEnabled ? normalizeTheme(theme) : "light";
  currentTheme = selectedTheme === "light" ? normalizeTheme(theme) : selectedTheme;
  cleanUiEnabled = cleanEnabled;
  hideHelpTextEnabled = helpHidden;
  ensureStylesheet();
  setThemeClasses(selectedTheme, cleanEnabled, helpHidden);
  markHelpText();

  if (selectedTheme !== "light") {
    document.documentElement.classList.add(CLASS_NAME);
    normalizeSubtree();
    startObserver();
  } else {
    stopObserver();
    document.documentElement.classList.remove(CLASS_NAME);
    clearNormalizedClasses();
  }
}

function applyDarkMode(enabled) {
  applyTheme({
    darkModeEnabled: enabled,
    theme: currentTheme,
    cleanEnabled: cleanUiEnabled,
    helpHidden: hideHelpTextEnabled,
  });
}

function initDarkMode() {
  if (!hasBootstrappedDarkMode) {
    hasBootstrappedDarkMode = true;
    applyTheme({ darkModeEnabled: true, theme: "dark", cleanEnabled: true, helpHidden: true });
  }

  chrome.storage.local.get([STORAGE_KEY, THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY], (result) => {
    const enabled = result[STORAGE_KEY] !== false;
    const theme = normalizeTheme(result[THEME_KEY]);
    const cleanEnabled = result[CLEAN_UI_KEY] !== false;
    const helpHidden = result[HIDE_HELP_TEXT_KEY] !== false;
    applyTheme({ darkModeEnabled: enabled, theme, cleanEnabled, helpHidden });
  });
}

initDarkMode();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    !changes[STORAGE_KEY]
    && !changes[THEME_KEY]
    && !changes[CLEAN_UI_KEY]
    && !changes[HIDE_HELP_TEXT_KEY]
  ) return;

  chrome.storage.local.get([STORAGE_KEY, THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY], (result) => {
    applyTheme({
      darkModeEnabled: result[STORAGE_KEY] !== false,
      theme: normalizeTheme(result[THEME_KEY]),
      cleanEnabled: result[CLEAN_UI_KEY] !== false,
      helpHidden: result[HIDE_HELP_TEXT_KEY] !== false,
    });
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "ee-set-dark-mode") {
    applyDarkMode(Boolean(message.enabled));
  }
  if (message && message.type === "ee-set-theme") {
    applyTheme({
      darkModeEnabled: message.darkModeEnabled !== false,
      theme: message.theme,
      cleanEnabled: message.cleanUiEnabled !== false,
      helpHidden: message.hideHelpTextEnabled !== false,
    });
  }
});
