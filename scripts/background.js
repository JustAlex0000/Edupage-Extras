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

const GOOGLE_CALENDAR_SYNC_ALARM_NAME = "ee-google-calendar-sync";
const GOOGLE_CALENDAR_ENABLED_KEY = "eeGoogleCalendarEnabled";
const GOOGLE_CALENDAR_PAUSED_KEY = "eeGoogleCalendarPaused";
const GOOGLE_CALENDAR_CLIENT_ID_KEY = "eeGoogleCalendarOauthClientId";
const GOOGLE_CALENDAR_CLIENT_SECRET_KEY = "eeGoogleCalendarOauthClientSecret";
const GOOGLE_CALENDAR_NAME_KEY = "eeGoogleCalendarCalendarName";
const GOOGLE_CALENDAR_SYNC_MODE_KEY = "eeGoogleCalendarSyncMode";
const GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY = "eeGoogleCalendarHalfyearScope";
const GOOGLE_CALENDAR_COLOR_MODE_KEY = "eeGoogleCalendarColorMode";
const GOOGLE_CALENDAR_SINGLE_COLOR_KEY = "eeGoogleCalendarSingleColorId";
const GOOGLE_CALENDAR_SYNC_INTERVAL_KEY = "eeGoogleCalendarSyncIntervalMinutes";
const GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY = "eeGoogleCalendarRoomInTitle";
const GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY = "eeGoogleCalendarTeacherInTitle";
const GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY = "eeGoogleCalendarUseDefaultReminders";
const GOOGLE_CALENDAR_STATUS_KEY = "eeGoogleCalendarStatus";
const GOOGLE_CALENDAR_TOKENS_KEY = "eeGoogleCalendarTokens";
const GOOGLE_CALENDAR_CALENDAR_ID_KEY = "eeGoogleCalendarCalendarId";
const GOOGLE_CALENDAR_LAST_ORIGIN_KEY = "eeGoogleCalendarLastEdupageOrigin";
const TIMETABLE_SYNC_CACHE_KEY = "eeTimetableSyncCache";
const TIMETABLE_SYNC_CACHE_VERSION = 1;
const GOOGLE_CALENDAR_DEFAULT_NAME = "EduPage";
const GOOGLE_CALENDAR_DEFAULT_SYNC_MODE = "week";
const GOOGLE_CALENDAR_DEFAULT_HALFYEAR_SCOPE = "future";
const GOOGLE_CALENDAR_DEFAULT_COLOR_MODE = "subject";
const GOOGLE_CALENDAR_DEFAULT_SINGLE_COLOR = "9";
const GOOGLE_CALENDAR_DEFAULT_SYNC_INTERVAL = 15;
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_CALENDAR_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Bratislava";
const TIMETABLE_LIVE_CACHE_TTL_MS = 10 * 60 * 1000;
let googleCalendarJobQueue = Promise.resolve();
let googleCalendarClearPending = false;

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

function readRetryAfterMs(response) {
  const header = response.headers.get("Retry-After");
  if (!header) return 0;

  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const parsedDate = Date.parse(header);
  if (Number.isNaN(parsedDate)) return 0;
  return Math.max(0, parsedDate - Date.now());
}

function isGoogleRateLimitPayload(payload) {
  const message = String(payload?.error?.message || payload?.error_description || "").toLowerCase();
  if (message.includes("rate limit")) return true;

  return (payload?.error?.errors || []).some((entry) => String(entry?.reason || "").toLowerCase().includes("ratelimit"));
}

function computeGoogleRateLimitDelay(response, attempt) {
  const headerDelay = readRetryAfterMs(response);
  if (headerDelay > 0) {
    return Math.min(30000, headerDelay);
  }
  return Math.min(30000, 1000 * (2 ** attempt));
}

function normalizeGoogleCalendarName(value) {
  const trimmed = String(value || "").trim();
  return trimmed || GOOGLE_CALENDAR_DEFAULT_NAME;
}

function normalizeGoogleCalendarSyncMode(value) {
  return value === "halfyear" ? "halfyear" : GOOGLE_CALENDAR_DEFAULT_SYNC_MODE;
}

function normalizeGoogleCalendarHalfyearScope(value) {
  return ["future", "full"].includes(value) ? value : GOOGLE_CALENDAR_DEFAULT_HALFYEAR_SCOPE;
}

function normalizeGoogleCalendarColorMode(value) {
  return ["subject", "single", "changes", "none"].includes(value) ? value : GOOGLE_CALENDAR_DEFAULT_COLOR_MODE;
}

