// Applies the cached theme before the larger page enhancers are parsed. The
// authoritative content.js initialization immediately reconciles this with
// chrome.storage, so a stale or unavailable cache can only affect first paint.
(() => {
  const cacheKey = "eeThemeCacheV1";
  const backgrounds = {
    dark: "#0c1220",
    ocean: "#071a1f",
    forest: "#11170f",
    emerald: "#071a12",
    pink: "#fff5fa",
    purple: "#180b35",
  };

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    const theme = EE.normalizeTheme(cached?.theme);
    if (!cached?.darkModeEnabled || theme === "light" || /^\/login(?:\/|$)/i.test(location.pathname)) return;

    const customTheme = EE.normalizeCustomTheme(cached.customTheme);
    const customIsLight = theme === "custom" && luminance(customTheme.bgBase) > 0.5;
    const root = document.documentElement;
    root.classList.add("ee-dark", `ee-theme-${theme}`);
    root.classList.toggle("ee-hide-page-heroes", cached.hidePageHeroesEnabled === true);
    root.classList.toggle("ee-hide-personal-info", cached.hidePersonalInfoEnabled === true);
    root.classList.toggle("ee-hide-likes", cached.hideLikesEnabled === true);
    root.classList.toggle("ee-hide-edupage-help", cached.hideEdupageHelpEnabled === true);
    root.classList.toggle("ee-hide-home-educational-games", cached.hideEducationalGamesEnabled === true);
    root.classList.toggle("ee-hide-home-test-yourself", cached.hideTestYourselfEnabled === true);
    root.classList.toggle("ee-hide-home-blackboards", cached.hideInteractiveBlackboardsEnabled === true);
    root.classList.toggle("ee-hide-home-photos", cached.hidePhotosEnabled === true);
    root.classList.toggle("ee-hide-home-registration-surveys", cached.hideRegistrationSurveysEnabled === true);
    root.classList.toggle("ee-scheme-dark", theme !== "pink" && !customIsLight);
    root.dataset.eeTheme = theme;
    root.style.backgroundColor = theme === "custom" ? customTheme.bgBase : backgrounds[theme];

    if (theme === "custom") {
      root.style.setProperty("--ee-custom-bg-base", customTheme.bgBase);
      root.style.setProperty("--ee-custom-bg-raised", customTheme.bgRaised);
      root.style.setProperty("--ee-custom-bg-elevated", customTheme.bgElevated);
      root.style.setProperty("--ee-custom-bg-muted", customTheme.bgMuted);
      root.style.setProperty("--ee-custom-border", customTheme.border);
      root.style.setProperty("--ee-custom-text-main", customTheme.textMain);
      root.style.setProperty("--ee-custom-text-muted", customTheme.textMuted);
      root.style.setProperty("--ee-custom-accent", customTheme.accent);
      root.style.setProperty("--ee-custom-warning", customTheme.warning);
      root.style.setProperty("--ee-custom-danger", customTheme.danger);
      root.style.setProperty("--ee-custom-table-header-bg", customTheme.tableHeaderBg);
    }
  } catch {
    // No usable cache: content.js will apply the stored settings normally.
  }

  function luminance(hex) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!match) return 0;
    const channels = match[1].match(/../g).map((part) => Number.parseInt(part, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  }
})();
