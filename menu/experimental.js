const backButton = document.getElementById("BackButton");
const resetButton = document.getElementById("ResetActivityShieldButton");
const reloadTabsButton = document.getElementById("ReloadEdupageTabsButton");
const openShortcutSettingsButton = document.getElementById("OpenShortcutSettingsButton");
const activityShieldShortcutStatus = document.getElementById("ActivityShieldShortcutStatus");
const saveStatus = document.getElementById("SaveStatus");
const ACTIVITY_SHIELD_COMMAND = "toggle-stay-active-mode";
const THEME_KEY = "themeMode";
const DARK_MODE_KEY = "darkModeEnabled";
const CUSTOM_THEME_KEY = "customThemeColors";
const THEMES = ["dark", "ocean", "forest", "emerald", "pink", "purple", "custom", "light"];
const DEFAULT_CUSTOM_THEME = {
	bgBase: "#11111b",
	bgRaised: "#181825",
	bgElevated: "#1e1e2e",
	border: "#313244",
	textMain: "#cdd6f4",
	textMuted: "#a6adc8",
	accent: "#89b4fa",
	danger: "#f38ba8",
};

const settings = [
	["ActivityShieldEnabled", "eeActivityShieldEnabled"],
	["ActivityVisibilityState", "eeActivityShieldVisibilityState"],
	["ActivityHidden", "eeActivityShieldHidden"],
	["ActivityVisibilityEvents", "eeActivityShieldVisibilityEvents"],
	["ActivityFocus", "eeActivityShieldFocus"],
	["ActivityBlur", "eeActivityShieldBlur"],
	["ActivityRedirect", "eeActivityShieldRedirect"],
	["ActivityMouseleave", "eeActivityShieldMouseleave"],
	["ActivityMouseout", "eeActivityShieldMouseout"],
	["ActivityPointercapture", "eeActivityShieldPointercapture"],
	["ActivityClipboard", "eeActivityShieldClipboard"],
	["ActivityAnimationFrame", "eeActivityShieldAnimationFrame"],
	["ActivityVisualIndicator", "eeActivityShieldVisualIndicator"],
	["ActivityLog", "eeActivityShieldLog"],
];

const defaults = {
	eeActivityShieldEnabled: false,
	eeActivityShieldVisibilityState: true,
	eeActivityShieldHidden: true,
	eeActivityShieldVisibilityEvents: true,
	eeActivityShieldFocus: true,
	eeActivityShieldBlur: true,
	eeActivityShieldRedirect: true,
	eeActivityShieldMouseleave: true,
	eeActivityShieldMouseout: true,
	eeActivityShieldPointercapture: true,
	eeActivityShieldClipboard: true,
	eeActivityShieldAnimationFrame: true,
	eeActivityShieldVisualIndicator: false,
	eeActivityShieldLog: false,
};

const storageKeys = Object.keys(defaults);
const controlledSettings = settings.filter(([elementId]) => elementId !== "ActivityShieldEnabled");

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
	root.style.setProperty("--custom-danger-color", colors.danger);
}

function applyExperimentalTheme(theme, darkModeEnabled = false, customTheme = DEFAULT_CUSTOM_THEME) {
	applyCustomThemeVariables(customTheme);
	document.documentElement.dataset.theme = darkModeEnabled ? normalizeTheme(theme) : "light";
}

backButton.addEventListener("click", () => {
	window.location.href = "settings.html";
});

function setStatus(message, isError = false) {
	saveStatus.textContent = message;
	saveStatus.style.color = isError ? "var(--danger-color)" : "var(--accent-color)";
	window.clearTimeout(setStatus.timer);
	setStatus.timer = window.setTimeout(() => {
		saveStatus.textContent = "";
	}, 2200);
}

function renderShortcutStatus() {
	if (!chrome.commands?.getAll) {
		activityShieldShortcutStatus.textContent = "Shortcut status unavailable in this browser.";
		return;
	}

	chrome.commands.getAll((commands) => {
		const command = commands.find((entry) => entry.name === ACTIVITY_SHIELD_COMMAND);
		const shortcut = command?.shortcut?.trim();
		activityShieldShortcutStatus.textContent = shortcut
			? `Current hotkey: ${shortcut}`
			: "No hotkey assigned.";
	});
}

function render(result) {
	settings.forEach(([elementId, key]) => {
		const element = document.getElementById(elementId);
		if (element) {
			element.checked = result[key];
		}
	});
	updateDependentControls();
}

function updateDependentControls() {
	const enabled = document.getElementById("ActivityShieldEnabled")?.checked === true;
	controlledSettings.forEach(([elementId]) => {
		const element = document.getElementById(elementId);
		if (element) {
			element.disabled = !enabled;
		}
	});
}

function saveCheckbox(elementId, key) {
	const element = document.getElementById(elementId);
	if (!element) return;

	element.addEventListener("change", () => {
		chrome.storage.local.set({ [key]: element.checked }, () => {
			if (elementId === "ActivityShieldEnabled") {
				updateDependentControls();
			}
			setStatus("Saved");
		});
	});
}

settings.forEach(([elementId, key]) => saveCheckbox(elementId, key));

resetButton.addEventListener("click", () => {
	chrome.storage.local.remove("eeActivityShieldPolicies", () => {
		chrome.storage.local.set(defaults, () => {
			render(defaults);
			setStatus("Reset");
		});
	});
});

reloadTabsButton.addEventListener("click", () => {
	chrome.tabs.query({ url: "*://*.edupage.org/*" }, (tabs) => {
		tabs.forEach((tab) => {
			if (tab.id) {
				chrome.tabs.reload(tab.id);
			}
		});
		setStatus(tabs.length ? "Edupage tabs reloaded" : "No Edupage tabs open");
	});
});

openShortcutSettingsButton.addEventListener("click", () => {
	chrome.tabs.create({ url: "chrome://extensions/shortcuts" }, () => {
		if (chrome.runtime.lastError) {
			setStatus("Could not open shortcut settings", true);
			return;
		}
		setStatus("Shortcut settings opened");
	});
});

chrome.storage.local.get(defaults, render);
chrome.storage.local.get([THEME_KEY, DARK_MODE_KEY, CUSTOM_THEME_KEY], (result) => {
	applyExperimentalTheme(result[THEME_KEY], result[DARK_MODE_KEY] === true, result[CUSTOM_THEME_KEY]);
});
renderShortcutStatus();
window.addEventListener("focus", renderShortcutStatus);

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (changes[THEME_KEY] || changes[DARK_MODE_KEY] || changes[CUSTOM_THEME_KEY]) {
		chrome.storage.local.get([THEME_KEY, DARK_MODE_KEY, CUSTOM_THEME_KEY], (result) => {
			applyExperimentalTheme(result[THEME_KEY], result[DARK_MODE_KEY] === true, result[CUSTOM_THEME_KEY]);
		});
	}
	if (storageKeys.some((key) => changes[key])) {
		chrome.storage.local.get(defaults, render);
	}
});