function normalizeGoogleCalendarSingleColor(value) {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"].includes(String(value))
    ? String(value)
    : GOOGLE_CALENDAR_DEFAULT_SINGLE_COLOR;
}

function normalizeGoogleCalendarSyncInterval(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return GOOGLE_CALENDAR_DEFAULT_SYNC_INTERVAL;
  return Math.max(5, Math.min(120, parsed - (parsed % 5)));
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
  const month = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime()) ? null : date;
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

function computeCurrentHalfyearRange(anchorDate) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  if (month >= 8) {
    return {
      start: new Date(year, 8, 1),
      end: new Date(year + 1, 0, 31),
    };
  }

  if (month === 0) {
  return {
    start: new Date(year - 1, 8, 1),
    end: new Date(year, 0, 31),
  };
}

  return {
    start: new Date(year, 1, 1),
    end: new Date(year, 5, 30),
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

function shouldSkipGeneratedSchoolDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  return GOOGLE_CALENDAR_TIME_ZONE === "Europe/Bratislava" && isSlovakPublicHoliday(date);
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
  return result?.[UPDATE_REMINDER_ENABLED_KEY] === true;
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

function enqueueGoogleCalendarJob(job) {
  const queued = googleCalendarJobQueue
    .catch(() => {})
    .then(job);
  googleCalendarJobQueue = queued.catch(() => {});
  return queued;
}

function maybeNotify(status) {
  if (!status?.updateAvailable || !status.latestVersion) return;

  storageGet([UPDATE_REMINDER_ENABLED_KEY, UPDATE_LAST_NOTIFIED_KEY])
    .then((result) => {
      if (result?.[UPDATE_REMINDER_ENABLED_KEY] !== true) return;
      if (result?.[UPDATE_LAST_NOTIFIED_KEY] === status.latestVersion) return;

      chrome.notifications.create(`ee-update-${status.latestVersion}`, {
        type: "basic",
        iconUrl: "images/placeholder_icon.png",
        title: "Edupage Extras update available",
        message: `Version ${status.latestVersion} is available. Pull the latest project from GitHub.`,
        buttons: [{ title: "Open GitHub" }],
        priority: 1,
      }, () => {
        storageSet({
          [UPDATE_LAST_NOTIFIED_KEY]: status.latestVersion,
        });
      });
    });
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
    if (notify) {
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
  if (await updateRemindersEnabled()) {
    chrome.alarms.create(UPDATE_ALARM_NAME, {
      delayInMinutes: 5,
      periodInMinutes: 1440,
    });
    return true;
  }

  await alarmClear(UPDATE_ALARM_NAME);
  return false;
}

async function getGoogleCalendarConfig() {
  const result = await storageGet([
    GOOGLE_CALENDAR_ENABLED_KEY,
    GOOGLE_CALENDAR_PAUSED_KEY,
    GOOGLE_CALENDAR_CLIENT_ID_KEY,
    GOOGLE_CALENDAR_CLIENT_SECRET_KEY,
    GOOGLE_CALENDAR_NAME_KEY,
    GOOGLE_CALENDAR_SYNC_MODE_KEY,
    GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY,
    GOOGLE_CALENDAR_COLOR_MODE_KEY,
    GOOGLE_CALENDAR_SINGLE_COLOR_KEY,
    GOOGLE_CALENDAR_SYNC_INTERVAL_KEY,
    GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY,
    GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY,
    GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY,
    GOOGLE_CALENDAR_CALENDAR_ID_KEY,
    GOOGLE_CALENDAR_LAST_ORIGIN_KEY,
  ]);

  return {
    enabled: result?.[GOOGLE_CALENDAR_ENABLED_KEY] === true,
    paused: result?.[GOOGLE_CALENDAR_PAUSED_KEY] === true,
    clientId: String(result?.[GOOGLE_CALENDAR_CLIENT_ID_KEY] || "").trim(),
    clientSecret: String(result?.[GOOGLE_CALENDAR_CLIENT_SECRET_KEY] || "").trim(),
    calendarName: normalizeGoogleCalendarName(result?.[GOOGLE_CALENDAR_NAME_KEY]),
    syncMode: normalizeGoogleCalendarSyncMode(result?.[GOOGLE_CALENDAR_SYNC_MODE_KEY]),
    halfyearScope: normalizeGoogleCalendarHalfyearScope(result?.[GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY]),
    colorMode: normalizeGoogleCalendarColorMode(result?.[GOOGLE_CALENDAR_COLOR_MODE_KEY]),
    singleColorId: normalizeGoogleCalendarSingleColor(result?.[GOOGLE_CALENDAR_SINGLE_COLOR_KEY]),
    syncIntervalMinutes: normalizeGoogleCalendarSyncInterval(result?.[GOOGLE_CALENDAR_SYNC_INTERVAL_KEY]),
    roomInTitle: result?.[GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY] === true,
    teacherInTitle: result?.[GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY] === true,
    useDefaultReminders: result?.[GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY] === true,
    calendarId: String(result?.[GOOGLE_CALENDAR_CALENDAR_ID_KEY] || "").trim(),
    lastEdupageOrigin: String(result?.[GOOGLE_CALENDAR_LAST_ORIGIN_KEY] || "").trim(),
  };
}

async function setGoogleCalendarStatus(status) {
  await storageSet({
    [GOOGLE_CALENDAR_STATUS_KEY]: {
      ...status,
      updatedAt: Date.now(),
    },
  });
}

function formatGoogleCalendarProgress({ phase, completed = 0, total = 0, created = 0, updated = 0, deleted = 0, unchanged = 0 }) {
  if (phase === "prepare") {
    return "Preparing EduPage timetable data...";
  }
  if (phase === "calendar") {
    return "Preparing Google Calendar...";
  }
  if (phase === "clear") {
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 100;
    return `Removing EduPage events... ${percent}% (${completed}/${total})`;
  }

  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return `Syncing timetable... ${percent}% (${completed}/${total}). Created ${created}, updated ${updated}, removed ${deleted}, unchanged ${unchanged}.`;
}

async function updateGoogleCalendarProgress(baseStatus, progress) {
  await setGoogleCalendarStatus({
    ...baseStatus,
    state: "syncing",
    message: formatGoogleCalendarProgress(progress),
  });
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

async function syncGoogleCalendarAlarm() {
  const config = await getGoogleCalendarConfig();
  if (config.enabled && !config.paused) {
    chrome.alarms.create(GOOGLE_CALENDAR_SYNC_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: config.syncIntervalMinutes,
    });
    return true;
  }

  await alarmClear(GOOGLE_CALENDAR_SYNC_ALARM_NAME);
  return false;
}

function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(digest));
}

