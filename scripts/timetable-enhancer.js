/**
 * timetable-enhancer.js
 *
 * Two independent enhancements to the homepage "Rozvrh dnes" widget
 * (ul.rozvrh > li.rozvrhItem):
 *
 * 1. Colors each changed period by its real type — teacher substitution,
 *    room change, or a lesson moved in from another day/period — instead of
 *    EduPage's generic "hasChange" flag, which carries no type information.
 *    The real type lives on a separate page ("Suplovanie", mode=substitution)
 *    that is fully client-rendered (a plain fetch() only returns the
 *    unrendered app shell), so a hidden background tab is used to read it.
 *    That tab is only opened when the homepage actually has at least one
 *    changed period, and the result is cached for the rest of the day — see
 *    background.js's "ee-substitution-snapshot" handler.
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

  let highlightsEnabled = true;

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

         Uses outline, not background-color/box-shadow: content.js's own
         dark-mode CSS already paints an !important opaque background on
         .rozvrhItemAlign and its child spans (the gold "today" period header,
         etc.) at equal selector specificity, which hid most of a background
         fill — only whatever gap was left between those children showed
         through. outline renders entirely outside the border box, so it
         can never be covered by a child's background regardless of theme. */
      li.rozvrhItem.ee-rozvrh-substitution,
      li.rozvrhItem.ee-rozvrh-changed {
        outline: 3px solid var(--ee-rozvrh-substitution-color, #e65100) !important;
        outline-offset: 0 !important;
      }

      li.rozvrhItem.ee-rozvrh-room-change {
        outline: 3px solid var(--ee-rozvrh-room-change-color, #1565c0) !important;
        outline-offset: 0 !important;
      }

      li.rozvrhItem.ee-rozvrh-moved {
        outline: 3px solid #8e24aa !important;
        outline-offset: 0 !important;
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

  let substitutionSectionsPromise = null;
  let substitutionSectionsResolved = null; // the already-resolved sections — applied synchronously on re-renders
  let substitutionNeedsRefresh = false;
  let substitutionLastFetchedAt = 0;
  const SUBSTITUTION_REFRESH_COOLDOWN_MS = 30 * 60 * 1000;
  let rozvrhScheduleTimer = null;

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
    if (/Suplovanie:/i.test(info)) return "substitution";
    if (/Zameni[ťt]\s*u[čc]ebň?u:/i.test(info)) return "room-change";
    return "changed";
  }

  // "... Zameniť učebňu: OLD ➔ NEW ..." — returns the new room code/name.
  function extractNewRoom(info) {
    const match = /Zameni[ťt]\s*u[čc]ebňu:?\s*[^➔→⇒→➔]+[➔→⇒→➔]\s*([^\s,;(]+)/i
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

  // The Suplovanie page is fully client-rendered — a plain fetch() returns
  // only the unrendered app shell. Background opens a hidden tab to read it
  // (cached for the rest of the day; see the extraction listener below for
  // the side that runs inside that hidden tab).
  // forceRefresh bypasses background's day-cache and re-opens the hidden tab,
  // used when the widget re-renders mid-day (e.g. a substitution was cancelled).
  function fetchSubstitutionSections(forceRefresh = false) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: "ee-substitution-snapshot",
        origin: window.location.origin,
        forceRefresh,
      }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          resolve([]);
          return;
        }
        resolve(Array.isArray(response.data?.sections) ? response.data.sections : []);
      });
    });
  }

  function extractSubstitutionSections() {
    return Array.from(document.querySelectorAll("div.section.print-nobreak")).map((section) => ({
      heading: (section.querySelector("div.header")?.textContent || "").trim(),
      rows: Array.from(section.querySelectorAll("div.row.change, div.row.add")).map((row) => ({
        isAdd: row.classList.contains("add"),
        periods: periodNumbers(row.querySelector("div.period")?.textContent),
        info: (row.querySelector("div.info")?.textContent || "").trim(),
      })),
    }));
  }

  function delay(ms) {
    return new Promise((resolve) => { window.setTimeout(resolve, ms); });
  }

  // Polls for the rendered section markup. A genuine no-substitutions-anywhere
  // day will never produce any — once the document is otherwise idle, give up
  // rather than spinning for the full timeout.
  async function waitForSubstitutionPageReady(timeoutMs = 8000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (document.querySelector("div.section.print-nobreak")) return true;
      if (document.readyState === "complete" && Date.now() - startedAt > 2500) return false;
      await delay(200);
    }
    return false;
  }

  // This listener only ever matters inside the hidden tab background.js
  // opens for mode=substitution — chrome.tabs.sendMessage is tab-scoped, so
  // this content-script instance running on any other page simply never
  // receives the message.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "ee-extract-substitution-snapshot") return false;

    (async () => {
      const ready = await waitForSubstitutionPageReady();
      sendResponse({
        ok: true,
        data: { sections: ready ? extractSubstitutionSections() : [] },
      });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "Could not extract Suplovanie data.",
      });
    });

    return true;
  });

  function getSubstitutionSections() {
    if (!substitutionSectionsPromise) {
      const forceRefresh = substitutionNeedsRefresh;
      substitutionNeedsRefresh = false;
      substitutionLastFetchedAt = Date.now();
      substitutionSectionsPromise = fetchSubstitutionSections(forceRefresh).then((sections) => {
        substitutionSectionsResolved = sections;
        return sections;
      });
    }
    return substitutionSectionsPromise;
  }

  // Picks the Suplovanie row for a given homepage item across all sections that
  // match the item's class label(s). Among rows at this period, a subject-code
  // match wins outright; otherwise we fall back to "changed" rather than guessing
  // a type — that avoids mis-classifying when II.A's section has an unrelated
  // change at the same period as the user's own lesson.
  function findRowForItem(item, sections) {
    const period = periodDigits(item.querySelector(".hodina")?.textContent);
    const itemSubject = getItemSubject(item);
    const triedaList = getOriginalTrieda(item)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    let subjectMatchedRow = null;
    let periodMatchedRow = null;

    for (const heading of triedaList) {
      const section = sections.find((sec) => sec.heading === heading);
      if (!section) continue;
      for (const row of section.rows) {
        if (!row.periods.includes(period)) continue;
        if (subjectMatches(rowSubjectCode(row.info), itemSubject)) {
          subjectMatchedRow = row;
          break;
        }
        if (!periodMatchedRow) periodMatchedRow = row;
      }
      if (subjectMatchedRow) break;
    }

    return { subjectMatchedRow, periodMatchedRow };
  }

  function applyRozvrhClassification(item, sections) {
    if (item.hasAttribute(ROZVRH_PROCESSED_ATTR)) return;

    const { subjectMatchedRow, periodMatchedRow } = findRowForItem(item, sections);

    if (subjectMatchedRow) {
      const type = subjectMatchedRow.isAdd ? "moved" : classifySubstitutionInfo(subjectMatchedRow.info);
      item.setAttribute(ROZVRH_PROCESSED_ATTR, type);
      item.classList.add(ROZVRH_CLASS_BY_TYPE[type]);
      item.title = subjectMatchedRow.info;
      if (type === "room-change") {
        const newRoom = extractNewRoom(subjectMatchedRow.info);
        if (newRoom) {
          item.dataset.eeNewRoom = newRoom;
          // Room display may have already run — update it immediately.
          if (item.hasAttribute(ROOM_PROCESSED_ATTR)) {
            const span = item.querySelector(".trieda");
            if (span) span.textContent = newRoom;
          }
        }
      }
      return;
    }

    if (periodMatchedRow && getItemSubject(item)) {
      // Suplovanie has a row at this period but for a different subject in this
      // class section — Edupage's .hasChange flag is firing on a lesson that
      // isn't actually changed (a stale flag, or a shared-elective sibling).
      // Don't outline it. Mark as processed so the observer doesn't keep retrying.
      item.setAttribute(ROZVRH_PROCESSED_ATTR, "none");
      return;
    }

    // No matching row at all — Edupage flagged it but Suplovanie has nothing for
    // this class. Surface as generic "changed" so the user still sees something.
    item.setAttribute(ROZVRH_PROCESSED_ATTR, "changed");
    item.classList.add(ROZVRH_CLASS_BY_TYPE.changed);
  }

  async function enhanceRozvrhWidget() {
    const items = Array.from(document.querySelectorAll("ul.rozvrh > li.rozvrhItem.hasChange"))
      .filter((item) => !item.hasAttribute(ROZVRH_PROCESSED_ATTR));
    if (items.length === 0) return;

    // If sections are already resolved, classify synchronously — no flash on
    // Edupage's ~10s widget re-renders.
    if (substitutionSectionsResolved) {
      items.forEach((item) => applyRozvrhClassification(item, substitutionSectionsResolved));
      return;
    }

    const sections = await getSubstitutionSections();
    items
      .filter((item) => !item.hasAttribute(ROZVRH_PROCESSED_ATTR))
      .forEach((item) => applyRozvrhClassification(item, sections));
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

  let roomMapPromise = null;
  let roomMapResolved = null; // the already-resolved Map — applied synchronously on re-renders

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
        if (child === rozvrh || child.contains(rozvrh)) continue;
        const text = child.textContent || "";
        if (text.length > 300) continue; // skip big content blocks
        const lower = text.toLowerCase();

        // "zajtra" (SK) / "zítra" / "zitra" (CS) → tomorrow
        if (lower.includes("zajtra") || lower.includes("zítra") || lower.includes("zitra")) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return dateKey(tomorrow);
        }

        // Explicit "D.M." or "DD.MM." date  (e.g. "18.06.")
        const m = /\b(\d{1,2})\.(\d{1,2})\./.exec(text);
        if (m) {
          const day = Number(m[1]);
          const month = Number(m[2]);
          if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            const now = new Date();
            let year = now.getFullYear();
            // School year runs Sep–Jun; if the widget month is much earlier
            // than the current month we've crossed a calendar-year boundary.
            if (month < now.getMonth() - 5) year++;
            const d = new Date(year, month - 1, day);
            return dateKey(d);
          }
        }
      }
    }
    return todayDateKey();
  }

  async function fetchRoomMap() {
    try {
      const response = await fetch("/dashboard/eb.php?mode=ttday", { credentials: "include" });
      if (!response.ok) return new Map();
      const html = await response.text();

      const marker = "classbook.fill";
      const markerIndex = html.indexOf(marker);
      if (markerIndex === -1) return new Map();
      const openParenIndex = html.indexOf("(", markerIndex + marker.length);
      const balanced = openParenIndex === -1 ? null : extractBalanced(html, openParenIndex);
      if (!balanced) return new Map();
      const args = splitTopLevelArguments(balanced.slice(1, -1));
      const classbookData = JSON.parse(args[1]);

      const widgetDateKey = getWidgetDateKey();
      const plan = classbookData?.dates?.[widgetDateKey]?.plan;
      if (!Array.isArray(plan)) return new Map();

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
      roomMapResolved = map;
      return map;
    } catch {
      return new Map();
    }
  }

  function getRoomMap() {
    if (!roomMapPromise) roomMapPromise = fetchRoomMap();
    return roomMapPromise;
  }

  function applyRoomNames(items, roomMap) {
    items.forEach((item) => {
      if (item.hasAttribute(ROOM_PROCESSED_ATTR)) return;
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
    });
  }

  async function enhanceRozvrhRooms() {
    const items = Array.from(document.querySelectorAll("ul.rozvrh > li.rozvrhItem"))
      .filter((item) => !item.hasAttribute(ROOM_PROCESSED_ATTR));
    if (items.length === 0) return;

    // If the room map is already resolved, apply it synchronously — no await,
    // no flash between re-renders.
    if (roomMapResolved) {
      applyRoomNames(items, roomMapResolved);
      return;
    }

    const roomMap = await getRoomMap();
    applyRoomNames(
      items.filter((item) => !item.hasAttribute(ROOM_PROCESSED_ATTR)), // re-filter after await
      roomMap,
    );
  }

  function scheduleRozvrhEnhance() {
    window.clearTimeout(rozvrhScheduleTimer);
    rozvrhScheduleTimer = window.setTimeout(() => {
      enhanceRozvrhWidget();
      enhanceRozvrhRooms();
    }, 200);
  }

  // Re-apply outlines and room names the moment Edupage swaps in new rozvrhItems,
  // before the 200ms scheduler runs. Without this the cached data is there but
  // the items briefly render bare every ~10s (Edupage's widget refresh cadence).
  function applyCachedRozvrhData() {
    const items = Array.from(document.querySelectorAll("ul.rozvrh > li.rozvrhItem"));
    if (items.length === 0) return;

    if (roomMapResolved) {
      applyRoomNames(
        items.filter((item) => !item.hasAttribute(ROOM_PROCESSED_ATTR)),
        roomMapResolved,
      );
    }

    if (highlightsEnabled && substitutionSectionsResolved) {
      items
        .filter((item) => item.classList.contains("hasChange") && !item.hasAttribute(ROZVRH_PROCESSED_ATTR))
        .forEach((item) => applyRozvrhClassification(item, substitutionSectionsResolved));
    }
  }

  function clearRozvrhHighlights() {
    document.querySelectorAll("ul.rozvrh > li.rozvrhItem").forEach((item) => {
      Object.values(ROZVRH_CLASS_BY_TYPE).forEach((cls) => item.classList.remove(cls));
      item.removeAttribute(ROZVRH_PROCESSED_ATTR);
      item.removeAttribute("title");
    });
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
        // Only bypass background's day-cache if enough time has passed — avoids
        // opening a new hidden tab on every frequent widget re-render.
        if (Date.now() - substitutionLastFetchedAt > SUBSTITUTION_REFRESH_COOLDOWN_MS) {
          substitutionNeedsRefresh = true;
          substitutionSectionsPromise = null;
          // substitutionSectionsResolved intentionally retained — it keeps
          // serving the old outlines until the next fetch resolves.
        }
        // roomMapPromise intentionally not reset — rooms don't change intraday,
        // and roomMapResolved lets re-renders apply names synchronously (no flash).
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
      if (highlightsEnabled) enhanceRozvrhWidget();
      enhanceRozvrhRooms(); // independent of the highlights toggle — a display preference, not a highlight
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[HIGHLIGHTS_KEY]) return;
      highlightsEnabled = changes[HIGHLIGHTS_KEY].newValue !== false;
      if (highlightsEnabled) {
        enhanceRozvrhWidget();
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
        enhanceRozvrhWidget();
        enhanceRozvrhRooms();
        initRozvrhObserver();
      }, { once: true });
    } else {
      enhanceRozvrhWidget();
      enhanceRozvrhRooms();
      initRozvrhObserver();
    }
  }

  init();
})();
