(function () {
  "use strict";
  if (window.top !== window || window.__eeComparisonInit || new URLSearchParams(location.search).has("eeComparison")) return;
  const C = globalThis.EEComparison;
  const U = globalThis.EEComparisonUI;
  const isWeekly = () => location.pathname === "/dashboard/eb.php" && C.pageMode(location.search) === "timetable";
  const supportedRoute = () => /^\/user\/?$/.test(location.pathname) || isWeekly();
  if (!supportedRoute()) return;
  window.__eeComparisonInit = true;
  let profile = null;
  let enabled = false;
  let root = null;
  let nativeRoot = null;
  let observer = null;
  let discovery = null;
  let discoveryTimer = null;
  let timer = null;
  let boundaryTimer = null;
  let generation = 0;
  let signature = "";

  function cleanup() {
    generation++;
    clearTimeout(timer);
    clearTimeout(boundaryTimer);
    observer?.disconnect();
    observer = null;
    root?.remove();
    root = null;
    nativeRoot = null;
    signature = "";
  }

  function readDisplayed() {
    const reader = window.__eeComparisonReader;
    if (isWeekly()) {
      const parsed = reader?.parseWeeklyTimetable();
      return { dates: parsed?.dayHeaders.map(day => day.date) || [], lessons: parsed?.lessons || [] };
    }
    const date = window.__eeTimetableWidgetDate?.() || C.dateKey();
    const items = Array.from(nativeRoot.querySelectorAll(".rozvrhItem"));
    const ranges = items.map(item => ({ ...reader?.parseTimetableTimeRange(item.querySelector(".casy")?.textContent || ""),
      date, title: item.querySelector(".predmet")?.textContent.trim() || "", room: item.querySelector(".trieda")?.textContent.trim() || "" }));
    if (!ranges.length || ranges.some(lesson => !lesson.startTime || !lesson.endTime || !lesson.title)) return { dates: [], lessons: [], date };
    try { return { dates: [date], lessons: reader.normalizeTimetablePeriods(ranges).map(lesson => C.normalizeLesson(lesson)), date }; }
    catch (_) { return { dates: [], lessons: [], date }; }
  }

  function scheduleBoundary(lessons, date) {
    clearTimeout(boundaryTimer);
    if (date !== C.dateKey()) return;
    const now = Date.now();
    const boundaries = lessons.flatMap(lesson => [lesson.startTime, lesson.endTime])
      .map(time => new Date(`${date}T${time}:00`).getTime()).filter(time => time > now);
    const midnight = new Date(`${C.addDays(date, 1)}T00:00:00`).getTime();
    boundaryTimer = setTimeout(() => { signature = ""; refresh(); }, Math.min(midnight, ...boundaries) - now + 100);
  }

  async function refresh(force = false) {
    if (!root?.isConnected || !enabled || !profile) return;
    const own = readDisplayed();
    const date = isWeekly() ? own.dates[0] : own.date;
    const nextSignature = JSON.stringify([date, own, profile]);
    if (!force && signature === nextSignature) return;
    signature = nextSignature;
    const stamp = ++generation;
    if (!date) { root.replaceChildren(U.el("span", U.t("eeCompareLiveUnavailable"))); return; }
    const dates = isWeekly() ? own.dates : [date];
    root.replaceChildren(U.el("span", `${profile.name} · ${U.t("eeCompareLoading")}`));
    let other = { lessons: [], dates: [] };
    let failed = false;
    try {
      if (profile.source === "import") other = { lessons: C.expand(profile, C.monday(date)), dates: Array.from({ length: 7 }, (_, i) => C.addDays(C.monday(date), i)) };
      else if (profile.origin !== location.origin) throw new Error("eeCompareSchoolMismatch");
      else other = (await U.message({ type: "ee-comparison-week", weekStart: C.monday(date), ownerId: profile.ownerId, force })).data;
    } catch (_) { failed = true; }
    if (stamp !== generation || !root?.isConnected) return;
    const lessons = C.included(other.lessons, profile.excludedGroups);
    const notice = U.t(failed ? "eeCompareLiveUnavailable" : profile.source === "import"
      ? profile.cycleWeeks === 2 ? "eeCompareTemplateFortnight" : "eeCompareTemplateWeekly" : "eeCompareLiveNotice");
    U.renderCompact(root, { dates, own: own.lessons, other: lessons, name: profile.name,
      ownDates: own.dates, otherDates: other.dates, daily: !isWeekly(), allowGaps: !failed, notice, onRefresh: profile.source === "class" ? () => refresh(true) : undefined });
    root.title = notice;
    scheduleBoundary(lessons.filter(lesson => lesson.date === date), date);
  }

  function findTarget() {
    return isWeekly() ? window.__eeComparisonReader?.findTimetableRoot() : document.querySelector("ul.rozvrh");
  }

  function placeRoot() {
    const anchor = isWeekly() ? document.querySelector("#fitheight")?.firstElementChild
      : nativeRoot.closest(".userRozvrh") || nativeRoot;
    if (anchor && root.previousElementSibling !== anchor) anchor.after(root);
  }

  function build(target) {
    cleanup();
    nativeRoot = target;
    root = U.el("section", undefined, "ee-comparison ee-comparison-native");
    root.id = "ee-comparison-view";
    root.setAttribute("aria-label", U.t("eeCompareTitle"));
    // EduPage replaces .userRozvrh's contents on its periodic refresh. Keep
    // our row outside that region and retain it when the same lessons return.
    placeRoot();
    const widget = target.closest(".userRozvrh") || target;
    const host = isWeekly() ? document.querySelector("#fitheight").parentElement
      : widget.parentElement.parentElement || widget.parentElement;
    observer = new MutationObserver(records => {
      if (records.every(record => root?.contains(record.target))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!supportedRoute()) { cleanup(); return; }
        const next = findTarget();
        if (!next) {
          root.hidden = true;
          signature = "";
          generation++;
          clearTimeout(boundaryTimer);
          return;
        }
        nativeRoot = next;
        root.hidden = false;
        placeRoot();
        refresh();
      }, 150);
    });
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    refresh();
  }

  function discover() {
    if (!supportedRoute() || !enabled || !profile) { cleanup(); return false; }
    const target = findTarget();
    if (!target || (isWeekly() && !document.querySelector("#fitheight")?.firstElementChild)) return false;
    if (!root) build(target);
    else { nativeRoot = target; root.hidden = false; placeRoot(); refresh(); }
    return true;
  }

  function startDiscovery() {
    discovery?.disconnect();
    clearTimeout(discoveryTimer);
    if (!supportedRoute() || !enabled || !profile || discover()) return;
    discovery = new MutationObserver(() => {
      if (discover()) { discovery.disconnect(); clearTimeout(discoveryTimer); }
    });
    discovery.observe(document.body, { childList: true, subtree: true });
    discoveryTimer = setTimeout(() => discovery?.disconnect(), 30000);
  }

  async function start() {
    try {
      const settings = await U.storage("get", [C.KEY, C.ENABLED_KEY]);
      profile = settings[C.KEY] ? C.normalizeProfile(settings[C.KEY]) : null;
      enabled = settings[C.ENABLED_KEY] === true;
    } catch (_) { profile = null; enabled = false; }
    startDiscovery();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || (!changes[C.KEY] && !changes[C.ENABLED_KEY])) return;
      if (changes[C.KEY]) {
        try { profile = changes[C.KEY].newValue ? C.normalizeProfile(changes[C.KEY].newValue) : null; }
        catch (_) { profile = null; }
      }
      if (changes[C.ENABLED_KEY]) enabled = changes[C.ENABLED_KEY].newValue === true;
      cleanup();
      startDiscovery();
    });
    window.addEventListener("pageshow", startDiscovery);
    window.addEventListener("popstate", () => { cleanup(); startDiscovery(); });
    window.addEventListener("pagehide", () => {
      cleanup();
      discovery?.disconnect();
      clearTimeout(discoveryTimer);
    });
  }
  if (document.body) EE.withLanguageReady(start);
  else document.addEventListener("DOMContentLoaded", () => EE.withLanguageReady(start), { once: true });
})();
