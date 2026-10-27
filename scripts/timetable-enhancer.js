/**
 * timetable-enhancer.js
 *
 * Two independent enhancements to the homepage "Rozvrh dnes" widget
 * (ul.rozvrh > li.rozvrhItem):
 *
 * 1. Colors each changed period by its real type — teacher substitution,
 *    room change, or a lesson moved in from another day/period — instead of
 *    EduPage's generic "hasChange" flag, which carries no type information.
 *    The real type lives on a separate page ("Suplovanie"), read here via the
 *    Suplovanie viewer.js POST — a direct fetch() using the page's gsechash
 *    that returns the section HTML without opening a tab (see
 *    fetchSubstitutionSectionsDirect).
 *
 * 2. Replaces the .trieda text (normally just the student's own class, e.g.
 *    "II.SA" on nearly every period — not useful information to the student
 *    themselves) with the room for that period instead, e.g. "012". This
 *    data comes from the "ttday" page, which — unlike Suplovanie — embeds its
 *    data directly in the server-rendered HTML, so no hidden tab is needed.
 */

(function () {
  "use strict";

  if (window.top !== window) return;

  const STYLE_ID = "ee-timetable-enhancer-style";
  const HIGHLIGHTS_KEY = "timetableHighlightsEnabled";

  let highlightsEnabled = false;
  let highlightGeneration = 0;

  // ── Styles ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Homepage "Rozvrh dnes" widget (ul.rozvrh > li.rozvrhItem) — colored by
         the real change type read from the Suplovanie page, not a guess.
         Colors come from --ee-rozvrh-* custom properties (set by content.js
         from user settings, defaulting to blue/orange).

         EduPage paints the period-number box (.hodina) of EVERY changed lesson
         the same olive/yellow (rule: .userTopDiv ul.rozvrh li.hasChange .hodina),
         so a room change and a substitution look identical. We recolor just that
         box by the real type instead — leaving the rest of the cell untouched.
         The native rule isn't !important, so ours win; html.ee-dark variants are
         included in case the dark theme repaints .hodina. */
      li.rozvrhItem.ee-rozvrh-substitution .hodina,
      li.rozvrhItem.ee-rozvrh-changed .hodina,
      html.ee-dark li.rozvrhItem.ee-rozvrh-substitution .hodina,
      html.ee-dark li.rozvrhItem.ee-rozvrh-changed .hodina {
        background-color: var(--ee-rozvrh-substitution-color, #e65100) !important;
        color: #fff !important;
      }

      li.rozvrhItem.ee-rozvrh-room-change .hodina,
      html.ee-dark li.rozvrhItem.ee-rozvrh-room-change .hodina {
        background-color: var(--ee-rozvrh-room-change-color, #1565c0) !important;
        color: #fff !important;
      }

      li.rozvrhItem.ee-rozvrh-moved .hodina,
      html.ee-dark li.rozvrhItem.ee-rozvrh-moved .hodina {
        background-color: #8e24aa !important;
        color: #fff !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  // ── Homepage "Rozvrh dnes" widget ───────────────────────────────────────────
  //
  // The homepage (e.g. https://school.edupage.org/user/?) shows today's lessons
  // as ul.rozvrh > li.rozvrhItem, flagging changed periods with a generic
  // "hasChange" class only — EduPage gives no type info in this widget's DOM.
  // The real type (teacher substitution vs. room change vs. moved-in lesson) is
  // on the separate "Suplovanie" page (mode=substitution), structured as:
  //   div.section.print-nobreak              (one per class, e.g. "II.SA")
  //     div.header                           -> class label
  //     div.rows > div.row.change|add|remove
  //       div.period                         -> "2." or a range "1. - 2."
  //                                              when consecutive periods share
  //                                              the same change (or "(2.)" if
  //                                              the period was removed)
  //       div.info                           -> "ZAE - Učiteľ: FRA, Zameniť učebňu: (...) ➔ (...)"
  // We match by period number + the homepage item's own .trieda label (which
  // equals — or, for shared elective groups, comma-lists — the section
  // heading), then classify the info text:
  //   "Suplovanie:"       -> substitution (teacher replaced)
  //   "Zameniť učebňu:"   -> room-change
  //   row.add              -> moved (lesson moved in from another day/period)

  const ROZVRH_PROCESSED_ATTR = "data-ee-rozvrh-type";
  const ROZVRH_CLASS_BY_TYPE = {
    "substitution": "ee-rozvrh-substitution",
    "room-change": "ee-rozvrh-room-change",
    "moved": "ee-rozvrh-moved",
    "changed": "ee-rozvrh-changed",
  };

  const WIDGET_CACHE_TTL_MS = 30 * 60 * 1000;
  const WIDGET_RETRY_MS = 30 * 1000;
  const substitutionCache = createWidgetCache();
  const roomCache = createWidgetCache();
  const classificationVersions = new WeakMap();
  const roomVersions = new WeakMap();
  const originalTitles = new WeakMap();
  let rozvrhScheduleTimer = null;

  function createWidgetCache() {
    return { date: "", value: null, fetchedAt: 0, attemptedAt: -Infinity, pending: null, generation: 0 };
  }

  function freshWidgetValue(cache, date = getWidgetDateKey()) {
    return cache.date === date && Date.now() - cache.fetchedAt < WIDGET_CACHE_TTL_MS ? cache.value : null;
  }

  async function readWidgetCache(cache, date, fetcher) {
    if (cache.date !== date) {
      cache.date = date;
      cache.value = null;
      cache.pending = null;
      cache.attemptedAt = -Infinity;
      cache.generation++;
    }
    const fresh = freshWidgetValue(cache, date);
    if (fresh !== null) return fresh;
    if (cache.pending) return cache.pending;
    if (Date.now() - cache.attemptedAt < WIDGET_RETRY_MS) return null;
    cache.attemptedAt = Date.now();
    const stamp = cache.generation;
    const pending = (async () => {
      const value = await fetcher(date);
      if (stamp !== cache.generation || cache.date !== date) return null;
      if (value !== null) { cache.value = value; cache.fetchedAt = Date.now(); }
      return value;
    })();
    cache.pending = pending;
    try { return await pending; }
    finally { if (cache.pending === pending) cache.pending = null; }
  }

  // .trieda starts out holding the student's own class label (or, for shared
  // elective groups, a comma list of classes). Matching against Suplovanie
  // needs that original label, but enhanceRozvrhRooms() below overwrites the
  // visible text with the room name instead — so the original is captured
  // once, on whichever of the two enhancers runs first, before either touches it.
  function getOriginalTrieda(item) {
    if (item.dataset.eeOriginalTrieda === undefined) {
      item.dataset.eeOriginalTrieda = (item.querySelector(".trieda")?.textContent || "").trim();
    }
    return item.dataset.eeOriginalTrieda;
  }

  // Single period like ".hodina" text -> "2". Not range-aware; only used for
  // the homepage's own per-item period number, which is always singular.
  function periodDigits(text) {
    const match = /\d+/.exec(text || "");
    return match ? match[0] : "";
  }

  // Suplovanie period text can be a single period ("2.") or, when consecutive
  // periods share one change, a range ("1. - 2."). Expand the range so every
  // period it covers can be matched individually.
  function periodNumbers(text) {
    const matches = String(text || "").match(/\d+/g) || [];
    if (matches.length <= 1) return matches;
    const start = Number.parseInt(matches[0], 10);
    const end = Number.parseInt(matches[matches.length - 1], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return matches;
    const range = [];
    for (let value = start; value <= end; value += 1) range.push(String(value));
    return range;
  }

  function classifySubstitutionInfo(info) {
    if (/(?:Zameni[ťt]\s*u[čc]ebň?u|Change\s+the\s+classroom):/i.test(info)) return "room-change";
    if (/(?:Suplovanie|Substitution):/i.test(info)) return "substitution";
    return "changed";
  }

  function extractNewRoom(info) {
    const match = /(?:Zameni[ťt]\s*u[čc]ebňu|Change\s+the\s+classroom):?\s*[^➔→⇒]+[➔→⇒]\s*([^,;]+)/i
      .exec(String(info || ""));
    return match ? match[1].trim() : null;
  }

  // Suplovanie row info is "SUBJ - Učiteľ: ..., Zameniť učebňu: ...". The leading
  // token is the subject's short code, used to disambiguate multiple rows at the
  // same period (II.A's section can contain unrelated subject changes that also
  // happen at this period — matching by period alone would mis-classify ours).
  function rowSubjectCode(info) {
    const match = /^\s*([^\s\-–—]+)/.exec(String(info || ""));
    return match ? match[1].trim() : "";
  }

  function subjectMatches(rowSubject, itemSubject) {
    if (!rowSubject || !itemSubject) return false;
    return rowSubject.toUpperCase() === itemSubject.toUpperCase();
  }

  function getItemSubject(item) {
    return (item.querySelector(".predmet")?.textContent || "").trim();
  }

  function parseSubstitutionSections(root) {
    return Array.from(root.querySelectorAll("div.section.print-nobreak")).map((section) => ({
      heading: (section.querySelector("div.header")?.textContent || "").trim(),
      rows: Array.from(section.querySelectorAll("div.row.change, div.row.add")).map((row) => ({
        isAdd: row.classList.contains("add"),
        periods: periodNumbers(row.querySelector("div.period")?.textContent),
        info: (row.querySelector("div.info")?.textContent || "").trim(),
      })),
    }));
  }

  // EduPage's per-request security hash, set inline as `ASC.gsechash="…"` on
  // every authenticated page. Content scripts can't read the page's JS globals
  // directly, but the assignment is in the page HTML, so scrape it from there.
  function getGsecHash() {
    for (const script of document.querySelectorAll("script:not([src])")) {
      const match = /gsechash["'\s:=]+([A-Za-z0-9]{6,})/.exec(script.textContent);
      if (match) return match[1];
    }
    return null;
  }

  // The Suplovanie page is fully client-rendered, but its viewer.js POST returns
  // the same section HTML over a plain fetch() when given the gsechash (verified
  // live 2026-06-18). Returns parsed sections, or null on failure (no hash,
  // network error, or an expired hash — EduPage answers those with
  // `{ reload: true }`), which leaves the native appearance available for retry.
  async function fetchSubstitutionSectionsDirect(dateKey) {
    const gsh = getGsecHash();
    if (!gsh) return null;
    try {
      const response = await fetch(
        "/substitution/server/viewer.js?__func=getSubstViewerDayDataHtml",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            __args: [null, { date: dateKey, mode: "classes" }],
            __gsh: gsh,
          }),
        },
      );
      if (!response.ok) return null;
      const payload = await response.json();
      if (payload?.reload) return null; // stale gsechash → fall back
      const html = typeof payload?.r === "string" ? payload.r : "";
      if (!html) return null;
      const doc = new DOMParser().parseFromString(html, "text/html");
      return parseSubstitutionSections(doc);
    } catch {
      return null;
    }
  }

  function getSubstitutionSections(date) {
    return readWidgetCache(substitutionCache, date, fetchSubstitutionSectionsDirect);
  }

  // Picks the Suplovanie row for a given homepage item across all sections that
  // match the item's class label(s). A change type is trustworthy only when its
  // subject code matches the lesson. A different subject at the same period can
  // be an unrelated change in a shared class section.
  function findRowForItem(item, sections) {
    const period = periodDigits(item.querySelector(".hodina")?.textContent);
    const itemSubject = getItemSubject(item);
    const triedaList = getOriginalTrieda(item)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    let subjectMatchedRow = null;
    const periodMatchedRows = [];

    for (const heading of triedaList) {
      const section = sections.find((sec) => sec.heading === heading);
      if (!section) continue;
      for (const row of section.rows) {
        if (!row.periods.includes(period)) continue;
        if (subjectMatches(rowSubjectCode(row.info), itemSubject)) {
          subjectMatchedRow = row;
          break;
        }
        periodMatchedRows.push(row);
      }
      if (subjectMatchedRow) break;
    }

    return { subjectMatchedRow, periodMatchedRows };
  }

  function applyRowClassification(item, row) {
    const type = row.isAdd ? "moved" : classifySubstitutionInfo(row.info);
    item.setAttribute(ROZVRH_PROCESSED_ATTR, type);
    item.classList.add(ROZVRH_CLASS_BY_TYPE[type]);
    item.title = row.info;
    if (type !== "room-change") return;

    const newRoom = extractNewRoom(row.info);
    if (!newRoom) return;
    item.dataset.eeNewRoom = newRoom;
    // Room display may have already run — update it immediately.
    if (item.hasAttribute(ROOM_PROCESSED_ATTR)) {
      const span = item.querySelector(".trieda");
      if (span) span.textContent = newRoom;
    }
  }

  function applyRozvrhClassification(item, sections) {
    if (item.hasAttribute(ROZVRH_PROCESSED_ATTR)) return;
    if (!originalTitles.has(item)) originalTitles.set(item, item.getAttribute("title") ?? null);

    const { subjectMatchedRow, periodMatchedRows } = findRowForItem(item, sections);

    if (subjectMatchedRow) {
      applyRowClassification(item, subjectMatchedRow);
      return;
    }

    if (periodMatchedRows.length === 1) {
      // Homepage labels can differ from the subject code in Suplovanie. A lone
      // changed row for this class and period still identifies the lesson.
      applyRowClassification(item, periodMatchedRows[0]);
      return;
    }

    if (periodMatchedRows.length > 1) {
      // Several rows for the same period do not identify this lesson's change
      // type. Keep EduPage's native changed appearance rather than guessing.
      item.setAttribute(ROZVRH_PROCESSED_ATTR, "none");
      return;
    }

    // No matching row at all. EduPage's generic changed state is more honest
    // than assigning a room-change or substitution color without evidence.
    item.setAttribute(ROZVRH_PROCESSED_ATTR, "none");
  }

  async function enhanceRozvrhWidget() {
    if (!highlightsEnabled) return;
    if (!document.querySelectorAll("ul.rozvrh > li.rozvrhItem.hasChange").length) return;
    const date = getWidgetDateKey();
    const stamp = highlightGeneration;
    const sections = await getSubstitutionSections(date);
    if (!highlightsEnabled || stamp !== highlightGeneration || date !== getWidgetDateKey()) return;
    const items = Array.from(document.querySelectorAll("ul.rozvrh > li.rozvrhItem.hasChange"));
    if (sections === null) { items.forEach(item => clearItemClassification(item)); return; }
    applyCurrentClassifications(items, sections);
  }

  function clearItemClassification(item, preserveRoom = false) {
    Object.values(ROZVRH_CLASS_BY_TYPE).forEach((cls) => item.classList.remove(cls));
    item.removeAttribute(ROZVRH_PROCESSED_ATTR);
    classificationVersions.delete(item);
    if (originalTitles.has(item)) {
      const title = originalTitles.get(item);
      if (title === null) item.removeAttribute("title"); else item.title = title;
    }
    if (preserveRoom) return;
    delete item.dataset.eeNewRoom;
    const map = freshWidgetValue(roomCache);
    if (item.hasAttribute(ROOM_PROCESSED_ATTR)) {
      const span = item.querySelector(".trieda");
      if (span) span.textContent = map ? map.get(periodDigits(item.querySelector(".hodina")?.textContent)) || "—" : getOriginalTrieda(item);
      if (!map) { item.removeAttribute(ROOM_PROCESSED_ATTR); roomVersions.delete(item); }
    }
  }

  function applyCurrentClassifications(items, sections) {
    for (const item of items) {
      if (classificationVersions.get(item) === sections) continue;
      clearItemClassification(item);
      applyRozvrhClassification(item, sections);
      classificationVersions.set(item, sections);
    }
  }

  // ── Room display ────────────────────────────────────────────────────────────
  //
  // Replaces the (mostly redundant — it's almost always the student's own
  // class) .trieda text with the actual room for that period. Unlike
  // Suplovanie, the "ttday" page embeds its data directly in the initial
  // server-rendered HTML (a `classbook.fill(user, data)` call), so a plain
  // fetch() works — no hidden tab needed. Per period:
  //   plan[i].flags.dp0.classroomids -> array of classroom ids
  //   dbi.classrooms[id].short       -> human-readable room code, e.g. "012"

  const ROOM_PROCESSED_ATTR = "data-ee-rozvrh-room-done";

  function extractBalanced(text, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < text.length; i += 1) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")") {
        depth -= 1;
        if (depth === 0) return text.slice(openIndex, i + 1);
      }
    }
    return null;
  }

  function splitTopLevelArguments(text) {
    const args = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
      else if (ch === "," && depth === 0) {
        args.push(text.slice(start, i));
        start = i + 1;
      }
    }
    args.push(text.slice(start));
    return args.map((arg) => arg.trim());
  }

  function dateKey(d) {
    return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function todayDateKey() { return dateKey(new Date()); }

  // Scan the DOM near ul.rozvrh to find out which date the widget is actually
  // showing. EduPage sometimes shows tomorrow's timetable ("Rozvrh zajtra …")
  // instead of today's, and using today's ttday plan would give wrong rooms.
  function getWidgetDateKey() {
    const rozvrh = document.querySelector("ul.rozvrh");
    if (!rozvrh) return todayDateKey();

    // Walk up ancestors, checking sibling elements for a heading that contains
    // the widget date (Slovak/Czech "zajtra"/"zítra" → tomorrow, or an explicit
    // "D.M." / "DD.MM." date string). Skip the rozvrh branch itself and large
    // text blocks that are clearly lesson content.
    let el = rozvrh.parentElement;
    for (let depth = 0; depth < 8 && el && el !== document.body; depth++, el = el.parentElement) {
      for (const child of el.children) {
        if (child === rozvrh || child.contains(rozvrh) || child.classList.contains("ee-comparison")) continue;
        const text = child.textContent || "";
        if (text.length > 300) continue;
        const lower = text.toLowerCase();

        if (lower.includes("zajtra") || lower.includes("zítra") || lower.includes("zitra") || lower.includes("tomorrow")) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return dateKey(tomorrow);
        }

        const m = /\b(\d{1,2})[./]\s*(\d{1,2})(?:\.|\b)/.exec(text);
        if (m) {
          const day = Number(m[1]);
          const month = Number(m[2]);
          if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            const now = new Date();
            const candidates = [-1, 0, 1].map((offset) => new Date(now.getFullYear() + offset, month - 1, day))
              .filter((date) => date.getMonth() === month - 1 && date.getDate() === day)
              .sort((left, right) => Math.abs(left - now) - Math.abs(right - now));
            if (candidates[0]) return dateKey(candidates[0]);
          }
        }
      }
    }
    return todayDateKey();
  }

  window.__eeTimetableWidgetDate = getWidgetDateKey;

  async function fetchRoomMap(widgetDateKey) {
    try {
      const response = await fetch("/dashboard/eb.php?mode=ttday", { credentials: "include" });
      if (!response.ok) return null;
      const html = await response.text();

      const marker = "classbook.fill";
      const markerIndex = html.indexOf(marker);
      if (markerIndex === -1) return null;
      const openParenIndex = html.indexOf("(", markerIndex + marker.length);
      const balanced = openParenIndex === -1 ? null : extractBalanced(html, openParenIndex);
      if (!balanced) return null;
      const args = splitTopLevelArguments(balanced.slice(1, -1));
      const classbookData = JSON.parse(args[1]);

      const plan = classbookData?.dates?.[widgetDateKey]?.plan;
      if (!Array.isArray(plan)) return null;

      const map = new Map();
      plan.forEach((entry) => {
        if (entry?.type !== "lesson") return;
        const period = String(entry.uniperiod || "").trim();
        if (!/^\d+$/.test(period)) return; // skip combined slots like "14-15"

        const roomIds = entry.flags?.dp0?.classroomids;
        if (!Array.isArray(roomIds) || roomIds.length === 0) return;
        const roomNames = roomIds
          .map((id) => classbookData.dbi?.classrooms?.[id]?.short || classbookData.dbi?.classrooms?.[id]?.name)
          .filter(Boolean);
        if (roomNames.length > 0) map.set(period, roomNames.join(", "));
      });
      return map;
    } catch {
      return null;
    }
  }

  function getRoomMap(date) {
    return readWidgetCache(roomCache, date, fetchRoomMap);
  }

  function applyRoomNames(items, roomMap) {
    items.forEach((item) => {
      if (item.hasAttribute(ROOM_PROCESSED_ATTR) && roomVersions.get(item) === roomMap) return;
      item.setAttribute(ROOM_PROCESSED_ATTR, "1");

      const triedaSpan = item.querySelector(".trieda");
      if (!triedaSpan) return;
      getOriginalTrieda(item); // capture the class label before we overwrite it

      const period = periodDigits(item.querySelector(".hodina")?.textContent);
      // For room-change lessons, applyRozvrhClassification stores the new
      // room; prefer that over the ttday original so we show where the
      // student actually needs to go, not where they were originally assigned.
      const room = item.dataset.eeNewRoom || roomMap.get(period);
      triedaSpan.textContent = room || "—";
      roomVersions.set(item, roomMap);
    });
  }

  async function enhanceRozvrhRooms() {
    if (!document.querySelectorAll("ul.rozvrh > li.rozvrhItem").length) return;
    const date = getWidgetDateKey();
    if (freshWidgetValue(substitutionCache, date) === null) {
      document.querySelectorAll("ul.rozvrh > li.rozvrhItem").forEach(item => clearItemClassification(item));
    }
    const roomMap = await getRoomMap(date);
    if (date !== getWidgetDateKey()) return;
    const items = Array.from(document.querySelectorAll("ul.rozvrh > li.rozvrhItem"));
    if (roomMap !== null) applyRoomNames(items, roomMap);
    else for (const item of items) {
      if (!item.hasAttribute(ROOM_PROCESSED_ATTR)) continue;
      const span = item.querySelector(".trieda");
      if (span) span.textContent = getOriginalTrieda(item);
      item.removeAttribute(ROOM_PROCESSED_ATTR);
      roomVersions.delete(item);
    }
  }

  function scheduleRozvrhEnhance() {
    window.clearTimeout(rozvrhScheduleTimer);
    rozvrhScheduleTimer = window.setTimeout(() => {
      enhanceRozvrhWidget().catch(() => {});
      enhanceRozvrhRooms().catch(() => {});
    }, 200);
  }

  // Re-apply outlines and room names the moment Edupage swaps in new rozvrhItems,
  // before the 200ms scheduler runs. Without this the cached data is there but
  // the items briefly render bare every ~10s (Edupage's widget refresh cadence).
  function applyCachedRozvrhData() {
    const items = Array.from(document.querySelectorAll("ul.rozvrh > li.rozvrhItem"));
    if (items.length === 0) return;

    const roomMap = freshWidgetValue(roomCache);
    if (roomMap) applyRoomNames(items, roomMap);
    const sections = freshWidgetValue(substitutionCache);
    if (highlightsEnabled && sections) applyCurrentClassifications(items.filter((item) => item.classList.contains("hasChange")), sections);
  }

  function clearRozvrhHighlights() {
    document.querySelectorAll("ul.rozvrh > li.rozvrhItem").forEach(item => clearItemClassification(item, true));
  }

  function initRozvrhObserver() {
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof Element)) return false;
          return node.matches?.("ul.rozvrh, li.rozvrhItem") || Boolean(node.querySelector?.("li.rozvrhItem"));
        }),
      );
      if (relevant) {
        // Apply cached data immediately so the new items render with outlines
        // and rooms in the same frame Edupage swaps them in — no ~10s flash.
        applyCachedRozvrhData();
        scheduleRozvrhEnhance();
      }
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
      highlightGeneration++;
      if (!highlightsEnabled) clearRozvrhHighlights();
      if (highlightsEnabled) enhanceRozvrhWidget().catch(() => {});
      enhanceRozvrhRooms().catch(() => {});
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[HIGHLIGHTS_KEY]) return;
      highlightsEnabled = changes[HIGHLIGHTS_KEY].newValue !== false;
      highlightGeneration++;
      if (highlightsEnabled) {
        enhanceRozvrhWidget().catch(() => {});
      } else {
        clearRozvrhHighlights();
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    injectStyles();
    initStorage();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        enhanceRozvrhWidget().catch(() => {});
        enhanceRozvrhRooms().catch(() => {});
        initRozvrhObserver();
      }, { once: true });
    } else {
      enhanceRozvrhWidget().catch(() => {});
      enhanceRozvrhRooms().catch(() => {});
      initRozvrhObserver();
    }
  }

  // Deliberate test hook — see tests/timetable-enhancer.test.js.
  if (globalThis.__EE_TEST__) {
    globalThis.__eeTestExports = { applyRozvrhClassification, findRowForItem, enhanceRozvrhWidget, enhanceRozvrhRooms, applyCachedRozvrhData };
  }

  init();
})();
