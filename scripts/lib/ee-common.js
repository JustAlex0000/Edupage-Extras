// Shared helpers and constants for Edupage Extras. No bundler: this file is
// loaded before its consumers in every context and publishes a single
// `globalThis.EE` namespace —
//   - content scripts: listed first in the manifest content_scripts js array;
//   - background: first in the Firefox event-page `scripts` array, and pulled
//     into the Chrome service worker via importScripts (see background.js);
//   - menu/settings pages: a plain <script src> before their own scripts;
//   - tests: prepended to the instrumented source before the vm run.
//
// Only helpers whose copies were byte-identical (or strict supersets) across
// files live here — several files keep a local `normalizeText` on purpose
// because their variants have different semantics (slug vs. word-joined).
(function () {
  "use strict";

  const EE = {};

  // Keep "light" for existing installs that chose it before the theme picker
  // stopped showing it. It is a valid no-recolor theme, not an invalid value.
  EE.THEMES = ["dark", "ocean", "forest", "emerald", "pink", "purple", "custom", "light"];

  EE.DEFAULT_CUSTOM_THEME = {
    bgBase: "#11111b",
    bgRaised: "#181825",
    bgElevated: "#1e1e2e",
    bgMuted: "#2a2b3d",
    border: "#313244",
    textMain: "#cdd6f4",
    textMuted: "#bac3df",
    accent: "#89b4fa",
    warning: "#fab387",
    danger: "#f38ba8",
    tableHeaderBg: "#2c70a3",
  };

  /**
   * Normalizes a theme name to a valid theme identifier.
   * @param {string} theme - The theme identifier.
   * @returns {string} Normalized theme name ("dark" fallback).
   */
  EE.normalizeTheme = function normalizeTheme(theme) {
    return EE.THEMES.includes(theme) ? theme : "dark";
  };

  /**
   * Validates and normalizes a 6-digit hex color code.
   * @param {string} value - The hex color candidate string.
   * @param {string} fallback - Fallback hex color string.
   * @returns {string} Hex color string or fallback.
   */
  EE.normalizeColor = function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  };

  /**
   * Normalizes a custom theme configuration object against defaults.
   * @param {Object} [theme] - Partial or complete custom theme map.
   * @returns {Object} Full custom theme map with valid hex colors.
   */
  EE.normalizeCustomTheme = function normalizeCustomTheme(theme) {
    return Object.fromEntries(
      Object.entries(EE.DEFAULT_CUSTOM_THEME).map(([key, fallback]) => [
        key,
        EE.normalizeColor(theme?.[key], fallback),
      ]),
    );
  };

  // Theme state crosses the popup, settings, background worker, cache and
  // content script. Keep the storage names and the message shape in one place
  // so a new appearance/cleanup preference cannot update only some of them.
  EE.THEME_STORAGE_KEYS = Object.freeze({
    darkModeEnabled: "darkModeEnabled",
    theme: "themeMode",
    customTheme: "customThemeColors",
    cleanUiEnabled: "cleanUiEnabled",
    hideHelpTextEnabled: "hideHelpTextEnabled",
    hidePageHeroesEnabled: "eeHidePageHeroesEnabled",
    hidePersonalInfoEnabled: "eeHidePersonalInfoEnabled",
    hideLikesEnabled: "eeHideLikesEnabled",
    hideEdupageHelpEnabled: "eeHideEdupageHelpEnabled",
    hideEducationalGamesEnabled: "eeHideEducationalGamesEnabled",
    hideTestYourselfEnabled: "eeHideTestYourselfEnabled",
    hideInteractiveBlackboardsEnabled: "eeHideInteractiveBlackboardsEnabled",
    hidePhotosEnabled: "eeHidePhotosEnabled",
    hideRegistrationSurveysEnabled: "eeHideRegistrationSurveysEnabled",
    rozvrhRoomChangeColor: "eeRozvrhRoomChangeColor",
    rozvrhSubstitutionColor: "eeRozvrhSubstitutionColor",
  });
  EE.THEME_STORAGE_KEY_LIST = Object.freeze(Object.values(EE.THEME_STORAGE_KEYS));

  /**
   * Reads and normalizes theme and cleanup settings from storage values.
   * @param {Object} [values={}] - Raw storage object read from chrome.storage.local.
   * @returns {Object} Normalized theme and cleanup settings object.
   */
  EE.readThemeSettings = function readThemeSettings(values = {}) {
    const keys = EE.THEME_STORAGE_KEYS;
    return {
      darkModeEnabled: values[keys.darkModeEnabled] === true,
      theme: EE.normalizeTheme(values[keys.theme]),
      // Preserve the stored shape here. Consumers normalize it when applying
      // colors; the live update message must not silently expand a partial
      // custom-theme object while a user is editing it.
      customTheme: values[keys.customTheme],
      cleanUiEnabled: values[keys.cleanUiEnabled] === true,
      hideHelpTextEnabled: values[keys.hideHelpTextEnabled] === true,
      hidePageHeroesEnabled: values[keys.hidePageHeroesEnabled] === true,
      hidePersonalInfoEnabled: values[keys.hidePersonalInfoEnabled] === true,
      hideLikesEnabled: values[keys.hideLikesEnabled] === true,
      hideEdupageHelpEnabled: values[keys.hideEdupageHelpEnabled] === true,
      hideEducationalGamesEnabled: values[keys.hideEducationalGamesEnabled] === true,
      hideTestYourselfEnabled: values[keys.hideTestYourselfEnabled] === true,
      hideInteractiveBlackboardsEnabled: values[keys.hideInteractiveBlackboardsEnabled] === true,
      hidePhotosEnabled: values[keys.hidePhotosEnabled] === true,
      hideRegistrationSurveysEnabled: values[keys.hideRegistrationSurveysEnabled] === true,
      rozvrhRoomChangeColor: values[keys.rozvrhRoomChangeColor],
      rozvrhSubstitutionColor: values[keys.rozvrhSubstitutionColor],
    };
  };

  /**
   * Constructs an "ee-set-theme" message object for tab broadcast.
   * @param {Object} [settings={}] - Theme settings object.
   * @param {Object} [extras={}] - Additional payload fields.
   * @returns {Object} Message object for content script theme update.
   */
  EE.createThemeMessage = function createThemeMessage(settings = {}, extras = {}) {
    return {
      type: "ee-set-theme",
      darkModeEnabled: settings.darkModeEnabled === true,
      theme: EE.normalizeTheme(settings.theme),
      customTheme: settings.customTheme,
      cleanUiEnabled: settings.cleanUiEnabled === true,
      hideHelpTextEnabled: settings.hideHelpTextEnabled === true,
      hidePageHeroesEnabled: settings.hidePageHeroesEnabled === true,
      hidePersonalInfoEnabled: settings.hidePersonalInfoEnabled === true,
      hideLikesEnabled: settings.hideLikesEnabled === true,
      hideEdupageHelpEnabled: settings.hideEdupageHelpEnabled === true,
      hideEducationalGamesEnabled: settings.hideEducationalGamesEnabled === true,
      hideTestYourselfEnabled: settings.hideTestYourselfEnabled === true,
      hideInteractiveBlackboardsEnabled: settings.hideInteractiveBlackboardsEnabled === true,
      hidePhotosEnabled: settings.hidePhotosEnabled === true,
      hideRegistrationSurveysEnabled: settings.hideRegistrationSurveysEnabled === true,
      rozvrhRoomChangeColor: settings.rozvrhRoomChangeColor,
      rozvrhSubstitutionColor: settings.rozvrhSubstitutionColor,
      ...extras,
    };
  };

  // Strict "YYYY-MM-DD" → local-midnight Date, null for anything else
  // (including real-looking but invalid dates like 2024-02-31).
  /**
   * Parses a strict "YYYY-MM-DD" string into a local midnight Date.
   * @param {string} value - Date string candidate.
   * @returns {Date|null} Valid Date object at local midnight, or null for invalid input.
   */
  EE.parseDateOnly = function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const date = new Date(year, month - 1, day);

    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) {
      return null;
    }

    return date;
  };

  /**
   * Formats a Date object to local "YYYY-MM-DD" string format.
   * @param {Date} date - Date object.
   * @returns {string} Formatted date string, or empty string if invalid.
   */
  EE.formatDate = function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  /**
   * Normalizes text to a diacritics-stripped lowercase slug.
   * @param {string} value - Text string to normalize.
   * @returns {string} Normalized slug ("fyzika-2-polrok").
   */
  EE.normalizeKeyText = function normalizeKeyText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  /**
   * Extracts a balanced bracket/brace/parenthesis group from text.
   * @param {string} text - Source code string.
   * @param {number} startIndex - Character index of opening bracket/brace/paren.
   * @returns {string|null} Balanced substring or null if unbalanced.
   */
  EE.extractBalanced = function extractBalanced(text, startIndex) {
    const opening = text[startIndex];
    const closing = opening === "{" ? "}" : opening === "[" ? "]" : opening === "(" ? ")" : "";
    if (!closing) return null;

    let depth = 0;
    let inString = false;
    let stringQuote = "";
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (character === "\\") {
          escaped = true;
        } else if (character === stringQuote) {
          inString = false;
          stringQuote = "";
        }
        continue;
      }

      if (character === "\"" || character === "'") {
        inString = true;
        stringQuote = character;
        continue;
      }

      if (character === opening) {
        depth += 1;
      } else if (character === closing) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

    return null;
  };

  /**
   * Extracts the first balanced object literal `{...}` following a marker string.
   * @param {string} text - Source code text.
   * @param {string} marker - Prefix marker to search for.
   * @param {number} [searchFrom=0] - Index to search from.
   * @returns {string|null} Object literal substring or null.
   */
  EE.extractObjectLiteral = function extractObjectLiteral(text, marker, searchFrom = 0) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) return null;

    const openBraceIndex = text.indexOf("{", markerIndex + marker.length);
    if (openBraceIndex === -1) return null;

    return EE.extractBalanced(text, openBraceIndex);
  };

  /**
   * Splits top-level arguments on commas, ignoring commas inside nested brackets or string literals.
   * @param {string} text - Argument list string.
   * @returns {string[]} Trimmed argument substrings.
   */
  EE.splitTopLevelArguments = function splitTopLevelArguments(text) {
    const values = [];
    let startIndex = 0;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;
    let inString = false;
    let stringQuote = "";
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (character === "\\") {
          escaped = true;
        } else if (character === stringQuote) {
          inString = false;
          stringQuote = "";
        }
        continue;
      }

      if (character === "\"" || character === "'") {
        inString = true;
        stringQuote = character;
        continue;
      }

      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
      } else if (character === "[") {
        bracketDepth += 1;
      } else if (character === "]") {
        bracketDepth -= 1;
      } else if (character === "(") {
        parenDepth += 1;
      } else if (character === ")") {
        parenDepth -= 1;
      } else if (character === "," && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
        values.push(text.slice(startIndex, index).trim());
        startIndex = index + 1;
      }
    }

    const tail = text.slice(startIndex).trim();
    if (tail) {
      values.push(tail);
    }

    return values;
  };

  /**
   * Escapes HTML special characters for safe inclusion in markup.
   * @param {string} value - Raw string value.
   * @returns {string} HTML-escaped string.
   */
  EE.escapeHtml = function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  /**
   * Escapes values for RFC 4180 CSV export with formula injection protection.
   * @param {string} value - Raw cell value.
   * @returns {string} Escaped CSV cell text.
   */
  EE.csvEscape = function csvEscape(value) {
    const text = String(value == null ? "" : value);
    const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
    if (/[",\r\n]/.test(safeText)) return '"' + safeText.replace(/"/g, '""') + '"';
    return safeText;
  };

  /**
   * Triggers a browser download of a text blob file.
   * @param {string} filename - Target filename.
   * @param {string} mime - MIME type string.
   * @param {string} content - Text payload.
   */
  EE.downloadTextFile = function downloadTextFile(filename, mime, content) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  globalThis.EE = EE;
})();