function randomBase64Url(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function getGoogleAuthRedirectUri() {
  return chrome.identity.getRedirectURL();
}

function formatGoogleConnectError(error, redirectUri) {
  const message = String(error?.message || "").trim();
  if (!message) {
    return new Error("Google authentication failed.");
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes("redirect_uri_mismatch")
    || normalized.includes("did not approve access")
  ) {
    return new Error(
      `Google sign-in did not complete. Add this exact Authorized redirect URI to your Google OAuth client, then try again: ${redirectUri}`,
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ interactive: true, url }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!redirectUrl) {
        reject(new Error("Google authentication did not return a redirect URL."));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

function parseRedirectCode(redirectUrl) {
  const parsed = new URL(redirectUrl);
  const error = parsed.searchParams.get("error");
  if (error) {
    const description = parsed.searchParams.get("error_description");
    throw new Error(`Google authentication failed: ${description || error}`);
  }
  const code = parsed.searchParams.get("code");
  if (!code) {
    throw new Error("Google authentication did not return an authorization code.");
  }
  return code;
}

async function exchangeGoogleAuthCode({ clientId, clientSecret, code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Google token exchange failed.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + ((payload.expires_in || 3600) * 1000) - 60000,
    tokenType: payload.token_type || "Bearer",
  };
}

async function refreshGoogleAccessToken({ clientId, clientSecret, refreshToken }) {
  if (!clientId || !refreshToken) {
    throw new Error("Google Calendar is not connected.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json();
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Google token refresh failed.");
  }

  const current = await storageGet([GOOGLE_CALENDAR_TOKENS_KEY]);
  const existing = current?.[GOOGLE_CALENDAR_TOKENS_KEY] || {};
  const nextTokens = {
    accessToken: payload.access_token,
    refreshToken: existing.refreshToken || refreshToken,
    expiresAt: Date.now() + ((payload.expires_in || 3600) * 1000) - 60000,
    tokenType: payload.token_type || "Bearer",
  };
  await storageSet({ [GOOGLE_CALENDAR_TOKENS_KEY]: nextTokens });
  return nextTokens;
}

async function ensureGoogleAccessToken() {
  const config = await getGoogleCalendarConfig();
  const stored = await storageGet([GOOGLE_CALENDAR_TOKENS_KEY]);
  const tokens = stored?.[GOOGLE_CALENDAR_TOKENS_KEY];
  if (!tokens?.accessToken || !tokens?.refreshToken) {
    throw new Error("Google Calendar is not connected yet.");
  }

  if (tokens.expiresAt && tokens.expiresAt > Date.now()) {
    return tokens.accessToken;
  }

  const refreshed = await refreshGoogleAccessToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: tokens.refreshToken,
  });
  return refreshed.accessToken;
}

async function googleCalendarRequest(path, {
  method = "GET",
  query = null,
  body = null,
  authRetry = true,
  rateLimitAttempt = 0,
} = {}) {
  const token = await ensureGoogleAccessToken();
  const url = new URL(`https://www.googleapis.com${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && authRetry) {
    const config = await getGoogleCalendarConfig();
    const stored = await storageGet([GOOGLE_CALENDAR_TOKENS_KEY]);
    const refreshToken = stored?.[GOOGLE_CALENDAR_TOKENS_KEY]?.refreshToken;
    await refreshGoogleAccessToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
    });
    return googleCalendarRequest(path, { method, query, body, authRetry: false, rateLimitAttempt });
  }

  if ((response.status === 429 || ((response.status === 403) && isGoogleRateLimitPayload(payload))) && rateLimitAttempt < 5) {
    await delay(computeGoogleRateLimitDelay(response, rateLimitAttempt));
    return googleCalendarRequest(path, {
      method,
      query,
      body,
      authRetry,
      rateLimitAttempt: rateLimitAttempt + 1,
    });
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error_description || "Google Calendar request failed.");
  }
  return payload;
}

async function findCalendarByName(summary) {
  let pageToken = "";

  while (true) {
    const payload = await googleCalendarRequest("/calendar/v3/users/me/calendarList", {
      query: {
        maxResults: 250,
        pageToken,
      },
    });

    const match = (payload?.items || []).find((item) => item.summary === summary);
    if (match) return match;
    if (!payload?.nextPageToken) return null;
    pageToken = payload.nextPageToken;
  }
}

async function ensureManagedGoogleCalendar(config) {
  if (config.calendarId) {
    return config.calendarId;
  }

  const existing = await findCalendarByName(config.calendarName);
  if (existing?.id) {
    await storageSet({ [GOOGLE_CALENDAR_CALENDAR_ID_KEY]: existing.id });
    return existing.id;
  }

  const created = await googleCalendarRequest("/calendar/v3/calendars", {
    method: "POST",
    body: {
      summary: config.calendarName,
      description: "Managed by Edupage Extras.",
      timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    },
  });

  if (!created?.id) {
    throw new Error("Google Calendar did not return a calendar id.");
  }

  await storageSet({ [GOOGLE_CALENDAR_CALENDAR_ID_KEY]: created.id });
  return created.id;
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

function hashText(value) {
  return [...String(value || "")].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0);
}

function resolveGoogleEventColor(lesson, config) {
  const options = config || {};
  if (options.colorMode === "changes") {
    return lesson.changed ? "11" : undefined;
  }
  if (options.colorMode === "single") {
    return normalizeGoogleCalendarSingleColor(options.singleColorId);
  }
  if (options.colorMode === "subject") {
    const palette = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
    return palette[hashText(normalizeKeyText(lesson.title)) % palette.length];
  }
  return undefined;
}

function buildDesiredEvent({ lesson, classLabel, weekLabel, mode, config }) {
  const options = config || {};
  const useDefaultReminders = options.useDefaultReminders === true;
  return {
    key: lesson.eventKey,
    startDateTime: toRfc3339(lesson.date, lesson.startTime),
    endDateTime: toRfc3339(lesson.date, lesson.endTime),
    payload: {
      summary: buildLessonSummary(lesson, options),
      location: lesson.room || undefined,
      colorId: resolveGoogleEventColor(lesson, options),
      description: buildLessonDescription({ lesson, classLabel, weekLabel, mode }),
      start: {
        dateTime: toRfc3339(lesson.date, lesson.startTime),
        timeZone: GOOGLE_CALENDAR_TIME_ZONE,
      },
      end: {
        dateTime: toRfc3339(lesson.date, lesson.endTime),
        timeZone: GOOGLE_CALENDAR_TIME_ZONE,
      },
      extendedProperties: {
        private: {
          eeManaged: "1",
          eeKey: lesson.eventKey,
          eeDate: lesson.date,
        },
      },
      reminders: useDefaultReminders
        ? { useDefault: true }
        : { useDefault: false },
    },
  };
}

function managedEventMatchesDesired(current, desiredPayload) {
  const currentPrivate = current?.extendedProperties?.private || {};
  const desiredPrivate = desiredPayload?.extendedProperties?.private || {};

  return String(current?.summary || "") === String(desiredPayload?.summary || "")
    && String(current?.location || "") === String(desiredPayload?.location || "")
    && String(current?.description || "") === String(desiredPayload?.description || "")
    && String(current?.colorId || "") === String(desiredPayload?.colorId || "")
    && String(current?.start?.dateTime || "") === String(desiredPayload?.start?.dateTime || "")
    && String(current?.end?.dateTime || "") === String(desiredPayload?.end?.dateTime || "")
    && String(current?.start?.timeZone || "") === String(desiredPayload?.start?.timeZone || "")
    && String(current?.end?.timeZone || "") === String(desiredPayload?.end?.timeZone || "")
    && Boolean(current?.reminders?.useDefault) === Boolean(desiredPayload?.reminders?.useDefault)
    && String(currentPrivate.eeManaged || "") === String(desiredPrivate.eeManaged || "")
    && String(currentPrivate.eeKey || "") === String(desiredPrivate.eeKey || "")
    && String(currentPrivate.eeDate || "") === String(desiredPrivate.eeDate || "");
}

async function writeCalendarEvent(path, method, body = null) {
  const result = await googleCalendarRequest(path, {
    method,
    query: { sendUpdates: "none" },
    body,
  });
  await delay(120);
  return result;
}

async function listManagedCalendarEvents(calendarId, timeMin, timeMax) {
  let pageToken = "";
  const events = [];

  while (true) {
    const payload = await googleCalendarRequest(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      query: {
        singleEvents: true,
        orderBy: "startTime",
        timeMin,
        timeMax,
        maxResults: 2500,
        pageToken,
      },
    });

    for (const item of payload?.items || []) {
      if (item?.extendedProperties?.private?.eeManaged === "1") {
        events.push(item);
      }
    }

    if (!payload?.nextPageToken) return events;
    pageToken = payload.nextPageToken;
  }
}

async function upsertCalendarEvents(calendarId, desiredEvents, onProgress = null) {
  const sorted = [...desiredEvents].sort((left, right) => {
    if (left.startDateTime < right.startDateTime) return -1;
    if (left.startDateTime > right.startDateTime) return 1;
    return left.key.localeCompare(right.key);
  });

  if (sorted.length === 0) {
    return {
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      total: 0,
    };
  }

  const rangeStart = sorted[0].startDateTime;
  const rangeEnd = sorted[sorted.length - 1].endDateTime;
  const existing = await listManagedCalendarEvents(calendarId, rangeStart, rangeEnd);
  const existingByKey = new Map(existing.map((item) => [item?.extendedProperties?.private?.eeKey, item]));
  const desiredKeys = new Set(sorted.map((event) => event.key));
  const stats = {
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    total: sorted.length,
  };
  let processed = 0;
  let deletedProcessed = 0;

  async function reportProgress(force = false) {
    if (!onProgress) return;
    if (!force && processed % 10 !== 0) return;
    await onProgress({
      phase: "events",
      completed: processed + deletedProcessed,
      total: sorted.length + Math.max(0, existing.length - desiredKeys.size),
      created: stats.created,
      updated: stats.updated,
      deleted: stats.deleted,
      unchanged: stats.unchanged,
    });
  }

  for (const event of sorted) {
    const current = existingByKey.get(event.key);
    if (current?.id) {
      if (managedEventMatchesDesired(current, event.payload)) {
        stats.unchanged += 1;
        processed += 1;
        await reportProgress();
        continue;
      }
      await writeCalendarEvent(
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(current.id)}`,
        "PATCH",
        event.payload,
      );
      stats.updated += 1;
      processed += 1;
      await reportProgress();
      continue;
    }

    await writeCalendarEvent(
      `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      "POST",
      event.payload,
    );
    stats.created += 1;
    processed += 1;
    await reportProgress();
  }

  const deleteTargets = existing.filter((item) => {
    const key = item?.extendedProperties?.private?.eeKey;
    return Boolean(key && !desiredKeys.has(key) && item.id);
  });

  for (const item of existing) {
    const key = item?.extendedProperties?.private?.eeKey;
    if (!key || desiredKeys.has(key) || !item.id) continue;
    await writeCalendarEvent(
      `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(item.id)}`,
      "DELETE",
    );
    stats.deleted += 1;
    deletedProcessed += 1;
    await reportProgress();
  }

  if (onProgress) {
    await onProgress({
      phase: "events",
      completed: sorted.length + deleteTargets.length,
      total: sorted.length + deleteTargets.length,
      created: stats.created,
      updated: stats.updated,
      deleted: stats.deleted,
      unchanged: stats.unchanged,
    });
  }

  return stats;
}

async function clearManagedCalendarEvents() {
  const config = await getGoogleCalendarConfig();
  const baseStatus = {
    mode: config.syncMode,
    halfyearScope: config.halfyearScope,
    calendarName: config.calendarName,
  };
  const existingCalendar = config.calendarId
    ? { id: config.calendarId }
    : await findCalendarByName(config.calendarName);

  if (!existingCalendar?.id) {
    const status = {
      state: "idle",
      message: "No synced EduPage calendar events were found.",
      mode: config.syncMode,
      halfyearScope: config.halfyearScope,
      calendarName: config.calendarName,
    };
    await setGoogleCalendarStatus(status);
    return status;
  }

  if (!config.calendarId) {
    await storageSet({ [GOOGLE_CALENDAR_CALENDAR_ID_KEY]: existingCalendar.id });
  }

  const events = await listManagedCalendarEvents(
    existingCalendar.id,
    "2000-01-01T00:00:00Z",
    "2100-01-01T00:00:00Z",
  );

  await updateGoogleCalendarProgress(baseStatus, {
    phase: "clear",
    completed: 0,
    total: events.length,
  });

  let completed = 0;
  for (const item of events) {
    if (!item?.id) continue;
    await writeCalendarEvent(
      `/calendar/v3/calendars/${encodeURIComponent(existingCalendar.id)}/events/${encodeURIComponent(item.id)}`,
      "DELETE",
    );
    completed += 1;
    if (completed % 10 === 0 || completed === events.length) {
      await updateGoogleCalendarProgress(baseStatus, {
        phase: "clear",
        completed,
        total: events.length,
      });
    }
  }

  const status = {
    state: "ok",
    message: `Removed ${events.length} EduPage events from Google Calendar.`,
    mode: config.syncMode,
    halfyearScope: config.halfyearScope,
    calendarName: config.calendarName,
    lastSyncedAt: Date.now(),
  };
  await setGoogleCalendarStatus(status);
  return status;
}

async function disableGoogleCalendarSyncForClear() {
  const config = await getGoogleCalendarConfig();
  googleCalendarClearPending = true;
  await storageSet({ [GOOGLE_CALENDAR_PAUSED_KEY]: true });
  await syncGoogleCalendarAlarm();
  await setGoogleCalendarStatus({
    state: "syncing",
    message: "Stopping scheduled sync and clearing Google Calendar events...",
    mode: config.syncMode,
    halfyearScope: config.halfyearScope,
    calendarName: config.calendarName,
  });
  return config;
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

function chooseBestTemplateWeek(existingWeek, candidateWeek) {
  if (!existingWeek) return candidateWeek;

  const existingScore = countTemplateEligibleLessons(existingWeek);
  const candidateScore = countTemplateEligibleLessons(candidateWeek);
  if (candidateScore > existingScore) {
    return candidateWeek;
  }
  if (candidateScore < existingScore) {
    return existingWeek;
  }

  const existingChanged = existingWeek.lessons.filter((lesson) => lesson.changed).length;
  const candidateChanged = candidateWeek.lessons.filter((lesson) => lesson.changed).length;
  if (candidateChanged < existingChanged) {
    return candidateWeek;
  }

  return existingWeek;
}

function buildTemplateWeekMap(sampleWeeks) {
  const templateWeeks = new Map();

  for (const weekData of sampleWeeks || []) {
    if (!weekData?.weekLabel || !Array.isArray(weekData.lessons)) continue;
    const current = templateWeeks.get(weekData.weekLabel);
    templateWeeks.set(weekData.weekLabel, chooseBestTemplateWeek(current, weekData));
  }

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
    let liveWeek = await extractWeekFromHiddenTab(tab.id, 0);
    liveWeek.config = config;
    const today = new Date();
    const liveWeekEnd = parseDateOnly(liveWeek.dayHeaders[liveWeek.dayHeaders.length - 1]?.date);
    if (isWeekend(today) && liveWeekEnd && liveWeekEnd < today) {
      liveWeek = await extractWeekFromHiddenTab(tab.id, 1);
      liveWeek.config = config;
    }

    let adjacentWeek = null;
    const templateSampleWeeks = [cloneWeekData(liveWeek)];
    if (config.syncMode === "halfyear") {
      adjacentWeek = await extractWeekFromHiddenTab(tab.id, 1);
      if (adjacentWeek) {
        adjacentWeek.config = config;
        templateSampleWeeks.push(cloneWeekData(adjacentWeek));
      }

      for (let index = 0; index < 2; index += 1) {
        const extraWeek = await extractWeekFromHiddenTab(tab.id, 1);
        if (!extraWeek) break;
        extraWeek.config = config;
        templateSampleWeeks.push(cloneWeekData(extraWeek));
      }
    }

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

async function performGoogleCalendarSync({ source = "background" } = {}) {
  if (googleCalendarClearPending) {
    const config = await getGoogleCalendarConfig();
    return {
      state: "idle",
      message: "Google Calendar sync is paused while events are being cleared.",
      mode: config.syncMode,
      halfyearScope: config.halfyearScope,
      calendarName: config.calendarName,
    };
  }

  const config = await getGoogleCalendarConfig();
  if (!config.enabled) {
    return {
      state: "idle",
      message: "Google Calendar sync is disabled.",
      mode: config.syncMode,
      halfyearScope: config.halfyearScope,
      calendarName: config.calendarName,
    };
  }
  if (config.paused) {
    return {
      state: "idle",
      message: "Google Calendar auto-sync is paused. Click Sync Now to resume.",
      mode: config.syncMode,
      halfyearScope: config.halfyearScope,
      calendarName: config.calendarName,
    };
  }
  if (!config.clientId) {
    throw new Error("Paste a Google OAuth Client ID in Settings first.");
  }

  const baseStatus = {
    mode: config.syncMode,
    halfyearScope: config.halfyearScope,
    calendarName: config.calendarName,
  };

  await setGoogleCalendarStatus({
    state: "syncing",
    message: source === "manual" ? "Syncing EduPage timetable to Google Calendar..." : "Background sync in progress...",
    ...baseStatus,
  });

  await updateGoogleCalendarProgress(baseStatus, { phase: "prepare" });
  const {
    liveWeek,
    adjacentWeek,
    templateSampleWeeks,
    fromCache,
  } = await collectLiveEdupageWeek(config);
  if (!liveWeek?.lessons?.length) {
    throw new Error("EduPage did not return any lessons for the selected week.");
  }

  liveWeek.config = {
    ...config,
    templateSampleWeeks,
  };
  if (adjacentWeek) {
    adjacentWeek.config = liveWeek.config;
  }

  await updateGoogleCalendarProgress(baseStatus, { phase: "calendar" });
  const calendarId = await ensureManagedGoogleCalendar(config);
  const desiredEvents = config.syncMode === "halfyear"
    ? buildHalfyearDesiredEvents(liveWeek, adjacentWeek)
    : buildWeeklyDesiredEvents(liveWeek);

  const syncStats = await upsertCalendarEvents(calendarId, desiredEvents, async (progress) => {
    await updateGoogleCalendarProgress(baseStatus, progress);
  });

  const status = {
    state: "ok",
    message: `Synced ${desiredEvents.length} timetable events to Google Calendar. Created ${syncStats.created}, updated ${syncStats.updated}, removed ${syncStats.deleted}.${fromCache ? " Used cached timetable data." : ""}`,
    mode: config.syncMode,
    halfyearScope: config.halfyearScope,
    calendarName: config.calendarName,
    lastSyncedAt: Date.now(),
    liveWeekLabel: liveWeek.weekLabel,
  };
  await setGoogleCalendarStatus(status);
  return status;
}

async function connectGoogleCalendar(message) {
  const clientId = String(message?.clientId || "").trim();
  const clientSecret = String(message?.clientSecret || "").trim();
  if (!clientId) {
    throw new Error("Google OAuth Client ID is required.");
  }
  if (!clientSecret) {
    throw new Error("Google OAuth Client Secret is required.");
  }

  await storageSet({
    [GOOGLE_CALENDAR_CLIENT_ID_KEY]: clientId,
    [GOOGLE_CALENDAR_CLIENT_SECRET_KEY]: clientSecret,
    [GOOGLE_CALENDAR_NAME_KEY]: normalizeGoogleCalendarName(message?.calendarName),
  });

  const redirectUri = getGoogleAuthRedirectUri();
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  let redirectResponse = "";
  try {
    redirectResponse = await launchWebAuthFlow(authUrl.toString());
  } catch (error) {
    throw formatGoogleConnectError(error, redirectUri);
  }
  const code = parseRedirectCode(redirectResponse);
  const tokens = await exchangeGoogleAuthCode({
    clientId,
    clientSecret,
    code,
    codeVerifier,
    redirectUri,
  });

  await storageSet({
    [GOOGLE_CALENDAR_TOKENS_KEY]: tokens,
    [GOOGLE_CALENDAR_ENABLED_KEY]: true,
    [GOOGLE_CALENDAR_PAUSED_KEY]: false,
  });
  await syncGoogleCalendarAlarm();

  const status = {
    state: "connected",
    message: "Google Calendar connected. Run Sync Now after opening EduPage once.",
    mode: normalizeGoogleCalendarSyncMode(message?.syncMode),
    halfyearScope: normalizeGoogleCalendarHalfyearScope(message?.halfyearScope),
    calendarName: normalizeGoogleCalendarName(message?.calendarName),
  };
  await setGoogleCalendarStatus(status);
  return status;
}

async function disconnectGoogleCalendar() {
  await storageRemove([
    GOOGLE_CALENDAR_TOKENS_KEY,
    GOOGLE_CALENDAR_CALENDAR_ID_KEY,
  ]);
  const config = await getGoogleCalendarConfig();
  await storageSet({
    [GOOGLE_CALENDAR_ENABLED_KEY]: false,
    [GOOGLE_CALENDAR_PAUSED_KEY]: false,
  });
  await syncGoogleCalendarAlarm();
  const status = {
    state: "idle",
    message: "Google Calendar disconnected.",
    mode: config.syncMode,
    halfyearScope: config.halfyearScope,
    calendarName: config.calendarName,
  };
  await setGoogleCalendarStatus(status);
  return status;
}

chrome.runtime.onInstalled.addListener(() => {
  syncUpdateAlarm().then((enabled) => {
    if (enabled) {
      checkForUpdates({ notify: true });
    }
  });
  syncGoogleCalendarAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  syncUpdateAlarm().then((enabled) => {
    if (enabled) {
      checkForUpdates({ notify: true });
    }
  });
  syncGoogleCalendarAlarm();
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

  if (alarm.name === GOOGLE_CALENDAR_SYNC_ALARM_NAME) {
    enqueueGoogleCalendarJob(() => performGoogleCalendarSync({ source: "background" })).catch(async (error) => {
      const config = await getGoogleCalendarConfig();
      await setGoogleCalendarStatus({
        state: "error",
        message: error?.message || "Google Calendar sync failed.",
        mode: config.syncMode,
        halfyearScope: config.halfyearScope,
        calendarName: config.calendarName,
      });
    });
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

  if (
    changes[GOOGLE_CALENDAR_ENABLED_KEY]
    || changes[GOOGLE_CALENDAR_PAUSED_KEY]
    || changes[GOOGLE_CALENDAR_SYNC_INTERVAL_KEY]
    || changes[GOOGLE_CALENDAR_SYNC_MODE_KEY]
    || changes[GOOGLE_CALENDAR_NAME_KEY]
  ) {
    syncGoogleCalendarAlarm();
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

  if (message?.type === "ee-open-repo") {
    openRepository();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "ee-google-calendar-page-context") {
    if (sender.frameId === 0 && typeof message.origin === "string" && message.origin.startsWith("https://")) {
      storageSet({
        [GOOGLE_CALENDAR_LAST_ORIGIN_KEY]: message.origin,
      }).then(() => sendResponse({ ok: true }));
      return true;
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "ee-google-calendar-connect") {
    connectGoogleCalendar(message)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || "Google Calendar connect failed.",
      }));
    return true;
  }

  if (message?.type === "ee-google-calendar-disconnect") {
    disconnectGoogleCalendar()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || "Google Calendar disconnect failed.",
      }));
    return true;
  }

  if (message?.type === "ee-google-calendar-clear-events") {
    disableGoogleCalendarSyncForClear()
      .then(() => enqueueGoogleCalendarJob(async () => {
        try {
          return await clearManagedCalendarEvents();
        } finally {
          googleCalendarClearPending = false;
        }
      }))
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || "Could not clear Google Calendar events.",
      }));
    return true;
  }

  if (message?.type === "ee-google-calendar-sync-now") {
    storageSet({ [GOOGLE_CALENDAR_PAUSED_KEY]: false })
      .then(() => syncGoogleCalendarAlarm())
      .then(() => enqueueGoogleCalendarJob(() => performGoogleCalendarSync({ source: "manual" })))
      .then((status) => sendResponse({ ok: true, status }))
      .catch(async (error) => {
        const config = await getGoogleCalendarConfig();
        const status = {
          state: "error",
          message: error?.message || "Google Calendar sync failed.",
          mode: config.syncMode,
          halfyearScope: config.halfyearScope,
          calendarName: config.calendarName,
        };
        await setGoogleCalendarStatus(status);
        sendResponse({ ok: false, error: status.message, status });
      });
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
