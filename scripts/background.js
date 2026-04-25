const UPDATE_ALARM_NAME = "ee-update-check";
const UPDATE_STATUS_KEY = "eeUpdateStatus";
const UPDATE_REMINDER_ENABLED_KEY = "eeUpdateReminderEnabled";
const UPDATE_LAST_NOTIFIED_KEY = "eeUpdateLastNotifiedVersion";
const ACTIVITY_SHIELD_ENABLED_KEY = "eeActivityShieldEnabled";
const TOGGLE_ACTIVITY_SHIELD_COMMAND = "toggle-stay-active-mode";
const REPO_URL = "https://github.com/Alexosavrua/Edupage-Extras";
const UPDATE_MANIFEST_URLS = [
  "https://raw.githubusercontent.com/Alexosavrua/Edupage-Extras/main/manifest.json",
  "https://raw.githubusercontent.com/Alexosavrua/Edupage-Extras/master/manifest.json",
];

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

function alarmClear(name) {
  return new Promise((resolve) => {
    chrome.alarms.clear(name, resolve);
  });
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
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[UPDATE_REMINDER_ENABLED_KEY]) return;
  syncUpdateAlarm().then((enabled) => {
    if (enabled) {
      checkForUpdates({ notify: true });
    }
  });
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
