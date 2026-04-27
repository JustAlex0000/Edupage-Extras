const toggle = document.getElementById("DarkModeCheckbox");
const themeSelect = document.getElementById("ThemeSelect");
const openShortcutSettingsButton = document.getElementById("OpenShortcutSettingsButton");
const themeShortcutStatus = document.getElementById("ThemeShortcutStatus");
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
const googleCalendarEnabledToggle = document.getElementById("GoogleCalendarEnabledCheckbox");
const googleCalendarDetails = document.getElementById("GoogleCalendarDetails");
const googleCalendarRedirectUriInput = document.getElementById("GoogleCalendarRedirectUriInput");
const googleCalendarClientIdInput = document.getElementById("GoogleCalendarClientIdInput");
const googleCalendarClientSecretInput = document.getElementById("GoogleCalendarClientSecretInput");
const googleCalendarNameInput = document.getElementById("GoogleCalendarNameInput");
const googleCalendarSyncModeSelect = document.getElementById("GoogleCalendarSyncModeSelect");
const googleCalendarHalfyearScopeRow = document.getElementById("GoogleCalendarHalfyearScopeRow");
const googleCalendarHalfyearScopeSelect = document.getElementById("GoogleCalendarHalfyearScopeSelect");
const googleCalendarColorModeSelect = document.getElementById("GoogleCalendarColorModeSelect");
const googleCalendarSingleColorRow = document.getElementById("GoogleCalendarSingleColorRow");
const googleCalendarSingleColorSelect = document.getElementById("GoogleCalendarSingleColorSelect");
const googleCalendarSyncIntervalInput = document.getElementById("GoogleCalendarSyncIntervalInput");
const googleCalendarRoomInTitleCheckbox = document.getElementById("GoogleCalendarRoomInTitleCheckbox");
const googleCalendarTeacherInTitleCheckbox = document.getElementById("GoogleCalendarTeacherInTitleCheckbox");
const googleCalendarUseDefaultRemindersCheckbox = document.getElementById("GoogleCalendarUseDefaultRemindersCheckbox");
const googleCalendarConnectButton = document.getElementById("GoogleCalendarConnectButton");
const googleCalendarDisconnectButton = document.getElementById("GoogleCalendarDisconnectButton");
const googleCalendarClearButton = document.getElementById("GoogleCalendarClearButton");
const googleCalendarSyncNowButton = document.getElementById("GoogleCalendarSyncNowButton");
const googleCalendarStatusText = document.getElementById("GoogleCalendarStatusText");
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
const GOOGLE_CALENDAR_ENABLED_KEY = "eeGoogleCalendarEnabled";
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
const THEME_TOGGLE_COMMAND = "toggle-theme-mode";
const REPO_URL = "https://github.com/Alexosavrua/Edupage-Extras";
const THEMES = ["dark", "ocean", "forest", "emerald", "pink", "purple", "custom", "light"];
const GOOGLE_CALENDAR_SYNC_MODES = ["week", "halfyear"];
const GOOGLE_CALENDAR_DEFAULT_NAME = "EduPage";
const GOOGLE_CALENDAR_DEFAULT_SYNC_MODE = "week";
const GOOGLE_CALENDAR_DEFAULT_HALFYEAR_SCOPE = "future";
const GOOGLE_CALENDAR_DEFAULT_COLOR_MODE = "subject";
const GOOGLE_CALENDAR_DEFAULT_SINGLE_COLOR = "9";
const GOOGLE_CALENDAR_DEFAULT_SYNC_INTERVAL = 15;
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
	const reloadReminder = " After pulling the latest project, also reload the unpacked extension in chrome://extensions/.";
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
		updateStatusText.textContent = `Downloaded version: ${status.localVersion}. Latest GitHub version: ${status.latestVersion}. Pull the latest project from GitHub.${reloadReminder} Checked ${formatCheckedAt(status.checkedAt)}.`;
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

function renderShortcutStatus() {
	if (!chrome.commands?.getAll) {
		themeShortcutStatus.textContent = "Shortcut status unavailable in this browser.";
		return;
	}

	chrome.commands.getAll((commands) => {
		const command = commands.find((entry) => entry.name === THEME_TOGGLE_COMMAND);
		const shortcut = command?.shortcut?.trim();
		themeShortcutStatus.textContent = shortcut
			? `Current hotkey: ${shortcut}`
			: "No hotkey assigned.";
	});
}

function normalizeGoogleCalendarName(value) {
	const trimmed = String(value || "").trim();
	return trimmed || GOOGLE_CALENDAR_DEFAULT_NAME;
}

