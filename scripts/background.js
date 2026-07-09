// Firefox's notifications API doesn't support the "buttons" option (silently
// rejects the whole create() call) — used below to omit it there, since the
// onClicked listener already handles a click on the notification body itself.
const IS_FIREFOX = typeof navigator !== "undefined" && /\bFirefox\//.test(navigator.userAgent || "");

const UPDATE_ALARM_NAME = "ee-update-check";
const UPDATE_STATUS_KEY = "eeUpdateStatus";
const UPDATE_REMINDER_ENABLED_KEY = "eeUpdateReminderEnabled";
const UPDATE_LAST_NOTIFIED_KEY = "eeUpdateLastNotifiedVersion";
const ACTIVITY_SHIELD_ENABLED_KEY = "eeActivityShieldEnabled";
const DARK_MODE_ENABLED_KEY = "darkModeEnabled";
const TOGGLE_ACTIVITY_SHIELD_COMMAND = "toggle-stay-active-mode";
const TOGGLE_THEME_COMMAND = "toggle-theme-mode";
const REPO_URL = "https://github.com/Alexosavrua/Edupage-Extras";
const UPDATE_MANIFEST_URLS = [
  "https://raw.githubusercontent.com/Alexosavrua/Edupage-Extras/main/manifest.json",
  "https://raw.githubusercontent.com/Alexosavrua/Edupage-Extras/master/manifest.json",
];

// The school origin is learned passively (timetable-sync.js reports it on every
// EduPage page load) so the .ics export knows which school subdomain to read
// the timetable from, without needing the user to type a URL.
const LAST_EDUPAGE_ORIGIN_KEY = "eeGoogleCalendarLastEdupageOrigin";
const TIMETABLE_SYNC_CACHE_KEY = "eeTimetableSyncCache";
const TIMETABLE_SYNC_CACHE_VERSION = 1;
const EE_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Bratislava";
const TIMETABLE_LIVE_CACHE_TTL_MS = 10 * 60 * 1000;

