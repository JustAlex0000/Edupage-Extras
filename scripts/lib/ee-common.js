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

  EE.normalizeTheme = function normalizeTheme(theme) {
    return EE.THEMES.includes(theme) ? theme : "dark";
  };

  EE.normalizeColor = function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  };

  EE.normalizeCustomTheme = function normalizeCustomTheme(theme) {
    return Object.fromEntries(
      Object.entries(EE.DEFAULT_CUSTOM_THEME).map(([key, fallback]) => [
        key,
        EE.normalizeColor(theme?.[key], fallback),
      ]),
    );
  };

  // Strict "YYYY-MM-DD" → local-midnight Date, null for anything else
  // (including real-looking but invalid dates like 2024-02-31).
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

  // Date → "YYYY-MM-DD" (local), "" for invalid input.
  EE.formatDate = function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Diacritics-stripped lowercase slug ("Fyzika – 2. polrok" → "fyzika-2-polrok").
  EE.normalizeKeyText = function normalizeKeyText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  // Return the balanced {...} / [...] / (...) group starting at startIndex,
  // string-literal aware (both quote kinds), or null if unbalanced.
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

  // First balanced object literal following `marker` in `text`.
  EE.extractObjectLiteral = function extractObjectLiteral(text, marker, searchFrom = 0) {
    const markerIndex = text.indexOf(marker, searchFrom);
    if (markerIndex === -1) return null;

    const openBraceIndex = text.indexOf("{", markerIndex + marker.length);
    if (openBraceIndex === -1) return null;

    return EE.extractBalanced(text, openBraceIndex);
  };

  // Split "a, {b, c}, [d]" on top-level commas only, string-literal aware.
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

  // RFC 4180-style CSV field escaping.
  EE.csvEscape = function csvEscape(value) {
    const text = String(value == null ? "" : value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  };

  // Trigger a client-side download of a text file (content script context).
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