function normalizeGoogleCalendarSyncMode(value) {
	return GOOGLE_CALENDAR_SYNC_MODES.includes(value) ? value : GOOGLE_CALENDAR_DEFAULT_SYNC_MODE;
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

function getGoogleCalendarRedirectUri() {
	if (!chrome.identity?.getRedirectURL) return "";
	return chrome.identity.getRedirectURL();
}

function setGoogleCalendarBusy(busy) {
	googleCalendarConnectButton.disabled = busy;
	googleCalendarDisconnectButton.disabled = busy;
	googleCalendarClearButton.disabled = busy;
	googleCalendarSyncNowButton.disabled = busy;
}

function renderGoogleCalendarStatus(status) {
	googleCalendarStatusText.dataset.state = "";
	if (!status) {
		googleCalendarStatusText.textContent = "Google Calendar sync is disabled.";
		return;
	}

	const parts = [];
	if (status.message) {
		parts.push(status.message);
	}
	if (status.lastSyncedAt) {
		parts.push(`Last sync: ${new Date(status.lastSyncedAt).toLocaleString([], {
			dateStyle: "medium",
			timeStyle: "short",
		})}.`);
	}
	if (status.calendarName) {
		parts.push(`Calendar: ${status.calendarName}.`);
	}
	if (status.mode === "halfyear") {
		parts.push(status.halfyearScope === "full"
			? "Range: whole current halfyear."
			: "Range: current halfyear from today forward.");
	}
	if (status.mode === "week") {
		parts.push("Range: current week, or upcoming week on weekends.");
	}

	googleCalendarStatusText.textContent = parts.join(" ").trim() || "Google Calendar is configured.";
	if (status.state === "error") {
		googleCalendarStatusText.dataset.state = "error";
		return;
	}
	if (status.state === "ok" || status.state === "connected" || status.state === "syncing") {
		googleCalendarStatusText.dataset.state = "available";
	}
}

function updateGoogleCalendarControls() {
	const enabled = googleCalendarEnabledToggle.checked;
	const hasClientId = googleCalendarClientIdInput.value.trim().length > 0;
	const hasClientSecret = googleCalendarClientSecretInput.value.trim().length > 0;
	const colorMode = normalizeGoogleCalendarColorMode(googleCalendarColorModeSelect.value);
	const syncMode = normalizeGoogleCalendarSyncMode(googleCalendarSyncModeSelect.value);

	googleCalendarDetails.hidden = !enabled;
	googleCalendarClientIdInput.disabled = false;
	googleCalendarClientSecretInput.disabled = false;
	googleCalendarNameInput.disabled = !enabled;
	googleCalendarSyncModeSelect.disabled = !enabled;
	googleCalendarHalfyearScopeRow.hidden = !enabled || syncMode !== "halfyear";
	googleCalendarHalfyearScopeSelect.disabled = !enabled || syncMode !== "halfyear";
	googleCalendarColorModeSelect.disabled = !enabled;
	googleCalendarSingleColorRow.hidden = !enabled || colorMode !== "single";
	googleCalendarSingleColorSelect.disabled = !enabled || colorMode !== "single";
	googleCalendarSyncIntervalInput.disabled = !enabled;
	googleCalendarRoomInTitleCheckbox.disabled = !enabled;
	googleCalendarTeacherInTitleCheckbox.disabled = !enabled;
	googleCalendarUseDefaultRemindersCheckbox.disabled = !enabled;
	googleCalendarConnectButton.disabled = !enabled || !hasClientId || !hasClientSecret;
	googleCalendarDisconnectButton.disabled = !enabled;
	googleCalendarClearButton.disabled = !enabled;
	googleCalendarSyncNowButton.disabled = !enabled;
}

function syncGoogleCalendarSettingsToStorage() {
	chrome.storage.local.set({
		[GOOGLE_CALENDAR_ENABLED_KEY]: googleCalendarEnabledToggle.checked,
		[GOOGLE_CALENDAR_CLIENT_ID_KEY]: googleCalendarClientIdInput.value.trim(),
		[GOOGLE_CALENDAR_CLIENT_SECRET_KEY]: googleCalendarClientSecretInput.value.trim(),
		[GOOGLE_CALENDAR_NAME_KEY]: normalizeGoogleCalendarName(googleCalendarNameInput.value),
		[GOOGLE_CALENDAR_SYNC_MODE_KEY]: normalizeGoogleCalendarSyncMode(googleCalendarSyncModeSelect.value),
		[GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY]: normalizeGoogleCalendarHalfyearScope(googleCalendarHalfyearScopeSelect.value),
		[GOOGLE_CALENDAR_COLOR_MODE_KEY]: normalizeGoogleCalendarColorMode(googleCalendarColorModeSelect.value),
		[GOOGLE_CALENDAR_SINGLE_COLOR_KEY]: normalizeGoogleCalendarSingleColor(googleCalendarSingleColorSelect.value),
		[GOOGLE_CALENDAR_SYNC_INTERVAL_KEY]: normalizeGoogleCalendarSyncInterval(googleCalendarSyncIntervalInput.value),
		[GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY]: googleCalendarRoomInTitleCheckbox.checked,
		[GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY]: googleCalendarTeacherInTitleCheckbox.checked,
		[GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY]: googleCalendarUseDefaultRemindersCheckbox.checked,
	});
}

function sendGoogleCalendarAction(message, onDone) {
	setGoogleCalendarBusy(true);
	chrome.runtime.sendMessage(message, (response) => {
		setGoogleCalendarBusy(false);
		updateGoogleCalendarControls();
		if (chrome.runtime.lastError) {
			renderGoogleCalendarStatus({
				state: "error",
				message: chrome.runtime.lastError.message,
			});
			return;
		}
		if (!response?.ok) {
			renderGoogleCalendarStatus({
				state: "error",
				message: response?.error || "Google Calendar request failed.",
			});
			return;
		}
		if (response.status) {
			renderGoogleCalendarStatus(response.status);
		}
		if (onDone) {
			onDone(response);
		}
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
		GOOGLE_CALENDAR_ENABLED_KEY,
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
		GOOGLE_CALENDAR_STATUS_KEY,
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
		googleCalendarEnabledToggle.checked = result[GOOGLE_CALENDAR_ENABLED_KEY] === true;
		googleCalendarRedirectUriInput.value = getGoogleCalendarRedirectUri();
		googleCalendarClientIdInput.value = String(result[GOOGLE_CALENDAR_CLIENT_ID_KEY] || "");
		googleCalendarClientSecretInput.value = String(result[GOOGLE_CALENDAR_CLIENT_SECRET_KEY] || "");
		googleCalendarNameInput.value = normalizeGoogleCalendarName(result[GOOGLE_CALENDAR_NAME_KEY]);
		googleCalendarSyncModeSelect.value = normalizeGoogleCalendarSyncMode(result[GOOGLE_CALENDAR_SYNC_MODE_KEY]);
		googleCalendarHalfyearScopeSelect.value = normalizeGoogleCalendarHalfyearScope(result[GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY]);
		googleCalendarColorModeSelect.value = normalizeGoogleCalendarColorMode(result[GOOGLE_CALENDAR_COLOR_MODE_KEY]);
		googleCalendarSingleColorSelect.value = normalizeGoogleCalendarSingleColor(result[GOOGLE_CALENDAR_SINGLE_COLOR_KEY]);
		googleCalendarSyncIntervalInput.value = String(normalizeGoogleCalendarSyncInterval(result[GOOGLE_CALENDAR_SYNC_INTERVAL_KEY]));
		googleCalendarRoomInTitleCheckbox.checked = result[GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY] === true;
		googleCalendarTeacherInTitleCheckbox.checked = result[GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY] === true;
		googleCalendarUseDefaultRemindersCheckbox.checked = result[GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY] === true;
		syncCustomThemeInputs(customTheme);
		customThemeImport.value = customThemeExportText(customTheme);
		applySettingsTheme(theme, enabled, customTheme);
		updateDependentControls();
		renderUpdateStatus(result[UPDATE_STATUS_KEY]);
		renderGoogleCalendarStatus(result[GOOGLE_CALENDAR_STATUS_KEY]);
		updateGoogleCalendarControls();
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

googleCalendarEnabledToggle.addEventListener("change", () => {
	syncGoogleCalendarSettingsToStorage();
	updateGoogleCalendarControls();
});

googleCalendarClientIdInput.addEventListener("input", () => {
	chrome.storage.local.set({ [GOOGLE_CALENDAR_CLIENT_ID_KEY]: googleCalendarClientIdInput.value.trim() });
	updateGoogleCalendarControls();
});

googleCalendarClientSecretInput.addEventListener("input", () => {
	chrome.storage.local.set({ [GOOGLE_CALENDAR_CLIENT_SECRET_KEY]: googleCalendarClientSecretInput.value.trim() });
	updateGoogleCalendarControls();
});

googleCalendarNameInput.addEventListener("change", () => {
	googleCalendarNameInput.value = normalizeGoogleCalendarName(googleCalendarNameInput.value);
	chrome.storage.local.set({ [GOOGLE_CALENDAR_NAME_KEY]: googleCalendarNameInput.value });
});

googleCalendarSyncModeSelect.addEventListener("change", () => {
	googleCalendarSyncModeSelect.value = normalizeGoogleCalendarSyncMode(googleCalendarSyncModeSelect.value);
	chrome.storage.local.set({ [GOOGLE_CALENDAR_SYNC_MODE_KEY]: googleCalendarSyncModeSelect.value });
	updateGoogleCalendarControls();
});

googleCalendarHalfyearScopeSelect.addEventListener("change", () => {
	googleCalendarHalfyearScopeSelect.value = normalizeGoogleCalendarHalfyearScope(googleCalendarHalfyearScopeSelect.value);
	chrome.storage.local.set({ [GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY]: googleCalendarHalfyearScopeSelect.value });
});

googleCalendarColorModeSelect.addEventListener("change", () => {
	googleCalendarColorModeSelect.value = normalizeGoogleCalendarColorMode(googleCalendarColorModeSelect.value);
	chrome.storage.local.set({ [GOOGLE_CALENDAR_COLOR_MODE_KEY]: googleCalendarColorModeSelect.value });
	updateGoogleCalendarControls();
});

googleCalendarSingleColorSelect.addEventListener("change", () => {
	googleCalendarSingleColorSelect.value = normalizeGoogleCalendarSingleColor(googleCalendarSingleColorSelect.value);
	chrome.storage.local.set({ [GOOGLE_CALENDAR_SINGLE_COLOR_KEY]: googleCalendarSingleColorSelect.value });
});

googleCalendarSyncIntervalInput.addEventListener("change", () => {
	googleCalendarSyncIntervalInput.value = String(normalizeGoogleCalendarSyncInterval(googleCalendarSyncIntervalInput.value));
	chrome.storage.local.set({ [GOOGLE_CALENDAR_SYNC_INTERVAL_KEY]: Number.parseInt(googleCalendarSyncIntervalInput.value, 10) });
});

googleCalendarRoomInTitleCheckbox.addEventListener("change", () => {
	chrome.storage.local.set({ [GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY]: googleCalendarRoomInTitleCheckbox.checked });
});

googleCalendarTeacherInTitleCheckbox.addEventListener("change", () => {
	chrome.storage.local.set({ [GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY]: googleCalendarTeacherInTitleCheckbox.checked });
});

googleCalendarUseDefaultRemindersCheckbox.addEventListener("change", () => {
	chrome.storage.local.set({ [GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY]: googleCalendarUseDefaultRemindersCheckbox.checked });
});

googleCalendarConnectButton.addEventListener("click", () => {
	const clientId = googleCalendarClientIdInput.value.trim();
	const clientSecret = googleCalendarClientSecretInput.value.trim();
	if (!clientId) {
		renderGoogleCalendarStatus({
			state: "error",
			message: "Paste a Google OAuth Client ID first.",
		});
		return;
	}
	if (!clientSecret) {
		renderGoogleCalendarStatus({
			state: "error",
			message: "Paste a Google OAuth Client Secret first.",
		});
		return;
	}

	syncGoogleCalendarSettingsToStorage();
	sendGoogleCalendarAction({
		type: "ee-google-calendar-connect",
		clientId,
		clientSecret,
		halfyearScope: normalizeGoogleCalendarHalfyearScope(googleCalendarHalfyearScopeSelect.value),
		calendarName: normalizeGoogleCalendarName(googleCalendarNameInput.value),
	});
});

googleCalendarDisconnectButton.addEventListener("click", () => {
	sendGoogleCalendarAction({ type: "ee-google-calendar-disconnect" });
});

googleCalendarClearButton.addEventListener("click", () => {
	if (!window.confirm("Remove all EduPage Extras events from the selected Google calendar?")) {
		return;
	}
	sendGoogleCalendarAction({ type: "ee-google-calendar-clear-events" });
});

googleCalendarSyncNowButton.addEventListener("click", () => {
	syncGoogleCalendarSettingsToStorage();
	sendGoogleCalendarAction({ type: "ee-google-calendar-sync-now" });
});

checkUpdatesButton.addEventListener("click", checkForUpdates);

openRepositoryButton.addEventListener("click", () => {
	chrome.tabs.create({ url: REPO_URL });
});

openShortcutSettingsButton.addEventListener("click", () => {
	chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

experimentalSettingsButton.addEventListener("click", () => {
	window.location.href = "experimental.html";
});

renderShortcutStatus();
window.addEventListener("focus", renderShortcutStatus);

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (changes[UPDATE_STATUS_KEY]) {
		renderUpdateStatus(changes[UPDATE_STATUS_KEY].newValue);
	}
	if (changes[GOOGLE_CALENDAR_STATUS_KEY]) {
		renderGoogleCalendarStatus(changes[GOOGLE_CALENDAR_STATUS_KEY].newValue);
	}
	if (
		changes[GOOGLE_CALENDAR_ENABLED_KEY]
		|| changes[GOOGLE_CALENDAR_CLIENT_ID_KEY]
		|| changes[GOOGLE_CALENDAR_CLIENT_SECRET_KEY]
		|| changes[GOOGLE_CALENDAR_NAME_KEY]
		|| changes[GOOGLE_CALENDAR_SYNC_MODE_KEY]
		|| changes[GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY]
		|| changes[GOOGLE_CALENDAR_COLOR_MODE_KEY]
		|| changes[GOOGLE_CALENDAR_SINGLE_COLOR_KEY]
		|| changes[GOOGLE_CALENDAR_SYNC_INTERVAL_KEY]
		|| changes[GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY]
		|| changes[GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY]
		|| changes[GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY]
	) {
		if (changes[GOOGLE_CALENDAR_ENABLED_KEY]) {
			googleCalendarEnabledToggle.checked = changes[GOOGLE_CALENDAR_ENABLED_KEY].newValue === true;
		}
		if (changes[GOOGLE_CALENDAR_CLIENT_ID_KEY]) {
			googleCalendarClientIdInput.value = String(changes[GOOGLE_CALENDAR_CLIENT_ID_KEY].newValue || "");
		}
		if (changes[GOOGLE_CALENDAR_CLIENT_SECRET_KEY]) {
			googleCalendarClientSecretInput.value = String(changes[GOOGLE_CALENDAR_CLIENT_SECRET_KEY].newValue || "");
		}
		if (changes[GOOGLE_CALENDAR_NAME_KEY]) {
			googleCalendarNameInput.value = normalizeGoogleCalendarName(changes[GOOGLE_CALENDAR_NAME_KEY].newValue);
		}
		if (changes[GOOGLE_CALENDAR_SYNC_MODE_KEY]) {
			googleCalendarSyncModeSelect.value = normalizeGoogleCalendarSyncMode(changes[GOOGLE_CALENDAR_SYNC_MODE_KEY].newValue);
		}
		if (changes[GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY]) {
			googleCalendarHalfyearScopeSelect.value = normalizeGoogleCalendarHalfyearScope(changes[GOOGLE_CALENDAR_HALFYEAR_SCOPE_KEY].newValue);
		}
		if (changes[GOOGLE_CALENDAR_COLOR_MODE_KEY]) {
			googleCalendarColorModeSelect.value = normalizeGoogleCalendarColorMode(changes[GOOGLE_CALENDAR_COLOR_MODE_KEY].newValue);
		}
		if (changes[GOOGLE_CALENDAR_SINGLE_COLOR_KEY]) {
			googleCalendarSingleColorSelect.value = normalizeGoogleCalendarSingleColor(changes[GOOGLE_CALENDAR_SINGLE_COLOR_KEY].newValue);
		}
		if (changes[GOOGLE_CALENDAR_SYNC_INTERVAL_KEY]) {
			googleCalendarSyncIntervalInput.value = String(normalizeGoogleCalendarSyncInterval(changes[GOOGLE_CALENDAR_SYNC_INTERVAL_KEY].newValue));
		}
		if (changes[GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY]) {
			googleCalendarRoomInTitleCheckbox.checked = changes[GOOGLE_CALENDAR_ROOM_IN_TITLE_KEY].newValue === true;
		}
		if (changes[GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY]) {
			googleCalendarTeacherInTitleCheckbox.checked = changes[GOOGLE_CALENDAR_TEACHER_IN_TITLE_KEY].newValue === true;
		}
		if (changes[GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY]) {
			googleCalendarUseDefaultRemindersCheckbox.checked = changes[GOOGLE_CALENDAR_USE_DEFAULT_REMINDERS_KEY].newValue === true;
		}
		updateGoogleCalendarControls();
	}
});