function compareVersions(left, right) {
  const leftParts = String(left || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

// ---- Diagnostics ("Report a Problem") --------------------------------------
//
// Keep a small ring buffer of errors that happen inside the service worker so a
// user on another school's EduPage can hand us the context we need to fix a
// problem we cannot reproduce locally. Nothing here is ever sent automatically;
// it is only assembled into a report when the user clicks "Generate report".

const DIAGNOSTICS_MAX_LOG = 60;
const diagnosticsErrorLog = [];

function recordBackgroundError(level, args) {
  try {
    const message = args
      .map((value) => {
        if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ""}`.trim();
        if (typeof value === "string") return value;
        try { return JSON.stringify(value); } catch (_) { return String(value); }
      })
      .join(" ")
      .slice(0, 2000);
    diagnosticsErrorLog.push({ level, time: new Date().toISOString(), message });
    if (diagnosticsErrorLog.length > DIAGNOSTICS_MAX_LOG) diagnosticsErrorLog.shift();
  } catch (_) { /* diagnostics must never throw */ }
}

(function installBackgroundErrorCapture() {
  const originalError = console.error;
  console.error = function (...args) {
    recordBackgroundError("error", args);
    return originalError.apply(this, args);
  };
  if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
    self.addEventListener("error", (event) => {
      recordBackgroundError("uncaught", [event?.message || "Uncaught error", event?.error || ""]);
    });
    self.addEventListener("unhandledrejection", (event) => {
      recordBackgroundError("unhandledrejection", [event?.reason || "Unhandled rejection"]);
    });
  }
})();

// Storage keys whose values must never appear in a diagnostics report.
const DIAGNOSTICS_SECRET_PATTERN = /secret|token|client|oauth|password|credential/i;

async function buildSettingsSummary() {
  const all = await storageGet(null);
  const summary = {};
  for (const [key, value] of Object.entries(all || {})) {
    if (DIAGNOSTICS_SECRET_PATTERN.test(key)) continue;
    if (key === TIMETABLE_SYNC_CACHE_KEY) continue; // summarised separately
    if (value === null || value === undefined) continue;
    const type = typeof value;
    if (type === "boolean" || type === "number") {
      summary[key] = value;
    } else if (type === "string") {
      summary[key] = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    } else {
      summary[key] = `[${Array.isArray(value) ? "array" : type}]`;
    }
  }
  return summary;
}

async function buildTimetableSyncSummary() {
  const result = await storageGet([TIMETABLE_SYNC_CACHE_KEY]);
  const root = result?.[TIMETABLE_SYNC_CACHE_KEY];
  if (!root || typeof root !== "object") return { present: false };
  const byOrigin = root.byOrigin && typeof root.byOrigin === "object" ? root.byOrigin : {};
  const origins = Object.entries(byOrigin).map(([origin, bucket]) => ({
    origin,
    fetchedAt: bucket?.fetchedAt ? new Date(bucket.fetchedAt).toISOString() : null,
    targetWeekStart: bucket?.targetWeekStart || null,
    hasLiveWeek: Boolean(bucket?.liveWeek),
    hasAdjacentWeek: Boolean(bucket?.adjacentWeek),
    sampleWeekCount: Array.isArray(bucket?.sampleWeeks) ? bucket.sampleWeeks.length : 0,
  }));
  return { present: true, version: root.version, origins };
}

// requestId -> { frames: [...] }. Each frame in a tab reports its own snapshot
// here, so iframe-embedded EduPage views are captured, not just the top frame.
const pendingPageDiagnostics = new Map();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "ee-page-diagnostics-result" && message.requestId) {
    const entry = pendingPageDiagnostics.get(message.requestId);
    if (entry) {
      const data = message.data || null;
      entry.frames.push({
        frameId: sender?.frameId ?? null,
        isTop: Boolean(data?.frame?.isTop),
        frameUrl: data?.frame?.url || null,
        data,
      });
    }
  }
  // Fire-and-forget: never returns a response, leaves other listeners untouched.
});

function diagnosticsDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripUrlQuery(url) {
  try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch (_) { return url; }
}

function summarizePageDiagnostics(pages) {
  let frameCount = 0;
  let framesWithContent = 0;
  const pageTypes = new Set();
  let gradesScale = null;
  for (const page of pages) {
    for (const frame of page.frames || []) {
      frameCount += 1;
      const containerCount = frame.data?.containers?.length || 0;
      const sampledSubjects = frame.data?.gradesSample?.subjectCount || 0;
      if (containerCount > 0 || sampledSubjects > 0) framesWithContent += 1;
      for (const type of frame.data?.pageType || []) {
        if (type && type !== "unknown") pageTypes.add(type);
      }
      if (frame.data?.gradesSample?.scaleGuess) gradesScale = frame.data.gradesSample.scaleGuess;
    }
  }
  const empty = framesWithContent === 0;
  return {
    frameCount,
    framesWithContent,
    pageTypes: Array.from(pageTypes),
    gradesScale,
    empty,
    warning: empty
      ? "No recognizable EduPage feature content was captured. Open the page that is actually broken (grades, timetable, attendance) in a tab and generate the report again."
      : null,
  };
}

async function collectPageDiagnostics(redact) {
  let tabs = [];
  try {
    tabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: "https://*.edupage.org/*" }, (result) => resolve(result || []));
    });
  } catch (_) {
    tabs = [];
  }

  if (!tabs.length) {
    return { tabFound: false, pages: [], summary: summarizePageDiagnostics([]) };
  }

  // Prefer the active tab, then most recently accessed, and only query a few.
  tabs.sort((a, b) => (b.active === a.active ? (b.lastAccessed || 0) - (a.lastAccessed || 0) : (b.active ? 1 : -1)));
  const targets = tabs.slice(0, 3);

  const pages = [];
  for (const tab of targets) {
    const requestId = `ee-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingPageDiagnostics.set(requestId, { frames: [] });
    try {
      // No frameId -> broadcast to every frame in the tab.
      chrome.tabs.sendMessage(
        tab.id,
        { type: "ee-collect-page-diagnostics", redact, requestId },
        () => void chrome.runtime.lastError,
      );
    } catch (_) { /* tab has no content script; nothing will report */ }

    await diagnosticsDelay(900); // let every frame report back

    const entry = pendingPageDiagnostics.get(requestId);
    pendingPageDiagnostics.delete(requestId);
    const frames = entry?.frames || [];

    // Keep the top frame plus any frame that actually captured content, deduped.
    const keepIds = new Set();
    const kept = [];
    for (const frame of frames) {
      const useful = frame.isTop || (frame.data?.containers?.length || 0) > 0;
      const id = frame.frameId ?? `top-${frame.isTop}`;
      if (useful && !keepIds.has(id)) {
        keepIds.add(id);
        kept.push(frame);
      }
    }

    pages.push({
      tabUrl: redact ? stripUrlQuery(tab.url) : tab.url,
      active: Boolean(tab.active),
      frameCount: frames.length,
      frames: kept.length ? kept : frames,
    });
  }

  return { tabFound: true, pages, summary: summarizePageDiagnostics(pages) };
}

async function buildDiagnosticsReport(options = {}) {
  const redact = options.redact !== false;
  const manifest = chrome.runtime.getManifest();
  const updateResult = await storageGet([UPDATE_STATUS_KEY]);

  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    redacted: redact,
    extension: {
      name: manifest.name,
      version: manifest.version,
      uiLanguage: typeof chrome.i18n?.getUILanguage === "function" ? chrome.i18n.getUILanguage() : null,
    },
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      languages: navigator.languages,
      timeZone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return null; } })(),
    },
    settings: await buildSettingsSummary(),
    updateStatus: updateResult?.[UPDATE_STATUS_KEY] || null,
    timetableSync: await buildTimetableSyncSummary(),
    backgroundErrors: diagnosticsErrorLog.slice(),
    page: await collectPageDiagnostics(redact),
  };
}

