const toggle = document.getElementById("DarkModeCheckbox");
const settingsButton = document.getElementById("SettingsButton");
const menuVersion = document.getElementById("MenuVersion");
if (menuVersion) {
	menuVersion.textContent = chrome.runtime.getManifest().version;
}
const updateNotice = document.getElementById("UpdateNotice");
const updateNoticeText = document.getElementById("UpdateNoticeText");
const openUpdateButton = document.getElementById("OpenUpdateButton");
const STORAGE_KEY = "darkModeEnabled";
const THEME_KEY = "themeMode";
const CUSTOM_THEME_KEY = "customThemeColors";
const CLEAN_UI_KEY = "cleanUiEnabled";
const HIDE_HELP_TEXT_KEY = "hideHelpTextEnabled";
const MOBILE_RESPONSIVE_KEY = "eeMobileResponsiveEnabled";
const ROZVRH_ROOM_CHANGE_COLOR_KEY = "eeRozvrhRoomChangeColor";
const ROZVRH_SUBSTITUTION_COLOR_KEY = "eeRozvrhSubstitutionColor";
const UPDATE_STATUS_KEY = "eeUpdateStatus";
const REPO_URL = "https://github.com/Alexosavrua/Edupage-Extras";
const THEMES = ["dark", "ocean", "forest", "emerald", "pink", "purple", "custom", "light"];
const DEFAULT_CUSTOM_THEME = {
	bgBase: "#11111b",
	bgRaised: "#181825",
	bgElevated: "#1e1e2e",
	bgMuted: "#2a2b3d",
	border: "#313244",
	textMain: "#cdd6f4",
	textMuted: "#a6adc8",
	accent: "#89b4fa",
	warning: "#fab387",
	danger: "#f38ba8",
};

let customTheme = { ...DEFAULT_CUSTOM_THEME };

function normalizeTheme(theme) {
	return THEMES.includes(theme) ? theme : "dark";
}

function normalizeColor(value, fallback) {
	return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function normalizeCustomTheme(theme) {
	return Object.fromEntries(
		Object.entries(DEFAULT_CUSTOM_THEME).map(([key, fallback]) => [
			key,
			normalizeColor(theme?.[key], fallback),
		]),
	);
}

function applyCustomThemeVariables(theme) {
	const colors = normalizeCustomTheme(theme);
	const root = document.documentElement;
	root.style.setProperty("--custom-page-bg", colors.bgBase);
	root.style.setProperty("--custom-surface-bg", colors.bgRaised);
	root.style.setProperty("--custom-control-bg", colors.bgElevated);
	root.style.setProperty("--custom-border-color", colors.border);
	root.style.setProperty("--custom-text-main", colors.textMain);
	root.style.setProperty("--custom-text-muted", colors.textMuted);
	root.style.setProperty("--custom-accent-color", colors.accent);
}

function applyMenuTheme(theme, darkModeEnabled = false, colors = customTheme) {
	applyCustomThemeVariables(colors);
	document.documentElement.dataset.theme = darkModeEnabled ? normalizeTheme(theme) : "light";
}

function renderUpdateNotice(status) {
	// The stored status is a snapshot from whenever checkForUpdates() last ran in
	// the background — if this extension has been reloaded/updated since then
	// (e.g. right after pulling a new unpacked version), status.localVersion is
	// stale and would show the OLD version as "downloaded" even though we're
	// already running the new one. Never trust it blindly: compare against the
	// live manifest version, and if they disagree, treat the cached status as
	// unusable (hide the notice) and ask the background to recheck silently so
	// it self-heals instead of showing wrong numbers indefinitely.
	const liveVersion = chrome.runtime.getManifest().version;
	if (!status || status.localVersion !== liveVersion) {
		updateNotice.hidden = true;
		chrome.runtime.sendMessage({ type: "ee-check-update", notify: false }, (response) => {
			void chrome.runtime.lastError;
			if (response?.ok) renderUpdateNotice(response.status);
		});
		return;
	}

	const visible = status.updateAvailable && status.latestVersion;
	updateNotice.hidden = !visible;
	if (visible) {
		updateNoticeText.textContent = window.eeI18n.msg("menuUpdateNotice", [
			String(status.localVersion),
			String(status.latestVersion),
		]);
	}
}

chrome.storage.local.get([STORAGE_KEY, THEME_KEY, CUSTOM_THEME_KEY, UPDATE_STATUS_KEY], (result) => {
	const enabled = result[STORAGE_KEY] === true;
	customTheme = normalizeCustomTheme(result[CUSTOM_THEME_KEY]);
	toggle.checked = enabled;
	applyMenuTheme(result[THEME_KEY], enabled, customTheme);
	renderUpdateNotice(result[UPDATE_STATUS_KEY]);
});

toggle.addEventListener("change", () => {
	const enabled = toggle.checked;
	chrome.storage.local.set({ [STORAGE_KEY]: enabled });

	chrome.storage.local.get([THEME_KEY, CUSTOM_THEME_KEY, CLEAN_UI_KEY, HIDE_HELP_TEXT_KEY, MOBILE_RESPONSIVE_KEY, ROZVRH_ROOM_CHANGE_COLOR_KEY, ROZVRH_SUBSTITUTION_COLOR_KEY], (result) => {
		customTheme = normalizeCustomTheme(result[CUSTOM_THEME_KEY]);
		applyMenuTheme(result[THEME_KEY], enabled, customTheme);
		chrome.tabs.query({ url: "*://*.edupage.org/*" }, (tabs) => {
			tabs.forEach((tab) => {
				if (tab.id) {
					chrome.tabs.sendMessage(tab.id, {
						type: "ee-set-theme",
						darkModeEnabled: enabled,
						theme: result[THEME_KEY] || "dark",
						customTheme,
						cleanUiEnabled: result[CLEAN_UI_KEY] === true,
						hideHelpTextEnabled: result[HIDE_HELP_TEXT_KEY] === true,
						mobileResponsiveEnabled: result[MOBILE_RESPONSIVE_KEY] === true,
						rozvrhRoomChangeColor: result[ROZVRH_ROOM_CHANGE_COLOR_KEY],
						rozvrhSubstitutionColor: result[ROZVRH_SUBSTITUTION_COLOR_KEY],
					}, () => {
						void chrome.runtime.lastError;
					});
				}
			});
		});
	});
});

settingsButton.addEventListener("click", () => {
	chrome.runtime.openOptionsPage();
});

openUpdateButton.addEventListener("click", () => {
	chrome.tabs.create({ url: REPO_URL });
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (changes[UPDATE_STATUS_KEY]) {
		renderUpdateNotice(changes[UPDATE_STATUS_KEY].newValue);
	}
	if (changes[CUSTOM_THEME_KEY] || changes[THEME_KEY] || changes[STORAGE_KEY]) {
		chrome.storage.local.get([STORAGE_KEY, THEME_KEY, CUSTOM_THEME_KEY], (result) => {
			customTheme = normalizeCustomTheme(result[CUSTOM_THEME_KEY]);
			applyMenuTheme(result[THEME_KEY], result[STORAGE_KEY] === true, customTheme);
		});
	}
});
