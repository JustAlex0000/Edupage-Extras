/* User-selected sites for the experimental Stay Active Mode. */
(function () {
  "use strict";
  const form = document.getElementById("ee-activity-sites-form");
  const input = document.getElementById("ee-activity-sites-input");
  const list = document.getElementById("ee-activity-sites-list");
  const status = document.getElementById("ee-activity-sites-status");
  if (!form || !input || !list || !status) return;

  const KEY = "eeActivityShieldSites";
  const sharedPermissions = new Set([
    "http://127.0.0.1/*", "http://localhost/*", "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*", "https://integrate.api.nvidia.com/*",
    "https://openrouter.ai/*",
  ]);
  const msg = (key) => window.eeI18n.msg(key);
  let sites = [];
  let busy = true;

  function parseSite(value) {
    let address = value.trim();
    if (!address) return null;
    if (!address.includes("://")) address = `https://${address}`;
    let url;
    try { url = new URL(address); } catch (_) { return null; }
    const authority = address.match(/^[a-z]+:\/\/([^/?#]*)/i)?.[1] || "";
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
        || /:\d+$/.test(authority) || url.port || !/^[a-z0-9.-]+$/i.test(url.hostname)
        || !url.hostname || url.hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
    if (url.protocol === "https:" && (url.hostname === "edupage.org" || url.hostname.endsWith(".edupage.org") || url.hostname === "test.nop.wtf")) return "builtin";
    return `${url.protocol}//${url.hostname}/*`;
  }

  function render() {
    form.querySelector("button").disabled = busy;
    list.replaceChildren();
    sites.forEach((site) => {
      const row = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = site.slice(0, -2);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary-button";
      remove.textContent = msg("samSitesRemove");
      remove.setAttribute("aria-label", `${msg("samSitesRemove")} ${label.textContent}`);
      remove.disabled = busy;
      remove.addEventListener("click", () => removeSite(site));
      row.append(label, remove);
      list.append(row);
    });
  }

  function sync() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "ee-activity-sites-sync" }, (result) => {
          resolve(!chrome.runtime.lastError && result?.ok === true);
        });
      } catch (_) { resolve(false); }
    });
  }

  function save(next) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEY]: next }, () => resolve(!chrome.runtime.lastError));
    });
  }

  async function removeSite(site) {
    if (busy) return;
    busy = true;
    render();
    const next = sites.filter((item) => item !== site);
    if (!await save(next)) {
      status.textContent = msg("samSitesSaveFailed");
    } else {
      sites = next;
      const synced = await sync();
      let released = true;
      if (!sharedPermissions.has(site) && chrome.permissions?.remove) {
        released = await new Promise((resolve) => chrome.permissions.remove({ origins: [site] }, (ok) => resolve(!chrome.runtime.lastError && ok)));
      }
      status.textContent = msg(!synced ? "samSitesSyncFailed" : !released ? "samSitesPermissionRetained" : "samSitesRemoved");
    }
    busy = false;
    render();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const site = parseSite(input.value);
    if (!site) { status.textContent = msg("samSitesInvalid"); return; }
    if (site === "builtin") { status.textContent = msg("samSitesBuiltin"); return; }
    if (!chrome.permissions?.request) { status.textContent = msg("samSitesPermissionUnavailable"); return; }
    busy = true;
    render();
    // The request must happen directly in the submit gesture, before any await.
    chrome.permissions.request({ origins: [site] }, async (granted) => {
      if (chrome.runtime.lastError || !granted) {
        status.textContent = msg("samSitesDenied");
      } else {
        const next = sites.includes(site) ? sites : [...sites, site];
        if (!await save(next)) {
          status.textContent = msg("samSitesSaveFailed");
        } else {
          sites = next;
          input.value = "";
          status.textContent = msg(await sync() ? "samSitesAdded" : "samSitesSyncFailed");
        }
      }
      busy = false;
      render();
    });
  });

  chrome.storage.local.get({ [KEY]: [] }, (result) => {
    if (chrome.runtime.lastError) status.textContent = msg("samSitesSaveFailed");
    else sites = Array.isArray(result[KEY]) ? result[KEY].filter((item) => typeof item === "string") : [];
    busy = false;
    render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY] && Array.isArray(changes[KEY].newValue)) {
      sites = changes[KEY].newValue.filter((item) => typeof item === "string");
      render();
    }
  });
}());