function alarmClear(name) {
  return new Promise((resolve) => {
    chrome.alarms.clear(name, resolve);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeKeyText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDateOnly(value) {
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
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  return addDays(copy, shift);
}

function diffWeeks(left, right) {
  return Math.round((startOfWeek(left).getTime() - startOfWeek(right).getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function resolveSecondHalfStartDate(turnoverDate, overrideValue) {
  const nextTurnover = new Date(
    turnoverDate.getFullYear() + 1,
    turnoverDate.getMonth(),
    turnoverDate.getDate(),
  );
  const overrideDate = parseDateOnly(overrideValue);
  if (overrideDate && overrideDate >= turnoverDate && overrideDate < nextTurnover) {
    return overrideDate;
  }
  return new Date(turnoverDate.getFullYear() + 1, 1, 1);
}

function resolveSecondHalfEndDate(turnoverDate, secondHalfStart, overrideValue) {
  const nextTurnover = new Date(
    turnoverDate.getFullYear() + 1,
    turnoverDate.getMonth(),
    turnoverDate.getDate(),
  );
  const overrideDate = parseDateOnly(overrideValue);
  if (overrideDate && overrideDate >= secondHalfStart && overrideDate < nextTurnover) {
    return overrideDate;
  }
  return new Date(turnoverDate.getFullYear() + 1, 5, 30);
}

function computeCurrentHalfyearRange(anchorDate, {
  secondHalfStartOverride = "",
  secondHalfEndOverride = "",
} = {}) {
  const month = anchorDate.getMonth();
  const turnoverYear = month >= 8 ? anchorDate.getFullYear() : anchorDate.getFullYear() - 1;
  const turnoverDate = new Date(turnoverYear, 8, 1);
  const secondHalfStart = resolveSecondHalfStartDate(turnoverDate, secondHalfStartOverride);
  const secondHalfEnd = resolveSecondHalfEndDate(turnoverDate, secondHalfStart, secondHalfEndOverride);

  if (anchorDate < secondHalfStart) {
    return {
      start: turnoverDate,
      end: new Date(secondHalfStart.getFullYear(), secondHalfStart.getMonth(), secondHalfStart.getDate() - 1),
    };
  }

  return {
    start: secondHalfStart,
    end: secondHalfEnd,
  };
}

function computeEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function isSlovakPublicHoliday(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const fixedHolidays = new Set([
    "1-1",
    "1-6",
    "5-1",
    "5-8",
    "7-5",
    "8-29",
    "9-1",
    "9-15",
    "11-1",
    "11-17",
    "12-24",
    "12-25",
    "12-26",
  ]);
  if (fixedHolidays.has(`${month}-${day}`)) {
    return true;
  }

  const easterSunday = computeEasterSunday(date.getFullYear());
  const goodFriday = addDays(easterSunday, -2);
  const easterMonday = addDays(easterSunday, 1);
  const dateKey = formatDate(date);
  return dateKey === formatDate(goodFriday) || dateKey === formatDate(easterMonday);
}

function isCzechPublicHoliday(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const fixedHolidays = new Set([
    "1-1",
    "5-1",
    "5-8",
    "7-5",
    "7-6",
    "9-28",
    "10-28",
    "11-17",
    "12-24",
    "12-25",
    "12-26",
  ]);
  if (fixedHolidays.has(`${month}-${day}`)) {
    return true;
  }

  const easterSunday = computeEasterSunday(date.getFullYear());
  const goodFriday = addDays(easterSunday, -2);
  const easterMonday = addDays(easterSunday, 1);
  const dateKey = formatDate(date);
  return dateKey === formatDate(goodFriday) || dateKey === formatDate(easterMonday);
}

function shouldSkipGeneratedSchoolDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  if (EE_TIME_ZONE === "Europe/Bratislava") return isSlovakPublicHoliday(date);
  if (EE_TIME_ZONE === "Europe/Prague") return isCzechPublicHoliday(date);
  return false;
}

function formatOffset(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function toRfc3339(dateString, timeString) {
  const date = parseDateOnly(dateString);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(timeString || ""));
  if (!date || !timeMatch) return null;

  const local = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number.parseInt(timeMatch[1], 10),
    Number.parseInt(timeMatch[2], 10),
    0,
    0,
  );

  const year = String(local.getFullYear()).padStart(4, "0");
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  const hours = String(local.getHours()).padStart(2, "0");
  const minutes = String(local.getMinutes()).padStart(2, "0");
  const seconds = String(local.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${formatOffset(local)}`;
}

async function updateRemindersEnabled() {
  const result = await storageGet([UPDATE_REMINDER_ENABLED_KEY]);
  return result?.[UPDATE_REMINDER_ENABLED_KEY] !== false;
}

async function toggleActivityShieldEnabled() {
  const result = await storageGet([ACTIVITY_SHIELD_ENABLED_KEY]);
  const enabled = result?.[ACTIVITY_SHIELD_ENABLED_KEY] === true;
  const nextValue = !enabled;
  await storageSet({ [ACTIVITY_SHIELD_ENABLED_KEY]: nextValue });
  return nextValue;
}

async function toggleThemeEnabled() {
  const result = await storageGet([DARK_MODE_ENABLED_KEY]);
  const enabled = result?.[DARK_MODE_ENABLED_KEY] === true;
  const nextValue = !enabled;
  await storageSet({ [DARK_MODE_ENABLED_KEY]: nextValue });
  return nextValue;
}

async function fetchLatestManifest() {
  let lastError = null;

  for (const url of UPDATE_MANIFEST_URLS) {
    try {
      const requestUrl = `${url}?t=${Date.now()}`;
      const response = await fetch(requestUrl, { cache: "no-store" });
      if (!response.ok) {
        lastError = `GitHub returned ${response.status}`;
        continue;
      }

      const manifest = await response.json();
      if (manifest?.version) {
        return {
          manifest,
          url,
        };
      }
      lastError = "Remote manifest did not include a version";
    } catch (error) {
      lastError = error?.message || "Could not reach GitHub";
    }
  }

  throw new Error(lastError || "Could not check GitHub");
}

function storeStatus(status) {
  return storageSet({
    [UPDATE_STATUS_KEY]: status,
  });
}

function openRepository() {
  chrome.tabs.create({ url: REPO_URL });
}

function maybeNotify(status) {
  if (!status?.updateAvailable || !status.latestVersion) return;

  storageGet([UPDATE_REMINDER_ENABLED_KEY, UPDATE_LAST_NOTIFIED_KEY])
    .then((result) => {
      if (result?.[UPDATE_REMINDER_ENABLED_KEY] === false) return;
      if (result?.[UPDATE_LAST_NOTIFIED_KEY] === status.latestVersion) return;

      chrome.notifications.create(`ee-update-${status.latestVersion}`, {
        type: "basic",
        iconUrl: "images/Edupage-Extras.png",
        title: "Edupage Extras update available",
        message: `Version ${status.latestVersion} is available. Pull the latest project from GitHub.`,
        ...(IS_FIREFOX ? {} : { buttons: [{ title: "Open GitHub" }] }),
        priority: 1,
      }, () => {
        storageSet({
          [UPDATE_LAST_NOTIFIED_KEY]: status.latestVersion,
        });
      });
    });
}

// The GitHub "pull the latest project and reload" reminder only makes sense for
// unpacked/developer installs. Installs from a store (Firefox AMO, and a future
// Chrome Web Store listing) update themselves, so the reminder is wrong there.
// management.getSelf() reports installType without needing the "management"
// permission. Assume developer if it can't be determined, so the reminder
// never silently disappears for someone who actually relies on it.
let cachedIsDevelopmentInstall = null;
async function isDevelopmentInstall() {
  if (cachedIsDevelopmentInstall !== null) return cachedIsDevelopmentInstall;
  try {
    const self = await new Promise((resolve) => {
      if (!chrome.management?.getSelf) { resolve(null); return; }
      chrome.management.getSelf((info) => resolve(chrome.runtime.lastError ? null : info));
    });
    cachedIsDevelopmentInstall = self ? self.installType === "development" : true;
  } catch {
    cachedIsDevelopmentInstall = true;
  }
  return cachedIsDevelopmentInstall;
}

async function checkForUpdates({ notify = false } = {}) {
  const localVersion = chrome.runtime.getManifest().version;

  try {
    const latest = await fetchLatestManifest();
    const latestVersion = latest.manifest.version;
    const status = {
      checkedAt: Date.now(),
      localVersion,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, localVersion) > 0,
      repoUrl: REPO_URL,
      sourceUrl: latest.url,
    };

    await storeStatus(status);
    if (notify && await isDevelopmentInstall()) {
      maybeNotify(status);
    }
    return status;
  } catch (error) {
    const status = {
      checkedAt: Date.now(),
      localVersion,
      latestVersion: null,
      updateAvailable: false,
      repoUrl: REPO_URL,
      error: error?.message || "Could not check GitHub",
    };

    await storeStatus(status);
    return status;
  }
}

async function syncUpdateAlarm() {
  // Store installs auto-update, so don't schedule the daily GitHub check there.
  if (await isDevelopmentInstall() && await updateRemindersEnabled()) {
    chrome.alarms.create(UPDATE_ALARM_NAME, {
      delayInMinutes: 5,
      periodInMinutes: 1440,
    });
    return true;
  }

  await alarmClear(UPDATE_ALARM_NAME);
  return false;
}

// Minimal config for the .ics export: just the learned school origin, plus
// fixed defaults for the lesson-title formatting that used to be user-configurable
// Google Calendar sync settings (room/teacher in title reads better in a
// calendar entry than not, so default both on).
async function getTimetableExportConfig() {
  const result = await storageGet([LAST_EDUPAGE_ORIGIN_KEY]);
  return {
    lastEdupageOrigin: String(result?.[LAST_EDUPAGE_ORIGIN_KEY] || "").trim(),
    roomInTitle: true,
    teacherInTitle: true,
    halfyearScope: "future",
  };
}

function cloneWeekData(weekData, config = null) {
  if (!weekData) return null;
  return {
    weekLabel: String(weekData.weekLabel || ""),
    classLabel: String(weekData.classLabel || ""),
    dayHeaders: Array.isArray(weekData.dayHeaders)
      ? weekData.dayHeaders.map((entry) => ({
        label: String(entry?.label || ""),
        top: Number(entry?.top) || 0,
        date: String(entry?.date || ""),
      }))
      : [],
    lessons: Array.isArray(weekData.lessons)
      ? weekData.lessons.map((lesson) => ({
        date: String(lesson?.date || ""),
        dayIndex: Number(lesson?.dayIndex) || 0,
        period: String(lesson?.period || ""),
        startTime: String(lesson?.startTime || ""),
        endTime: String(lesson?.endTime || ""),
        duration: Number(lesson?.duration) || 0,
        title: String(lesson?.title || ""),
        group: String(lesson?.group || ""),
        room: String(lesson?.room || ""),
        teacher: String(lesson?.teacher || ""),
        changed: lesson?.changed === true,
        slotIndex: Number(lesson?.slotIndex) || 0,
        eventKey: String(lesson?.eventKey || ""),
      }))
      : [],
    ...(config ? { config } : {}),
  };
}

function resolveWeekStartDateString(weekData) {
  const firstDate = parseDateOnly(weekData?.dayHeaders?.[0]?.date);
  if (!firstDate) return "";
  return formatDate(startOfWeek(firstDate));
}

function computeRequestedTimetableWeekStart(today = new Date()) {
  const base = startOfWeek(today);
  return formatDate(isWeekend(today) ? addDays(base, 7) : base);
}

async function readTimetableSyncCache(origin) {
  if (!origin) return null;

  const result = await storageGet([TIMETABLE_SYNC_CACHE_KEY]);
  const root = result?.[TIMETABLE_SYNC_CACHE_KEY];
  if (!root || root.version !== TIMETABLE_SYNC_CACHE_VERSION) return null;

  const bucket = root.byOrigin?.[origin];
  if (!bucket || typeof bucket !== "object") return null;
  return bucket;
}

async function writeTimetableSyncCache(origin, bundle) {
  if (!origin || !bundle?.liveWeek) return;

  const result = await storageGet([TIMETABLE_SYNC_CACHE_KEY]);
  const root = result?.[TIMETABLE_SYNC_CACHE_KEY];
  const byOrigin = root?.version === TIMETABLE_SYNC_CACHE_VERSION && root?.byOrigin && typeof root.byOrigin === "object"
    ? { ...root.byOrigin }
    : {};

  byOrigin[origin] = {
    fetchedAt: Date.now(),
    targetWeekStart: resolveWeekStartDateString(bundle.liveWeek),
    liveWeek: cloneWeekData(bundle.liveWeek),
    adjacentWeek: cloneWeekData(bundle.adjacentWeek),
    sampleWeeks: Array.isArray(bundle.sampleWeeks)
      ? bundle.sampleWeeks.map((week) => cloneWeekData(week))
      : [],
  };

  await storageSet({
    [TIMETABLE_SYNC_CACHE_KEY]: {
      version: TIMETABLE_SYNC_CACHE_VERSION,
      byOrigin,
    },
  });
}

async function readFreshTimetableBundle(origin, requestedWeekStart, requireAdjacent) {
  const cached = await readTimetableSyncCache(origin);
  if (!cached?.fetchedAt || Date.now() - cached.fetchedAt > TIMETABLE_LIVE_CACHE_TTL_MS) {
    return null;
  }
  if (cached.targetWeekStart !== requestedWeekStart) {
    return null;
  }
  if (requireAdjacent && !cached.adjacentWeek) {
    return null;
  }

  return {
    liveWeek: cloneWeekData(cached.liveWeek),
    adjacentWeek: cloneWeekData(cached.adjacentWeek),
    sampleWeeks: Array.isArray(cached.sampleWeeks)
      ? cached.sampleWeeks.map((week) => cloneWeekData(week))
      : [],
    fetchedAt: cached.fetchedAt,
  };
}

function buildLessonDescription({ lesson, classLabel, weekLabel, mode }) {
  const lines = [];
  if (classLabel) lines.push(`Class: ${classLabel}`);
  if (lesson.teacher) lines.push(`Teacher: ${lesson.teacher}`);
  if (lesson.room) lines.push(`Room: ${lesson.room}`);
  if (lesson.group) lines.push(`Group: ${lesson.group}`);
  if (weekLabel) lines.push(`Week: ${weekLabel}`);
  if (lesson.changed) lines.push("Changed by EduPage for this week.");
  lines.push(`Source: EduPage (${mode === "halfyear" ? "halfyear sync" : "week sync"})`);
  return lines.join("\n");
}

function buildLessonSummary(lesson, config) {
  const options = config || {};
  const parts = [lesson.title];
  if (options.roomInTitle && lesson.room) {
    parts.push(lesson.room);
  }
  if (options.teacherInTitle && lesson.teacher) {
    parts.push(lesson.teacher);
  }
  return parts.join(" | ");
}

function buildDesiredEvent({ lesson, classLabel, weekLabel, mode, config }) {
  const options = config || {};
  return {
    key: lesson.eventKey,
    startDateTime: toRfc3339(lesson.date, lesson.startTime),
    endDateTime: toRfc3339(lesson.date, lesson.endTime),
    payload: {
      summary: buildLessonSummary(lesson, options),
      location: lesson.room || undefined,
      description: buildLessonDescription({ lesson, classLabel, weekLabel, mode }),
      start: {
        dateTime: toRfc3339(lesson.date, lesson.startTime),
        timeZone: EE_TIME_ZONE,
      },
      end: {
        dateTime: toRfc3339(lesson.date, lesson.endTime),
        timeZone: EE_TIME_ZONE,
      },
    },
  };
}

function cloneLessonForDate(lesson, targetDate) {
  const clonedDate = formatDate(targetDate);
  return {
    ...lesson,
    date: clonedDate,
    eventKey: `${clonedDate}|${lesson.period}|${lesson.slotIndex}|${lesson.title.toLowerCase()}|${lesson.group.toLowerCase()}`,
    changed: false,
  };
}

function shouldUseLessonInHalfyearTemplate(lesson) {
  if (!lesson?.title || !lesson?.startTime || !lesson?.endTime) {
    return false;
  }
  if (lesson.changed) {
    return false;
  }

  const titleKey = normalizeKeyText(lesson.title);
  const hasMetadata = Boolean(
    String(lesson.room || "").trim()
    || String(lesson.teacher || "").trim()
    || String(lesson.group || "").trim(),
  );

  if (!hasMetadata) {
    if (lesson.title.includes(":")) {
      return false;
    }
    if (
      titleKey.includes("udalost")
      || titleKey.includes("event")
      || titleKey.includes("prijimacie-skusky")
      || titleKey.includes("skusky")
      || titleKey.includes("maturita")
      || titleKey.includes("prazdniny")
      || titleKey.includes("holiday")
    ) {
      return false;
    }
  }

  return true;
}

function countTemplateEligibleLessons(weekData) {
  return Array.isArray(weekData?.lessons)
    ? weekData.lessons.filter(shouldUseLessonInHalfyearTemplate).length
    : 0;
}

function buildTemplateLessonSlotKey(lesson) {
  return [
    Number(lesson?.dayIndex) || 0,
    String(lesson?.period || ""),
    String(lesson?.startTime || ""),
    String(lesson?.endTime || ""),
    Number(lesson?.slotIndex) || 0,
    Number(lesson?.duration) || 0,
  ].join("|");
}

function buildTemplateLessonValueKey(lesson) {
  return [
    normalizeKeyText(lesson?.title),
    normalizeKeyText(lesson?.group),
    normalizeKeyText(lesson?.room),
    normalizeKeyText(lesson?.teacher),
  ].join("|");
}

function scoreTemplateLessonMetadata(lesson) {
  return [
    lesson?.title,
    lesson?.group,
    lesson?.room,
    lesson?.teacher,
  ].filter((value) => String(value || "").trim()).length;
}

function mergeTemplateWeekSamples(weekSamples) {
  const samples = (weekSamples || []).filter((weekData) => Array.isArray(weekData?.lessons));
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0];

  const slots = new Map();
  samples.forEach((weekData, sampleIndex) => {
    weekData.lessons
      .filter(shouldUseLessonInHalfyearTemplate)
      .forEach((lesson) => {
        const slotKey = buildTemplateLessonSlotKey(lesson);
        const valueKey = buildTemplateLessonValueKey(lesson);
        if (!slots.has(slotKey)) {
          slots.set(slotKey, new Map());
        }

        const variants = slots.get(slotKey);
        const current = variants.get(valueKey);
        variants.set(valueKey, {
          lesson,
          count: (current?.count || 0) + 1,
          lastSampleIndex: sampleIndex,
          metadataScore: scoreTemplateLessonMetadata(lesson),
        });
      });
  });

  const baseWeek = samples[samples.length - 1];
  const lessons = Array.from(slots.values())
    .map((variants) => Array.from(variants.values()).sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (right.lastSampleIndex !== left.lastSampleIndex) return right.lastSampleIndex - left.lastSampleIndex;
      if (right.metadataScore !== left.metadataScore) return right.metadataScore - left.metadataScore;
      return String(left.lesson?.eventKey || "").localeCompare(String(right.lesson?.eventKey || ""));
    })[0]?.lesson)
    .filter(Boolean)
    .sort((left, right) => {
      const dayDiff = (Number(left.dayIndex) || 0) - (Number(right.dayIndex) || 0);
      if (dayDiff !== 0) return dayDiff;
      const periodDiff = (Number.parseInt(left.period, 10) || 0) - (Number.parseInt(right.period, 10) || 0);
      if (periodDiff !== 0) return periodDiff;
      return (Number(left.slotIndex) || 0) - (Number(right.slotIndex) || 0);
    });

  return {
    ...baseWeek,
    lessons,
  };
}

function buildTemplateWeekMap(sampleWeeks) {
  const groupedWeeks = new Map();

  for (const weekData of sampleWeeks || []) {
    if (!weekData?.weekLabel || !Array.isArray(weekData.lessons)) continue;
    if (!groupedWeeks.has(weekData.weekLabel)) {
      groupedWeeks.set(weekData.weekLabel, []);
    }
    groupedWeeks.get(weekData.weekLabel).push(weekData);
  }

  const templateWeeks = new Map();
  groupedWeeks.forEach((weeks, weekLabel) => {
    templateWeeks.set(weekLabel, mergeTemplateWeekSamples(weeks));
  });

  return templateWeeks;
}

function buildWeeklyDesiredEvents(weekData) {
  return weekData.lessons.map((lesson) => buildDesiredEvent({
    lesson,
    classLabel: weekData.classLabel,
    weekLabel: weekData.weekLabel,
    mode: "week",
    config: weekData.config,
  }));
}

// ── Timetable .ics export ────────────────────────────────────────────────────
//
// Reuses the same desired-event assembly as the Google Calendar sync
// (buildWeeklyDesiredEvents / buildHalfyearDesiredEvents) but emits an iCalendar
// file instead of pushing to Google — a plain local download, no OAuth.

function icsEscapeText(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 caps content lines at 75 octets; fold the rest onto continuation
// lines that start with a single space.
function icsFoldLine(line) {
  if (line.length <= 73) return line;
  const parts = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest.length) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

// RFC3339 (with offset) → iCalendar UTC stamp "YYYYMMDDTHHMMSSZ". Going through
// UTC keeps the lessons at the right wall-clock time in any calendar app.
function toIcsUtcStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

function buildIcsCalendar(events, calendarName = "EduPage Timetable") {
  const stamp = toIcsUtcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edupage Extras//Timetable Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscapeText(calendarName)}`,
  ];

  let count = 0;
  (events || []).forEach((event, index) => {
    const start = toIcsUtcStamp(event?.startDateTime);
    const end = toIcsUtcStamp(event?.endDateTime);
    if (!start || !end) return;
    const uid = `${String(event?.key || `ee-timetable-${index}`)}@edupage-extras`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${icsEscapeText(uid)}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${icsEscapeText(event?.payload?.summary)}`);
    if (event?.payload?.location) lines.push(`LOCATION:${icsEscapeText(event.payload.location)}`);
    if (event?.payload?.description) lines.push(`DESCRIPTION:${icsEscapeText(event.payload.description)}`);
    lines.push("END:VEVENT");
    count += 1;
  });

  lines.push("END:VCALENDAR");
  return { ics: lines.map(icsFoldLine).join("\r\n"), count };
}

async function buildTimetableIcsExport(range, includeChanges = true) {
  const baseConfig = await getTimetableExportConfig();
  if (!baseConfig.lastEdupageOrigin) {
    throw new Error("Open any EduPage page once so the extension can learn your school URL, then try again.");
  }

  const halfyear = range === "halfyear";
  const config = {
    ...baseConfig,
    syncMode: halfyear ? "halfyear" : "week",
    extraHalfyearSampleWeeks: halfyear ? 2 : 0,
  };

  const { liveWeek, adjacentWeek, templateSampleWeeks } = await collectLiveEdupageWeek(config);
  if (!liveWeek?.lessons?.length) {
    throw new Error("EduPage did not return any lessons for the timetable.");
  }

  // "Without changes" → drop this week's substitutions/room changes so the file
  // holds the regular timetable. (The half-year projection already uses only
  // unchanged lessons for future weeks; this also cleans the live week.)
  if (!includeChanges) {
    liveWeek.lessons = liveWeek.lessons.filter((lesson) => !lesson.changed);
    if (adjacentWeek) {
      adjacentWeek.lessons = adjacentWeek.lessons.filter((lesson) => !lesson.changed);
    }
    if (!liveWeek.lessons.length) {
      throw new Error("No unchanged lessons to export for this week.");
    }
  }

  liveWeek.config = { ...config, templateSampleWeeks };
  if (adjacentWeek) adjacentWeek.config = liveWeek.config;

  const events = halfyear
    ? buildHalfyearDesiredEvents(liveWeek, adjacentWeek)
    : buildWeeklyDesiredEvents(liveWeek);

  const { ics, count } = buildIcsCalendar(events, halfyear ? "EduPage Timetable (Half-year)" : "EduPage Timetable (Week)");
  if (count === 0) {
    throw new Error("No lessons were available to export.");
  }
  return { ics, count, filename: `edupage-timetable-${halfyear ? "halfyear" : "week"}.ics` };
}

function buildHalfyearDesiredEvents(liveWeek, adjacentWeek) {
  const anchorDate = parseDateOnly(liveWeek.dayHeaders[0]?.date) || new Date();
  const halfyearRange = computeCurrentHalfyearRange(anchorDate);
  const config = liveWeek.config || {};
  const todayDate = parseDateOnly(formatDate(new Date())) || new Date();
  const effectiveStart = config.halfyearScope === "full"
    ? halfyearRange.start
    : (todayDate > halfyearRange.start ? todayDate : halfyearRange.start);
  const currentWeekStart = startOfWeek(anchorDate);
  const templateSamples = Array.isArray(config.templateSampleWeeks) && config.templateSampleWeeks.length > 0
    ? config.templateSampleWeeks
    : [liveWeek, adjacentWeek].filter(Boolean);
  const templates = buildTemplateWeekMap(templateSamples);

  const labels = [...templates.keys()];
  const useAlternating = labels.length === 2;
  const primaryLabel = liveWeek.weekLabel;
  const secondaryLabel = labels.find((label) => label !== primaryLabel) || primaryLabel;
  const byDate = new Map();

  for (let cursor = startOfWeek(halfyearRange.start); cursor <= halfyearRange.end; cursor = addDays(cursor, 7)) {
    const weekOffset = diffWeeks(cursor, currentWeekStart);
    const label = useAlternating && Math.abs(weekOffset % 2) === 1 ? secondaryLabel : primaryLabel;
    const sourceWeek = templates.get(label) || liveWeek;

    for (const lesson of sourceWeek.lessons.filter(shouldUseLessonInHalfyearTemplate)) {
      const dayDate = addDays(cursor, lesson.dayIndex);
      if (dayDate < effectiveStart || dayDate > halfyearRange.end) continue;
      if (shouldSkipGeneratedSchoolDay(dayDate)) continue;
      const cloned = cloneLessonForDate(lesson, dayDate);
      if (!byDate.has(cloned.date)) {
        byDate.set(cloned.date, []);
      }
      byDate.get(cloned.date).push(cloned);
    }
  }

  const liveDates = new Set(liveWeek.dayHeaders.map((entry) => entry.date));
  for (const date of liveDates) {
    byDate.delete(date);
  }
  for (const lesson of liveWeek.lessons) {
    const lessonDate = parseDateOnly(lesson.date);
    if (lessonDate && lessonDate < effectiveStart) {
      continue;
    }
    if (!byDate.has(lesson.date)) {
      byDate.set(lesson.date, []);
    }
    byDate.get(lesson.date).push(lesson);
  }

  const desired = [];
  for (const lessons of byDate.values()) {
    lessons.sort((left, right) => {
      const periodDiff = (Number.parseInt(left.period, 10) || 0) - (Number.parseInt(right.period, 10) || 0);
      if (periodDiff !== 0) return periodDiff;
      return left.eventKey.localeCompare(right.eventKey);
    });
    lessons.forEach((lesson) => {
      desired.push(buildDesiredEvent({
        lesson,
        classLabel: liveWeek.classLabel,
        weekLabel: liveWeek.weekLabel,
        mode: "halfyear",
        config: liveWeek.config,
      }));
    });
  }

  return desired.sort((left, right) => left.startDateTime.localeCompare(right.startDateTime));
}

function selectTimetableSampleWeeks(weeks, config = {}, today = new Date()) {
  const series = Array.isArray(weeks) ? weeks.filter(Boolean) : [];
  if (series.length === 0) {
    return {
      liveWeek: null,
      adjacentWeek: null,
      templateSampleWeeks: [],
    };
  }

  let liveIndex = 0;
  const firstWeekEnd = parseDateOnly(series[0]?.dayHeaders?.[series[0].dayHeaders.length - 1]?.date);
  if (isWeekend(today) && firstWeekEnd && firstWeekEnd < today && series[1]) {
    liveIndex = 1;
  }

  const liveWeek = series[liveIndex] || null;
  const halfyearMode = config.syncMode === "halfyear";
  const adjacentWeek = halfyearMode ? (series[liveIndex + 1] || null) : null;
  const requestedExtraSampleWeeks = Number.parseInt(config.extraHalfyearSampleWeeks, 10);
  const extraHalfyearSampleWeeks = Math.max(
    0,
    Number.isFinite(requestedExtraSampleWeeks) ? requestedExtraSampleWeeks : 0,
  );

  const templateSampleWeeks = [];
  if (liveWeek) templateSampleWeeks.push(liveWeek);
  if (adjacentWeek) templateSampleWeeks.push(adjacentWeek);

  if (halfyearMode) {
    for (let index = 0; index < extraHalfyearSampleWeeks; index += 1) {
      const extraWeek = series[liveIndex + 2 + index];
      if (!extraWeek) break;
      templateSampleWeeks.push(extraWeek);
    }
  }

  return {
    liveWeek,
    adjacentWeek,
    templateSampleWeeks,
  };
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => {
      resolve();
    });
  });
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      reject(new Error("Timed out while loading the hidden EduPage timetable tab."));
    }, timeoutMs);

    function handleUpdate(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== "complete") return;
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(handleUpdate);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(handleUpdate);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab?.status === "complete" && !finished) {
        finished = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(handleUpdate);
        resolve();
      }
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function sendTabMessageRetry(tabId, message, attempts = 20) {
  let lastError = null;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await sendTabMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }

  throw lastError || new Error("Could not reach the hidden EduPage timetable tab.");
}

async function extractWeekFromHiddenTab(tabId, steps = 0) {
  const response = await sendTabMessageRetry(tabId, {
    type: "ee-extract-timetable-week",
    steps,
  });
  if (!response?.ok || !response?.data) {
    throw new Error(response?.error || "EduPage timetable extraction failed.");
  }
  return response.data;
}

async function extractWeekSeriesFromHiddenTab(tabId, count = 1) {
  const response = await sendTabMessageRetry(tabId, {
    type: "ee-extract-timetable-week-series",
    count,
  });
  if (!response?.ok || !Array.isArray(response.data?.weeks)) {
    throw new Error(response?.error || "EduPage timetable series extraction failed.");
  }
  return response.data.weeks;
}

// Note: the Suplovanie (substitution) snapshot is now fetched directly by
// timetable-enhancer.js via the viewer.js POST (using the page's gsechash) — no
// hidden tab or background round-trip. The old ee-substitution-snapshot handler
// and its day-cache were removed once the direct fetch was verified live.

async function collectLiveEdupageWeek(config) {
  if (!config.lastEdupageOrigin) {
    throw new Error("Open any EduPage page once so the extension can learn your school URL.");
  }

  const requestedWeekStart = computeRequestedTimetableWeekStart();
  const cachedBundle = await readFreshTimetableBundle(
    config.lastEdupageOrigin,
    requestedWeekStart,
    config.syncMode === "halfyear",
  );
  if (cachedBundle?.liveWeek) {
    return {
      liveWeek: cloneWeekData(cachedBundle.liveWeek, config),
      adjacentWeek: cloneWeekData(cachedBundle.adjacentWeek, config),
      templateSampleWeeks: Array.isArray(cachedBundle.sampleWeeks)
        ? cachedBundle.sampleWeeks.map((week) => cloneWeekData(week, config))
        : [],
      fromCache: true,
      cachedAt: cachedBundle.fetchedAt,
    };
  }

  const tab = await createTab(`${config.lastEdupageOrigin}/dashboard/eb.php?mode=timetable`);
  try {
    await waitForTabComplete(tab.id);
    const today = new Date();
    const requestedExtraSampleWeeks = Number.parseInt(config.extraHalfyearSampleWeeks, 10);
    const extraHalfyearSampleWeeks = Math.max(
      0,
      Number.isFinite(requestedExtraSampleWeeks) ? requestedExtraSampleWeeks : 0,
    );
    const requestedWeekCount = (
      1
      + (config.syncMode === "halfyear" ? 1 + extraHalfyearSampleWeeks : 0)
      + (isWeekend(today) ? 1 : 0)
    );
    const extractedWeeks = await extractWeekSeriesFromHiddenTab(tab.id, requestedWeekCount);
    const selectedWeeks = selectTimetableSampleWeeks(extractedWeeks, {
      syncMode: config.syncMode,
      extraHalfyearSampleWeeks,
    }, today);
    const liveWeek = cloneWeekData(selectedWeeks.liveWeek, config);
    const adjacentWeek = cloneWeekData(selectedWeeks.adjacentWeek, config);
    const templateSampleWeeks = selectedWeeks.templateSampleWeeks.map((week) => cloneWeekData(week));

    await writeTimetableSyncCache(config.lastEdupageOrigin, {
      liveWeek,
      adjacentWeek,
      sampleWeeks: templateSampleWeeks,
    });

    return { liveWeek, adjacentWeek, templateSampleWeeks };
  } finally {
    await removeTab(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  syncUpdateAlarm().then((enabled) => {
    if (enabled) {
      checkForUpdates({ notify: true });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  syncUpdateAlarm().then((enabled) => {
    if (enabled) {
      checkForUpdates({ notify: true });
    }
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === TOGGLE_ACTIVITY_SHIELD_COMMAND) {
    toggleActivityShieldEnabled().catch((error) => {
      console.warn("[Edupage Extras] Could not toggle Stay Active Mode.", error);
    });
    return;
  }

  if (command === TOGGLE_THEME_COMMAND) {
    toggleThemeEnabled().catch((error) => {
      console.warn("[Edupage Extras] Could not toggle themes.", error);
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM_NAME) {
    updateRemindersEnabled().then((enabled) => {
      if (enabled) {
        checkForUpdates({ notify: true });
      } else {
        chrome.alarms.clear(UPDATE_ALARM_NAME);
      }
    });
    return;
  }

});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes[UPDATE_REMINDER_ENABLED_KEY]) {
    syncUpdateAlarm().then((enabled) => {
      if (enabled) {
        checkForUpdates({ notify: true });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ee-check-update") {
    checkForUpdates({ notify: message.notify === true })
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || "Could not check GitHub",
      }));
    return true;
  }

  if (message?.type === "ee-collect-report") {
    buildDiagnosticsReport({ redact: message.redact !== false })
      .then((report) => sendResponse({ ok: true, report }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || "Could not build diagnostics report",
      }));
    return true;
  }

  if (message?.type === "ee-report-open-issue") {
    const title = typeof message.title === "string" ? message.title : "Bug report";
    const body = typeof message.body === "string" ? message.body : "";
    const url = `${REPO_URL}/issues/new?` +
      `title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "ee-edupage-page-context") {
    if (sender.frameId === 0 && typeof message.origin === "string" && message.origin.startsWith("https://")) {
      storageSet({
        [LAST_EDUPAGE_ORIGIN_KEY]: message.origin,
      }).then(() => sendResponse({ ok: true }));
      return true;
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "ee-timetable-page-preload") {
    const origin = typeof message.origin === "string" && message.origin.startsWith("https://")
      ? message.origin
      : "";
    const weekData = message.data && typeof message.data === "object" ? message.data : null;
    if (origin && weekData) {
      const weekStart = resolveWeekStartDateString(weekData);
      // Only write if the existing cache is missing or stale — don't downgrade a
      // full multi-week cache (with a proper adjacentWeek) to a single-week one.
      readFreshTimetableBundle(origin, weekStart, true).then((existing) => {
        if (existing?.liveWeek) return;
        return writeTimetableSyncCache(origin, {
          liveWeek: weekData,
          adjacentWeek: weekData,
          sampleWeeks: [],
        });
      }).catch(() => {});
    }
    return false;
  }

  if (message?.type === "ee-export-timetable-ics") {
    const range = message.range === "halfyear" ? "halfyear" : "week";
    const includeChanges = message.includeChanges !== false;
    buildTimetableIcsExport(range, includeChanges)
      .then((result) => sendResponse({ ok: true, ...result, range }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || "Timetable export failed.",
      }));
    return true;
  }


  return false;
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("ee-update-")) {
    openRepository();
    chrome.notifications.clear(notificationId);
  }
});

chrome.notifications.onButtonClicked.addListener((notificationId) => {
  if (notificationId.startsWith("ee-update-")) {
    openRepository();
    chrome.notifications.clear(notificationId);
  }
});
