// Extension-wide language preference. Catalogs are read only from this package.
(() => {
  "use strict";
  const KEY = "eeLanguage", LANGUAGES = ["en", "sk", "cs"];
  const background = globalThis.__eeBackgroundContext === true || typeof document === "undefined";
  const catalogs = new Map(), subscribers = new Set();
  let preference = "auto", locale = browserLocale(), selected = null, english = null, revision = 0;
  const normalize = value => LANGUAGES.includes(value) ? value : "auto";
  function browserLocale() {
    const language = String(chrome.i18n.getUILanguage?.() || "en").toLowerCase().split(/[-_]/)[0];
    return LANGUAGES.includes(language) ? language : "en";
  }
  function readCatalog(language) {
    if (!LANGUAGES.includes(language)) return Promise.reject(new Error("Unsupported language"));
    if (!catalogs.has(language)) {
      const pending = background
        ? fetch(chrome.runtime.getURL(`_locales/${language}/messages.json`)).then(response => {
          if (!response.ok) throw new Error("Could not load language");
          return response.json();
        })
        : new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "ee-language-catalog", language }, response => {
          if (chrome.runtime.lastError || !response?.ok) reject(new Error("Could not load language"));
          else resolve(response.catalog);
        }));
      catalogs.set(language, pending.catch(error => { catalogs.delete(language); throw error; }));
    }
    return catalogs.get(language);
  }
  // Content scripts cannot fetch private extension resources directly. The worker
  // serves only the three bundled catalogs, never a caller-provided path or URL.
  if (background) chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "ee-language-catalog") return false;
    if ((sender.id && sender.id !== chrome.runtime.id) || !LANGUAGES.includes(message.language)) {
      sendResponse({ ok: false }); return false;
    }
    readCatalog(message.language).then(catalog => sendResponse({ ok: true, catalog }), () => sendResponse({ ok: false }));
    return true;
  });
  function format(entry, substitutions) {
    const values = substitutions == null ? [] : [].concat(substitutions);
    const placeholders = Object.fromEntries(Object.entries(entry.placeholders || {}).map(([key, value]) => [key.toLowerCase(), value.content]));
    const substitute = text => String(text).replace(/\$\$|\$(\d+)/g, (match, index) => match === "$$" ? "$" : String(values[Number(index) - 1] ?? ""));
    return String(entry.message).replace(/\$\$|\$([a-zA-Z_][\w]*)\$|\$(\d+)/g, (match, name, index) => {
      if (match === "$$") return "$";
      if (index) return String(values[Number(index) - 1] ?? "");
      return placeholders[name.toLowerCase()] === undefined ? match : substitute(placeholders[name.toLowerCase()]);
    });
  }
  function msg(key, substitutions) {
    const entry = selected?.[key] || english?.[key];
    return entry?.message != null ? format(entry, substitutions) : chrome.i18n.getMessage(key, substitutions);
  }
  async function apply(value) {
    const version = ++revision, nextPreference = normalize(value);
    const language = nextPreference === "auto" ? browserLocale() : nextPreference;
    const [base, translated] = await Promise.all([readCatalog("en"), readCatalog(language)]);
    if (version !== revision) return;
    preference = nextPreference; locale = language; english = base; selected = translated;
    for (const callback of subscribers) callback();
  }
  const ready = new Promise(resolve => chrome.storage.local.get({ [KEY]: "auto" }, values => {
    const value = chrome.runtime.lastError ? "auto" : values[KEY];
    apply(value).catch(() => { preference = "auto"; locale = browserLocale(); }).finally(resolve);
  }));
  EE.i18n = {
    ready, msg, normalize, languages: LANGUAGES,
    get preference() { return preference; },
    get locale() { return locale; },
    subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    async setPreference(value) {
      const next = normalize(value);
      // Load before saving so an unavailable catalog cannot leave a broken preference.
      await Promise.all([readCatalog("en"), readCatalog(next === "auto" ? browserLocale() : next)]);
      await new Promise((resolve, reject) => chrome.storage.local.set({ [KEY]: next }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve();
      }));
      await apply(next);
    },
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) apply(changes[KEY].newValue).catch(() => {});
  });
})();
