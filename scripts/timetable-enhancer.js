/**
 * timetable-enhancer.js
 *
 * Highlights substitutions and classroom changes in the EduPage timetable
 * widget (the horizontal grid on the main page that uses .tt-cell elements).
 *
 * EduPage marks changed cells with a dashed inline border. We read the border
 * color to distinguish between change types:
 *   - Reddish/orange dashed border → substitution  (teacher replaced)
 *   - Bluish/cyan dashed border    → room change    (classroom changed)
 *   - Unknown dashed border        → generic change (orange fallback)
 */

(function () {
  "use strict";

  if (window.top !== window) return;

  const STYLE_ID = "ee-timetable-enhancer-style";
  const HIGHLIGHTS_KEY = "timetableHighlightsEnabled";
  const PROCESSED_ATTR = "data-ee-tt-type";

  let highlightsEnabled = true;
  let scheduleTimer = null;

  // ── Styles ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Substitution: teacher was replaced (orange) */
      .tt-cell.ee-tt-substitution {
        background-color: rgba(245, 124, 0, 0.25) !important;
        outline: 2px dashed rgba(245, 124, 0, 0.7) !important;
        outline-offset: -2px !important;
      }

      /* Room change: classroom was changed (blue) */
      .tt-cell.ee-tt-room-change {
        background-color: rgba(21, 101, 192, 0.25) !important;
        outline: 2px dashed rgba(21, 101, 192, 0.7) !important;
        outline-offset: -2px !important;
      }

      /* Generic change (when border color doesn't give a clear signal) */
      .tt-cell.ee-tt-changed {
        background-color: rgba(245, 124, 0, 0.25) !important;
        outline: 2px dashed rgba(245, 124, 0, 0.7) !important;
        outline-offset: -2px !important;
      }

      /* Dark mode */
      html.ee-dark .tt-cell.ee-tt-substitution {
        background-color: rgba(250, 179, 135, 0.2) !important;
        outline-color: var(--ee-warning) !important;
      }

      html.ee-dark .tt-cell.ee-tt-room-change {
        background-color: rgba(137, 180, 250, 0.2) !important;
        outline-color: var(--ee-accent) !important;
      }

      html.ee-dark .tt-cell.ee-tt-changed {
        background-color: rgba(250, 179, 135, 0.2) !important;
        outline-color: var(--ee-warning) !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  // ── Border-color classifier ─────────────────────────────────────────────────

  /**
   * Parses the R, G, B components from a CSS color value like
   * "rgb(255, 100, 0)" or "#ff6400". Returns null if unparseable.
   */
  function parseRgb(color) {
    const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
    if (rgb) {
      return { r: parseInt(rgb[1], 10), g: parseInt(rgb[2], 10), b: parseInt(rgb[3], 10) };
    }
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
    if (hex) {
      return { r: parseInt(hex[1], 16), g: parseInt(hex[2], 16), b: parseInt(hex[3], 16) };
    }
    return null;
  }

  /**
   * Classifies a dashed-border cell as "substitution", "room-change", or
   * "changed" (fallback) based on the border's RGB hue.
   */
  function classifyByBorderColor(cell) {
    const border = cell.style.border || "";

    // Pull colour token out of the border shorthand
    const colorMatch = border.match(/rgb[a]?\([^)]+\)|#[0-9a-f]{3,8}/i);
    const rgb = colorMatch ? parseRgb(colorMatch[0]) : null;

    if (rgb) {
      const { r, g, b } = rgb;
      // Reddish / orange dominant → substitution
      if (r > 150 && r > g * 1.3 && r > b * 1.3) return "substitution";
      // Bluish dominant → room change
      if (b > 100 && b > r * 1.3 && b >= g * 0.7) return "room-change";
      // Cyan / teal (high G + B, low R) → also room change
      if (g > 100 && b > 100 && r < 100) return "room-change";
    }

    return "changed"; // fallback — orange tint, same as substitution
  }

  // ── Core enhancement ────────────────────────────────────────────────────────

  function enhanceTimetable() {
    document.querySelectorAll("div.tt-cell").forEach((cell) => {
      // Only interactive lesson blocks (not the text-overlay layers)
      if (cell.style.cursor !== "pointer" || cell.style.pointerEvents === "none") return;
      // Already processed — skip unless EduPage re-rendered it (attr removed)
      if (cell.hasAttribute(PROCESSED_ATTR)) return;

      const border = cell.style.border || "";
      if (!border.includes("dashed")) {
        cell.setAttribute(PROCESSED_ATTR, "none");
        return;
      }

      const type = classifyByBorderColor(cell);
      cell.setAttribute(PROCESSED_ATTR, type);

      if (type === "substitution") {
        cell.classList.add("ee-tt-substitution");
      } else if (type === "room-change") {
        cell.classList.add("ee-tt-room-change");
      } else {
        cell.classList.add("ee-tt-changed");
      }
    });
  }

  function scheduleEnhance() {
    window.clearTimeout(scheduleTimer);
    scheduleTimer = window.setTimeout(enhanceTimetable, 200);
  }

  function clearHighlights() {
    document.querySelectorAll(".ee-tt-substitution, .ee-tt-room-change, .ee-tt-changed").forEach((el) => {
      el.classList.remove("ee-tt-substitution", "ee-tt-room-change", "ee-tt-changed");
      el.removeAttribute(PROCESSED_ATTR);
    });
    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => el.removeAttribute(PROCESSED_ATTR));
  }

  // ── Observer ────────────────────────────────────────────────────────────────

  function initObserver() {
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof Element)) return false;
          return node.matches?.(".tt-cell") || Boolean(node.querySelector?.(".tt-cell"));
        }),
      );
      if (relevant) scheduleEnhance();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // ── Storage ─────────────────────────────────────────────────────────────────

  function initStorage() {
    chrome.storage.local.get([HIGHLIGHTS_KEY], (result) => {
      highlightsEnabled = result[HIGHLIGHTS_KEY] !== false;
      if (highlightsEnabled) enhanceTimetable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[HIGHLIGHTS_KEY]) return;
      highlightsEnabled = changes[HIGHLIGHTS_KEY].newValue !== false;
      if (highlightsEnabled) {
        enhanceTimetable();
      } else {
        clearHighlights();
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    injectStyles();
    initStorage();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        enhanceTimetable();
        initObserver();
      }, { once: true });
    } else {
      enhanceTimetable();
      initObserver();
    }
  }

  init();
})();
