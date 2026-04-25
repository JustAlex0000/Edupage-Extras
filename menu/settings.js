const toggle = document.getElementById("DarkModeCheckbox");
const themeSelect = document.getElementById("ThemeSelect");
const cleanUiToggle = document.getElementById("CleanUiCheckbox");
const hideHelpTextToggle = document.getElementById("HideHelpTextCheckbox");
const gradeBadgesToggle = document.getElementById("GradeBadgesCheckbox");
const gradesAttendanceToggle = document.getElementById("GradesAttendanceCheckbox");
const gradesAttendanceDebugToggle = document.getElementById("GradesAttendanceDebugCheckbox");
const attendancePercentagesToggle = document.getElementById("AttendancePercentagesCheckbox");
const halfyearStartInput = document.getElementById("HalfyearStartDateInput");
const resetHalfyearStartButton = document.getElementById("ResetHalfyearStartDateButton");
const experimentalSettingsButton = document.getElementById("ExperimentalSettingsButton");
const customThemePanel = document.getElementById("CustomThemePanel");
const customThemeImport = document.getElementById("CustomThemeImport");
const exportCustomThemeButton = document.getElementById("ExportCustomThemeButton");
const importCustomThemeButton = document.getElementById("ImportCustomThemeButton");
const resetCustomThemeButton = document.getElementById("ResetCustomThemeButton");
const customThemeStatus = document.getElementById("CustomThemeStatus");
const updateReminderToggle = document.getElementById("UpdateReminderCheckbox");
const checkUpdatesButton = document.getElementById("CheckUpdatesButton");
const openRepositoryButton = document.getElementById("OpenRepositoryButton");
const updateStatusText = document.getElementById("UpdateStatusText");
const STORAGE_KEY = "darkModeEnabled";
const THEME_KEY = "themeMode";
const CUSTOM_THEME_KEY = "customThemeColors";
const CLEAN_UI_KEY = "cleanUiEnabled";
const HIDE_HELP_TEXT_KEY = "hideHelpTextEnabled";
const GRADE_BADGES_KEY = "gradeBadgesEnabled";
const GRADES_ATTENDANCE_KEY = "gradesAttendanceStatsEnabled";
const GRADES_ATTENDANCE_DEBUG_KEY = "gradesAttendanceDebugEnabled";
const ATTENDANCE_PERCENTAGES_KEY = "attendancePercentagesEnabled";
const HALFYEAR_START_KEY = "eeHalfyearStartDate";
const GRADES_ATTENDANCE_CACHE_KEY = "eeGradesAttendanceStatsCache";
const UPDATE_STATUS_KEY = "eeUpdateStatus";
const UPDATE_REMINDER_ENABLED_KEY = "eeUpdateReminderEnabled";
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
const customInputs = {
	bgBase: document.getElementById("CustomBgBase"),
	bgRaised: document.getElementById("CustomBgRaised"),
	bgElevated: document.getElementById("CustomBgElevated"),
	bgMuted: document.getElementById("CustomBgMuted"),
	border: document.getElementById("CustomBorder"),
	textMain: document.getElementById("CustomTextMain"),
	textMuted: document.getElementById("CustomTextMuted"),
	accent: document.getElementById("CustomAccent"),
	warning: document.getElementById("CustomWarning"),
	danger: document.getElementById("CustomDanger"),
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

function customThemePayload(theme = customTheme) {
	return {
		type: "Edupage Extras custom theme",
		version: 1,
		colors: normalizeCustomTheme(theme),
	};
}

function customThemeExportText(theme = customTheme) {
	return JSON.stringify(customThemePayload(theme), null, 2);
}

function parseCustomThemeImport(text) {
	const parsed = JSON.parse(text);
	const source = parsed?.colors && typeof parsed.colors === "object" ? parsed.colors : parsed;
	if (!source || typeof source !== "object" || Array.isArray(source)) {
		throw new Error("Custom theme import must be a JSON object.");
	}
	if (!Object.keys(DEFAULT_CUSTOM_THEME).some((key) => Object.prototype.hasOwnProperty.call(source, key))) {
		throw new Error("Custom theme import does not contain theme color keys.");
	}
	return normalizeCustomTheme(source);
}

function setCustomThemeStatus(message, isError = false) {
	customThemeStatus.textContent = message;
	customThemeStatus.style.color = isError ? "var(--danger-color)" : "var(--accent-color)";
	window.clearTimeout(setCustomThemeStatus.timer);
	setCustomThemeStatus.timer = window.setTimeout(() => {
		customThemeStatus.textContent = "";
	}, 2600);
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

function applySettingsTheme(theme, darkModeEnabled = false, colors = customTheme) {
	applyCustomThemeVariables(colors);
	document.documentElement.dataset.theme = darkModeEnabled ? normalizeTheme(theme) : "light";
}

function syncCustomThemeInputs(colors = customTheme) {
	const normalized = normalizeCustomTheme(colors);
	Object.entries(customInputs).forEach(([key, input]) => {
		if (input) {
			input.value = normalized[key];
		}
	});
}

function updateDependentControls() {
	themeSelect.disabled = !toggle.checked;
	const customVisible = toggle.checked && themeSelect.value === "custom";
	customThemePanel.hidden = !customVisible;
	Object.values(customInputs).forEach((input) => {
		if (input) {
			input.disabled = !customVisible;
		}
	});
	customThemeImport.disabled = !customVisible;
	exportCustomThemeButton.disabled = !customVisible;
	importCustomThemeButton.disabled = !customVisible;
	resetCustomThemeButton.disabled = !customVisible;
}

function notifyEdupageTabs() {
	const darkModeEnabled = toggle.checked;
	const theme = themeSelect.value;
	const cleanUiEnabled = cleanUiToggle.checked;
	const hideHelpTextEnabled = hideHelpTextToggle.checked;

	chrome.tabs.query({ url: "*://*.edupage.org/*" }, (tabs) => {
		tabs.forEach((tab) => {
			if (tab.id) {
				chrome.tabs.sendMessage(tab.id, {
					type: "ee-set-theme",
					darkModeEnabled,
					theme,
					customTheme,
					cleanUiEnabled,
					hideHelpTextEnabled,
				}, () => {
					void chrome.runtime.lastError;
				});
			}
		});
	});
}

function formatCheckedAt(timestamp) {
	if (!timestamp) return "No update check has run yet.";
	return new Date(timestamp).toLocaleString([], {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function normalizeDateInput(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
}

function renderUpdateStatus(status) {
	updateStatusText.dataset.state = "";
	if (!status) {
		updateStatusText.textContent = "No update check has run yet.";
		return;
	}

	if (status.error) {
		updateStatusText.dataset.state = "error";
		updateStatusText.textContent = `Could not check GitHub: ${status.error}`;
		return;
	}

	if (status.updateAvailable) {
		updateStatusText.dataset.state = "available";
		updateStatusText.textContent = `Downloaded version: ${status.localVersion}. Latest GitHub version: ${status.latestVersion}. Pull the latest project from GitHub. Checked ${formatCheckedAt(status.checkedAt)}.`;
		return;
	}

	updateStatusText.textContent = `Downloaded version: ${status.localVersion}. Latest GitHub version: ${status.latestVersion}. Checked ${formatCheckedAt(status.checkedAt)}.`;
}

function checkForUpdates() {
	checkUpdatesButton.disabled = true;
	updateStatusText.dataset.state = "";
	updateStatusText.textContent = "Checking GitHub...";

	chrome.runtime.sendMessage({ type: "ee-check-update", notify: true }, (response) => {
		checkUpdatesButton.disabled = false;
		if (chrome.runtime.lastError) {
			updateStatusText.dataset.state = "error";
			updateStatusText.textContent = chrome.runtime.lastError.message;
			return;
		}
		if (!response?.ok) {
			updateStatusText.dataset.state = "error";
			updateStatusText.textContent = response?.error || "Could not check GitHub.";
			return;
		}
		renderUpdateStatus(response.status);
	});
}

chrome.storage.local.get(
	[
		STORAGE_KEY,
		THEME_KEY,
		CUSTOM_THEME_KEY,
		CLEAN_UI_KEY,
		HIDE_HELP_TEXT_KEY,
		GRADE_BADGES_KEY,
		GRADES_ATTENDANCE_KEY,
		GRADES_ATTENDANCE_DEBUG_KEY,
		ATTENDANCE_PERCENTAGES_KEY,
		HALFYEAR_START_KEY,
		UPDATE_STATUS_KEY,
		UPDATE_REMINDER_ENABLED_KEY,
	],
	(result) => {
		const enabled = result[STORAGE_KEY] === true;
		const theme = normalizeTheme(result[THEME_KEY]);
		customTheme = normalizeCustomTheme(result[CUSTOM_THEME_KEY]);
		toggle.checked = enabled;
		themeSelect.value = theme;
		cleanUiToggle.checked = result[CLEAN_UI_KEY] === true;
		hideHelpTextToggle.checked = result[HIDE_HELP_TEXT_KEY] === true;
		gradeBadgesToggle.checked = result[GRADE_BADGES_KEY] === true;
		gradesAttendanceToggle.checked = result[GRADES_ATTENDANCE_KEY] !== false;
		gradesAttendanceDebugToggle.checked = result[GRADES_ATTENDANCE_DEBUG_KEY] === true;
		attendancePercentagesToggle.checked = result[ATTENDANCE_PERCENTAGES_KEY] !== false;
		halfyearStartInput.value = normalizeDateInput(result[HALFYEAR_START_KEY]);
		updateReminderToggle.checked = result[UPDATE_REMINDER_ENABLED_KEY] === true;
		syncCustomThemeInputs(customTheme);
		customThemeImport.value = customThemeExportText(customTheme);
		applySettingsTheme(theme, enabled, customTheme);
		updateDependentControls();
		renderUpdateStatus(result[UPDATE_STATUS_KEY]);
	},
);

toggle.addEventListener("change", () => {
	const enabled = toggle.checked;
	chrome.storage.local.set({ [STORAGE_KEY]: enabled });
	applySettingsTheme(themeSelect.value, enabled, customTheme);
	updateDependentControls();
	notifyEdupageTabs();
});

themeSelect.addEventListener("change", () => {
	chrome.storage.local.set({ [THEME_KEY]: themeSelect.value });
	applySettingsTheme(themeSelect.value, toggle.checked, customTheme);
	updateDependentControls();
	notifyEdupageTabs();
});

Object.entries(customInputs).forEach(([key, input]) => {
	if (!input) return;
	input.addEventListener("input", () => {
		customTheme = normalizeCustomTheme({
			...customTheme,
			[key]: input.value,
		});
		applySettingsTheme(themeSelect.value, toggle.checked, customTheme);
		chrome.storage.local.set({ [CUSTOM_THEME_KEY]: customTheme });
		customThemeImport.value = customThemeExportText(customTheme);
		notifyEdupageTabs();
	});
});

exportCustomThemeButton.addEventListener("click", () => {
	const text = customThemeExportText(customTheme);
	customThemeImport.value = text;

	navigator.clipboard.writeText(text)
		.then(() => setCustomThemeStatus("Custom theme copied."))
		.catch(() => setCustomThemeStatus("Custom theme is ready to copy."));
});

importCustomThemeButton.addEventListener("click", () => {
	try {
		customTheme = parseCustomThemeImport(customThemeImport.value);
		themeSelect.value = "custom";
		syncCustomThemeInputs(customTheme);
		customThemeImport.value = customThemeExportText(customTheme);
		applySettingsTheme("custom", toggle.checked, customTheme);
		updateDependentControls();
		chrome.storage.local.set({
			[THEME_KEY]: "custom",
			[CUSTOM_THEME_KEY]: customTheme,
		});
		notifyEdupageTabs();
		setCustomThemeStatus("Custom theme imported.");
	} catch (error) {
		setCustomThemeStatus("Import failed. Paste valid JSON.", true);
	}
});

resetCustomThemeButton.addEventListener("click", () => {
	customTheme = { ...DEFAULT_CUSTOM_THEME };
	syncCustomThemeInputs(customTheme);
	customThemeImport.value = customThemeExportText(customTheme);
	applySettingsTheme(themeSelect.value, toggle.checked, customTheme);
	chrome.storage.local.set({ [CUSTOM_THEME_KEY]: customTheme });
	notifyEdupageTabs();
	setCustomThemeStatus("Custom theme reset.");
});

cleanUiToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [CLEAN_UI_KEY]: cleanUiToggle.checked });
	notifyEdupageTabs();
});

hideHelpTextToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [HIDE_HELP_TEXT_KEY]: hideHelpTextToggle.checked });
	notifyEdupageTabs();
});

gradeBadgesToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [GRADE_BADGES_KEY]: gradeBadgesToggle.checked });
});

gradesAttendanceToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [GRADES_ATTENDANCE_KEY]: gradesAttendanceToggle.checked });
});

gradesAttendanceDebugToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [GRADES_ATTENDANCE_DEBUG_KEY]: gradesAttendanceDebugToggle.checked });
});

attendancePercentagesToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [ATTENDANCE_PERCENTAGES_KEY]: attendancePercentagesToggle.checked });
});

halfyearStartInput.addEventListener("change", () => {
	const value = normalizeDateInput(halfyearStartInput.value);
	if (value) {
		chrome.storage.local.set({ [HALFYEAR_START_KEY]: value }, () => {
			chrome.storage.local.remove(GRADES_ATTENDANCE_CACHE_KEY);
		});
		return;
	}
	chrome.storage.local.remove([HALFYEAR_START_KEY, GRADES_ATTENDANCE_CACHE_KEY]);
});

resetHalfyearStartButton.addEventListener("click", () => {
	halfyearStartInput.value = "";
	chrome.storage.local.remove([HALFYEAR_START_KEY, GRADES_ATTENDANCE_CACHE_KEY]);
});

updateReminderToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [UPDATE_REMINDER_ENABLED_KEY]: updateReminderToggle.checked });
});

checkUpdatesButton.addEventListener("click", checkForUpdates);

openRepositoryButton.addEventListener("click", () => {
	chrome.tabs.create({ url: REPO_URL });
});

experimentalSettingsButton.addEventListener("click", () => {
	window.location.href = "experimental.html";
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (changes[UPDATE_STATUS_KEY]) {
		renderUpdateStatus(changes[UPDATE_STATUS_KEY].newValue);
	}
});
