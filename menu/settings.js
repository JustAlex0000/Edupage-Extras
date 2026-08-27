const toggle = document.getElementById("DarkModeCheckbox");
const themeSelect = document.getElementById("ThemeSelect");
const openShortcutSettingsButton = document.getElementById("OpenShortcutSettingsButton");
const themeShortcutStatus = document.getElementById("ThemeShortcutStatus");
const cleanUiToggle = document.getElementById("CleanUiCheckbox");
const hideHelpTextToggle = document.getElementById("HideHelpTextCheckbox");
const timetableHighlightsToggle = document.getElementById("TimetableHighlightsCheckbox");
const gradeBadgesToggle = document.getElementById("GradeBadgesCheckbox");
const gradesAttendanceToggle = document.getElementById("GradesAttendanceCheckbox");
const gradesAttendanceDebugToggle = document.getElementById("GradesAttendanceDebugCheckbox");
const reportRedactToggle = document.getElementById("ReportRedactCheckbox");
const generateReportButton = document.getElementById("GenerateReportButton");
const copyReportButton = document.getElementById("CopyReportButton");
const downloadReportButton = document.getElementById("DownloadReportButton");
const openIssueButton = document.getElementById("OpenIssueButton");
const reportOutput = document.getElementById("ReportOutput");
const reportStatus = document.getElementById("ReportStatus");
const clearCachedSchoolDataButton = document.getElementById("ClearCachedSchoolDataButton");
const clearCachedSchoolDataStatus = document.getElementById("ClearCachedSchoolDataStatus");
const attendancePercentagesToggle = document.getElementById("AttendancePercentagesCheckbox");
const halfyearStartInput = document.getElementById("HalfyearStartDateInput");
const resetHalfyearStartButton = document.getElementById("ResetHalfyearStartDateButton");
const halfyearEndInput = document.getElementById("HalfyearEndDateInput");
const resetHalfyearEndButton = document.getElementById("ResetHalfyearEndDateButton");
const halfyearStartDefaultHint = document.getElementById("HalfyearStartDefaultHint");
const halfyearEndDefaultHint = document.getElementById("HalfyearEndDefaultHint");
const experimentalSettingsButton = document.getElementById("ExperimentalSettingsButton");
const customThemePanel = document.getElementById("CustomThemePanel");
const customThemeImport = document.getElementById("CustomThemeImport");
const exportCustomThemeButton = document.getElementById("ExportCustomThemeButton");
const importCustomThemeButton = document.getElementById("ImportCustomThemeButton");
const resetCustomThemeButton = document.getElementById("ResetCustomThemeButton");
const customThemeStatus = document.getElementById("CustomThemeStatus");
const timetableHighlightColorsRow = document.getElementById("TimetableHighlightColorsRow");
const rozvrhRoomChangeColorInput = document.getElementById("RozvrhRoomChangeColor");
const rozvrhSubstitutionColorInput = document.getElementById("RozvrhSubstitutionColor");
const customRozvrhRoomChangeInput = document.getElementById("CustomRozvrhRoomChange");
const customRozvrhSubstitutionInput = document.getElementById("CustomRozvrhSubstitution");
const updateReminderToggle = document.getElementById("UpdateReminderCheckbox");
const checkUpdatesButton = document.getElementById("CheckUpdatesButton");
const openRepositoryButton = document.getElementById("OpenRepositoryButton");
const updateStatusText = document.getElementById("UpdateStatusText");
const experimentalContent = document.getElementById("ExperimentalContent");
const experimentalConfirmContinue = document.getElementById("ExperimentalConfirmContinue");
const experimentalShortcutSettingsButton = document.getElementById("ExperimentalShortcutSettingsButton");
const openTestingSiteButton = document.getElementById("OpenTestingSiteButton");
const activityShieldShortcutStatus = document.getElementById("ActivityShieldShortcutStatus");
const resetActivityShieldButton = document.getElementById("ResetActivityShieldButton");
const reloadEdupageTabsButton = document.getElementById("ReloadEdupageTabsButton");
const experimentalSaveStatus = document.getElementById("ExperimentalSaveStatus");
const etestAutoThemeOffToggle = document.getElementById("EtestAutoThemeOffCheckbox");
const autoLoginToggle = document.getElementById("AutoLoginCheckbox");
const autoLoginPreferredAccountRow = document.getElementById("AutoLoginPreferredAccountRow");
const autoLoginPreferredAccountInput = document.getElementById("AutoLoginPreferredAccountInput");
const ucivoExportToggle = document.getElementById("UcivoExportCheckbox");
const gradesSortFilterToggle = document.getElementById("GradesSortFilterCheckbox");
const gradesExportToggle = document.getElementById("GradesExportCheckbox");
const timetableExportToggle = document.getElementById("TimetableExportCheckbox");
const timetableExportContent = document.getElementById("TimetableExportContent");
const etestCopyToggle = document.getElementById("EtestCopyCheckbox");
const openEtestCopyShortcutSettingsButton = document.getElementById("OpenEtestCopyShortcutSettingsButton");
const etestQuestionButtonsRow = document.getElementById("EtestQuestionButtonsRow");
const etestQuestionButtonsToggle = document.getElementById("EtestQuestionButtonsCheckbox");
const etestWholeTestButtonRow = document.getElementById("EtestWholeTestButtonRow");
const etestWholeTestButtonToggle = document.getElementById("EtestWholeTestButtonCheckbox");
const etestIncludeAnswersRow = document.getElementById("EtestIncludeAnswersRow");
const etestIncludeAnswersToggle = document.getElementById("EtestIncludeAnswersCheckbox");
const etestIncludeImagesRow = document.getElementById("EtestIncludeImagesRow");
const etestIncludeImagesToggle = document.getElementById("EtestIncludeImagesCheckbox");
const etestImageExportRow = document.getElementById("EtestImageExportRow");
const etestImageExportInput = document.getElementById("EtestImageExportInput");
const etestImageExportButton = document.getElementById("EtestImageExportButton");
const aiQuestionHelperToggle = document.getElementById("AiQuestionHelperCheckbox");
const aiQuestionHelperSettings = document.getElementById("AiQuestionHelperSettings");
const aiProviderSelect = document.getElementById("AiProviderSelect");
const aiEndpointRow = document.getElementById("AiEndpointRow");
const aiEndpointInput = document.getElementById("AiEndpointInput");
const aiModelInput = document.getElementById("AiModelInput");
const aiAccessTokenRow = document.getElementById("AiAccessTokenRow");
const aiAccessTokenInput = document.getElementById("AiAccessTokenInput");
const aiTestConnectionButton = document.getElementById("AiTestConnectionButton");
const aiConnectionStatus = document.getElementById("AiConnectionStatus");
const openAiShortcutSettingsButton = document.getElementById("OpenAiShortcutSettingsButton");
const aiShortcutStatus = document.getElementById("AiShortcutStatus");
const previewUpdateToastButton = document.getElementById("PreviewUpdateToastButton");
const STORAGE_KEY = "darkModeEnabled";
const THEME_KEY = "themeMode";
const CUSTOM_THEME_KEY = "customThemeColors";
const CLEAN_UI_KEY = "cleanUiEnabled";
const HIDE_HELP_TEXT_KEY = "hideHelpTextEnabled";
const TIMETABLE_HIGHLIGHTS_KEY = "timetableHighlightsEnabled";
const ROZVRH_ROOM_CHANGE_COLOR_KEY = "eeRozvrhRoomChangeColor";
const ROZVRH_SUBSTITUTION_COLOR_KEY = "eeRozvrhSubstitutionColor";
const DEFAULT_ROZVRH_ROOM_CHANGE_COLOR = "#1565c0";
const DEFAULT_ROZVRH_SUBSTITUTION_COLOR = "#e65100";
const GRADE_BADGES_KEY = "gradeBadgesEnabled";
const GRADES_ATTENDANCE_KEY = "gradesAttendanceStatsEnabled";
const GRADES_ATTENDANCE_DEBUG_KEY = "gradesAttendanceDebugEnabled";
const ATTENDANCE_PERCENTAGES_KEY = "attendancePercentagesEnabled";
const HALFYEAR_START_KEY = "eeHalfyearStartDate";
const HALFYEAR_END_KEY = "eeSecondHalfEndDate";
const GRADES_ATTENDANCE_CACHE_KEY = "eeGradesAttendanceStatsCache";
const TIMETABLE_SYNC_CACHE_KEY = "eeTimetableSyncCache";
const UPDATE_STATUS_KEY = "eeUpdateStatus";
const UPDATE_REMINDER_ENABLED_KEY = "eeUpdateReminderEnabled";
const THEME_TOGGLE_COMMAND = "toggle-theme-mode";
const REPO_URL = "https://github.com/JustAlex0000/Edupage-Extras";
const ACTIVITY_SHIELD_COMMAND = "toggle-stay-active-mode";
const AI_SUGGEST_QUESTION_COMMAND = "suggest-test-question";
const ETEST_AUTO_THEME_OFF_KEY = "eeEtestAutoThemeOffEnabled";
const AUTOLOGIN_KEY = "eeAutoLoginEnabled";
const AUTOLOGIN_PREFERRED_ACCOUNT_KEY = "eeAutoLoginPreferredAccount";
const UCIVO_EXPORT_KEY = "eeUcivoExportEnabled";
const GRADES_SORT_FILTER_KEY = "eeGradesSortFilterEnabled";
const GRADES_EXPORT_KEY = "eeGradesExportEnabled";
const TIMETABLE_EXPORT_KEY = "eeTimetableExportEnabled";
const ETEST_COPY_KEY = "eeEtestCopyEnabled";
const ETEST_QUESTION_BUTTONS_KEY = "eeEtestQuestionButtonsEnabled";
const ETEST_WHOLE_TEST_BUTTON_KEY = "eeEtestWholeTestButtonEnabled";
const ETEST_INCLUDE_ANSWERS_KEY = "eeEtestIncludeAnswers";
const ETEST_INCLUDE_IMAGES_KEY = "eeEtestIncludeImages";
const AI_HELPER_ENABLED_KEY = "eeAiQuestionHelperEnabled";
const AI_PROVIDER_KEY = "eeAiProvider";
const AI_ENDPOINT_KEY = "eeAiEndpoint";
const AI_MODEL_KEY = "eeAiModel";
const AI_ACCESS_TOKEN_KEY = "eeAiAccessToken";
const AI_DEFAULT_ENDPOINTS = {
	ollama: "http://127.0.0.1:11434",
	lmstudio: "http://127.0.0.1:1234",
};
const AI_CLOUD_PROVIDERS = new Set(["nvidia", "openrouter", "gemini"]);
const TESTING_SITE_URL = "https://edublurtesting.ct.ws/";
const TESTING_SITE_PERMISSION = "https://edublurtesting.ct.ws/*";
const activityShieldSettings = [
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
	["ActivityBlockEsc", "eeActivityShieldBlockEsc"],
	["ActivityJquerySweep", "eeActivityShieldJquerySweep"],
	["ActivityFullscreenSpoof", "eeActivityShieldFullscreenSpoof"],
	["ActivityVisualIndicator", "eeActivityShieldVisualIndicator"],
	["ActivityLog", "eeActivityShieldLog"],
];
const activityShieldDefaults = {
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
	eeActivityShieldBlockEsc: true,
	eeActivityShieldJquerySweep: true,
	eeActivityShieldFullscreenSpoof: true,
	eeActivityShieldVisualIndicator: false,
	eeActivityShieldLog: false,
};
const activityShieldStorageKeys = Object.keys(activityShieldDefaults);
const activityShieldControlledSettings = activityShieldSettings.filter(([elementId]) => elementId !== "ActivityShieldEnabled");
const DEFAULT_CUSTOM_THEME = EE.DEFAULT_CUSTOM_THEME;
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
	tableHeaderBg: document.getElementById("CustomTableHeaderBg"),
};

let customTheme = { ...DEFAULT_CUSTOM_THEME };
let rozvrhRoomChangeColor = DEFAULT_ROZVRH_ROOM_CHANGE_COLOR;
let rozvrhSubstitutionColor = DEFAULT_ROZVRH_SUBSTITUTION_COLOR;

function t(key, substitutions) {
	return window.eeI18n.msg(key, substitutions);
}

function normalizeTheme(theme) {
	return EE.normalizeTheme(theme);
}

function normalizeColor(value, fallback) {
	return EE.normalizeColor(value, fallback);
}

function normalizeCustomTheme(theme) {
	return EE.normalizeCustomTheme(theme);
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

function syncRozvrhColorInputs() {
	[rozvrhRoomChangeColorInput, customRozvrhRoomChangeInput].forEach((input) => {
		if (input) input.value = rozvrhRoomChangeColor;
	});
	[rozvrhSubstitutionColorInput, customRozvrhSubstitutionInput].forEach((input) => {
		if (input) input.value = rozvrhSubstitutionColor;
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

	const rozvrhColorsEnabled = timetableHighlightsToggle.checked;
	if (timetableHighlightColorsRow) timetableHighlightColorsRow.hidden = !rozvrhColorsEnabled;
	if (rozvrhRoomChangeColorInput) rozvrhRoomChangeColorInput.disabled = !rozvrhColorsEnabled;
	if (rozvrhSubstitutionColorInput) rozvrhSubstitutionColorInput.disabled = !rozvrhColorsEnabled;
	if (customRozvrhRoomChangeInput) customRozvrhRoomChangeInput.disabled = !(rozvrhColorsEnabled && customVisible);
	if (customRozvrhSubstitutionInput) customRozvrhSubstitutionInput.disabled = !(rozvrhColorsEnabled && customVisible);

	const autoLoginEnabled = autoLoginToggle?.checked === true;
	if (autoLoginPreferredAccountRow) autoLoginPreferredAccountRow.hidden = !autoLoginEnabled;
	if (autoLoginPreferredAccountInput) autoLoginPreferredAccountInput.disabled = !autoLoginEnabled;

	const etestCopyEnabled = etestCopyToggle?.checked === true;
	if (etestQuestionButtonsRow) etestQuestionButtonsRow.hidden = !etestCopyEnabled;
	if (etestQuestionButtonsToggle) etestQuestionButtonsToggle.disabled = !etestCopyEnabled;
	if (etestWholeTestButtonRow) etestWholeTestButtonRow.hidden = !etestCopyEnabled;
	if (etestWholeTestButtonToggle) etestWholeTestButtonToggle.disabled = !etestCopyEnabled;
	if (etestIncludeAnswersRow) etestIncludeAnswersRow.hidden = !etestCopyEnabled;
	if (etestIncludeAnswersToggle) etestIncludeAnswersToggle.disabled = !etestCopyEnabled;
	if (etestIncludeImagesRow) etestIncludeImagesRow.hidden = !etestCopyEnabled;
	if (etestIncludeImagesToggle) etestIncludeImagesToggle.disabled = !etestCopyEnabled;
	if (etestImageExportRow) etestImageExportRow.hidden = !etestCopyEnabled;
	if (etestImageExportInput) etestImageExportInput.disabled = !etestCopyEnabled;
	if (etestImageExportButton) etestImageExportButton.disabled = !etestCopyEnabled;

	const aiEnabled = aiQuestionHelperToggle?.checked === true;
	if (aiQuestionHelperSettings) aiQuestionHelperSettings.hidden = !aiEnabled;
	const aiProvider = aiProviderSelect?.value || "ollama";
	if (aiEndpointRow) aiEndpointRow.hidden = !aiEnabled || AI_CLOUD_PROVIDERS.has(aiProvider);
	if (aiAccessTokenRow) aiAccessTokenRow.hidden = !aiEnabled || aiProvider === "ollama";
	if (aiEndpointInput) aiEndpointInput.disabled = !aiEnabled || AI_CLOUD_PROVIDERS.has(aiProvider);
	if (aiModelInput) aiModelInput.disabled = !aiEnabled;
	if (aiAccessTokenInput) aiAccessTokenInput.disabled = !aiEnabled || aiProvider === "ollama";
	if (aiTestConnectionButton) aiTestConnectionButton.disabled = !aiEnabled;
}

function updateTimetableExportVisibility() {
	if (timetableExportContent) timetableExportContent.hidden = timetableExportToggle?.checked !== true;
}

function notifyEdupageTabs() {
	const darkModeEnabled = toggle.checked;
	const theme = themeSelect.value;
	const cleanUiEnabled = cleanUiToggle.checked;
	const hideHelpTextEnabled = hideHelpTextToggle.checked;
	const activityShieldEnabled = document.getElementById("ActivityShieldEnabled")?.checked === true;
	const etestAutoThemeOff = activityShieldEnabled && etestAutoThemeOffToggle?.checked === true;

	chrome.tabs.query({ url: "https://*.edupage.org/*" }, (tabs) => {
		tabs.forEach((tab) => {
			if (tab.id) {
				chrome.tabs.sendMessage(tab.id, {
					type: "ee-set-theme",
					darkModeEnabled,
					theme,
					customTheme,
					cleanUiEnabled,
					hideHelpTextEnabled,
					rozvrhRoomChangeColor,
					rozvrhSubstitutionColor,
					etestAutoThemeOff,
				}, () => {
					void chrome.runtime.lastError;
				});
			}
		});
	});
}

function formatCheckedAt(timestamp) {
	if (!timestamp) return t("noUpdateCheck");
	return new Date(timestamp).toLocaleString([], {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function normalizeDateInput(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
}

// Mirrors the defaults in scripts/grades-enhancer.js and scripts/background.js:
// the school year turns over Sept 1, the second halfyear defaults to Feb 1
// through Jun 30. Shown next to the date inputs so users see the actual fallback
// rather than the empty input's "dd/mm/yyyy" placeholder.
function computeDefaultHalfyearDates(now = new Date()) {
	const turnoverYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
	return {
		start: new Date(turnoverYear + 1, 1, 1),
		end: new Date(turnoverYear + 1, 5, 30),
	};
}

function formatDefaultHint(date) {
	return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

function renderDefaultHalfyearHints() {
	const defaults = computeDefaultHalfyearDates();
	if (halfyearStartDefaultHint) {
		halfyearStartDefaultHint.textContent = t("defaultDateHint", [formatDefaultHint(defaults.start)]);
	}
	if (halfyearEndDefaultHint) {
		halfyearEndDefaultHint.textContent = t("defaultDateHint", [formatDefaultHint(defaults.end)]);
	}
}

// Set for store installs (Firefox AMO / future Chrome Web Store) — the browser
// auto-updates the add-on, so the GitHub "pull & reload" flow doesn't apply.
let isStoreInstall = false;

function renderUpdateStatus(status) {
	if (isStoreInstall) {
		updateStatusText.dataset.state = "";
		updateStatusText.textContent = t("updatesAutoStore") ||
			"This install updates automatically through your browser's add-on store.";
		return;
	}
	// Same staleness check as menu.js: a cached status from before this version
	// was loaded would show the OLD version as "downloaded" — never trust it
	// blindly. Treat a version mismatch as "no check yet" and silently ask the
	// background to recheck so it self-heals with the correct numbers.
	const liveVersion = chrome.runtime.getManifest().version;
	if (status && status.localVersion !== liveVersion) {
		chrome.runtime.sendMessage({ type: "ee-check-update", notify: false }, (response) => {
			void chrome.runtime.lastError;
			if (response?.ok) {
				renderUpdateStatus(response.status);
			} else if (!chrome.runtime.lastError) {
				updateStatusText.dataset.state = "error";
				updateStatusText.textContent = response?.error || t("updateCheckFailed");
			}
		});
		status = null;
	}

	const reloadReminder = t("updateReloadReminder");
	updateStatusText.dataset.state = "";
	if (!status) {
		updateStatusText.textContent = t("checkingGithub");
		return;
	}

	if (status.error) {
		updateStatusText.dataset.state = "error";
		updateStatusText.textContent = t("updateErrorPrefix", [String(status.error)]);
		return;
	}

	if (status.updateAvailable) {
		updateStatusText.dataset.state = "available";
		updateStatusText.textContent = t("updateAvailableStatus", [
			String(status.localVersion),
			String(status.latestVersion),
			reloadReminder,
			formatCheckedAt(status.checkedAt),
		]);
		return;
	}

	updateStatusText.textContent = t("updateUpToDateStatus", [
		String(status.localVersion),
		String(status.latestVersion),
		formatCheckedAt(status.checkedAt),
	]);
}

function checkForUpdates() {
	checkUpdatesButton.disabled = true;
	updateStatusText.dataset.state = "";
	updateStatusText.textContent = t("checkingGithub");

	chrome.runtime.sendMessage({ type: "ee-check-update", notify: true }, (response) => {
		checkUpdatesButton.disabled = false;
		if (chrome.runtime.lastError) {
			updateStatusText.dataset.state = "error";
			updateStatusText.textContent = chrome.runtime.lastError.message;
			return;
		}
		if (!response?.ok) {
			updateStatusText.dataset.state = "error";
			updateStatusText.textContent = response?.error || t("updateCheckFailed");
			return;
		}
		renderUpdateStatus(response.status);
	});
}

let shortcutStatusRefreshTimer = null;

function renderShortcutStatus(retriesRemaining = 4) {
	if (!themeShortcutStatus) return;
	if (!chrome.commands?.getAll) {
		themeShortcutStatus.textContent = t("shortcutUnavailable");
		return;
	}

	chrome.commands.getAll((commands) => {
		if (chrome.runtime.lastError) {
			themeShortcutStatus.textContent = t("shortcutUnavailable");
			return;
		}
		const command = commands.find((entry) => entry.name === THEME_TOGGLE_COMMAND);
		const shortcut = command?.shortcut?.trim();
		themeShortcutStatus.textContent = shortcut
			? t("currentHotkey", [shortcut])
			: t("noHotkey");

		// Chrome can briefly return an empty shortcut list while an unpacked
		// extension is coming back from a reload. Retry the read instead of
		// showing a false "No hotkey assigned" state permanently.
		if (!shortcut && retriesRemaining > 0) {
			window.clearTimeout(shortcutStatusRefreshTimer);
			shortcutStatusRefreshTimer = window.setTimeout(() => {
				renderShortcutStatus(retriesRemaining - 1);
			}, 300);
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
		TIMETABLE_HIGHLIGHTS_KEY,
		ROZVRH_ROOM_CHANGE_COLOR_KEY,
		ROZVRH_SUBSTITUTION_COLOR_KEY,
		GRADE_BADGES_KEY,
		GRADES_ATTENDANCE_KEY,
		GRADES_ATTENDANCE_DEBUG_KEY,
		ATTENDANCE_PERCENTAGES_KEY,
		HALFYEAR_START_KEY,
		HALFYEAR_END_KEY,
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
		timetableHighlightsToggle.checked = result[TIMETABLE_HIGHLIGHTS_KEY] !== false;
		rozvrhRoomChangeColor = normalizeColor(result[ROZVRH_ROOM_CHANGE_COLOR_KEY], DEFAULT_ROZVRH_ROOM_CHANGE_COLOR);
		rozvrhSubstitutionColor = normalizeColor(result[ROZVRH_SUBSTITUTION_COLOR_KEY], DEFAULT_ROZVRH_SUBSTITUTION_COLOR);
		syncRozvrhColorInputs();
		gradeBadgesToggle.checked = result[GRADE_BADGES_KEY] === true;
		gradesAttendanceToggle.checked = result[GRADES_ATTENDANCE_KEY] !== false;
		gradesAttendanceDebugToggle.checked = result[GRADES_ATTENDANCE_DEBUG_KEY] === true;
		attendancePercentagesToggle.checked = result[ATTENDANCE_PERCENTAGES_KEY] !== false;
		halfyearStartInput.value = normalizeDateInput(result[HALFYEAR_START_KEY]);
		halfyearEndInput.value = normalizeDateInput(result[HALFYEAR_END_KEY]);
		updateReminderToggle.checked = result[UPDATE_REMINDER_ENABLED_KEY] !== false;
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
		.then(() => setCustomThemeStatus(t("customThemeCopied")))
		.catch(() => setCustomThemeStatus(t("customThemeReadyToCopy")));
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
		setCustomThemeStatus(t("customThemeImported"));
	} catch (error) {
		setCustomThemeStatus(t("customThemeImportFailed"), true);
	}
});

resetCustomThemeButton.addEventListener("click", () => {
	customTheme = { ...DEFAULT_CUSTOM_THEME };
	syncCustomThemeInputs(customTheme);
	customThemeImport.value = customThemeExportText(customTheme);
	applySettingsTheme(themeSelect.value, toggle.checked, customTheme);
	chrome.storage.local.set({ [CUSTOM_THEME_KEY]: customTheme });
	notifyEdupageTabs();
	setCustomThemeStatus(t("customThemeReset"));
});

cleanUiToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [CLEAN_UI_KEY]: cleanUiToggle.checked });
	notifyEdupageTabs();
});

hideHelpTextToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [HIDE_HELP_TEXT_KEY]: hideHelpTextToggle.checked });
	notifyEdupageTabs();
});

timetableHighlightsToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [TIMETABLE_HIGHLIGHTS_KEY]: timetableHighlightsToggle.checked });
	updateDependentControls();
});

[rozvrhRoomChangeColorInput, customRozvrhRoomChangeInput].forEach((input) => {
	if (!input) return;
	input.addEventListener("input", () => {
		rozvrhRoomChangeColor = normalizeColor(input.value, DEFAULT_ROZVRH_ROOM_CHANGE_COLOR);
		syncRozvrhColorInputs();
		chrome.storage.local.set({ [ROZVRH_ROOM_CHANGE_COLOR_KEY]: rozvrhRoomChangeColor });
		notifyEdupageTabs();
	});
});

[rozvrhSubstitutionColorInput, customRozvrhSubstitutionInput].forEach((input) => {
	if (!input) return;
	input.addEventListener("input", () => {
		rozvrhSubstitutionColor = normalizeColor(input.value, DEFAULT_ROZVRH_SUBSTITUTION_COLOR);
		syncRozvrhColorInputs();
		chrome.storage.local.set({ [ROZVRH_SUBSTITUTION_COLOR_KEY]: rozvrhSubstitutionColor });
		notifyEdupageTabs();
	});
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

halfyearEndInput.addEventListener("change", () => {
	const value = normalizeDateInput(halfyearEndInput.value);
	if (value) {
		chrome.storage.local.set({ [HALFYEAR_END_KEY]: value }, () => {
			chrome.storage.local.remove(GRADES_ATTENDANCE_CACHE_KEY);
		});
		return;
	}
	chrome.storage.local.remove([HALFYEAR_END_KEY, GRADES_ATTENDANCE_CACHE_KEY]);
});

resetHalfyearEndButton.addEventListener("click", () => {
	halfyearEndInput.value = "";
	chrome.storage.local.remove([HALFYEAR_END_KEY, GRADES_ATTENDANCE_CACHE_KEY]);
});

clearCachedSchoolDataButton?.addEventListener("click", () => {
	clearCachedSchoolDataButton.disabled = true;
	clearCachedSchoolDataStatus.textContent = "";
	clearCachedSchoolDataStatus.classList.remove("is-error");
	chrome.storage.local.remove([
		GRADES_ATTENDANCE_CACHE_KEY,
		TIMETABLE_SYNC_CACHE_KEY,
	], () => {
		const error = chrome.runtime.lastError;
		clearCachedSchoolDataButton.disabled = false;
		if (error) {
			clearCachedSchoolDataStatus.textContent = t("cachedSchoolDataClearFailed");
			clearCachedSchoolDataStatus.classList.add("is-error");
			return;
		}
		clearCachedSchoolDataStatus.textContent = t("cachedSchoolDataCleared");
	});
});

updateReminderToggle.addEventListener("change", () => {
	chrome.storage.local.set({ [UPDATE_REMINDER_ENABLED_KEY]: updateReminderToggle.checked });
});

checkUpdatesButton.addEventListener("click", checkForUpdates);

openRepositoryButton.addEventListener("click", () => {
	chrome.tabs.create({ url: REPO_URL });
});

// ---- Report a Problem ------------------------------------------------------

let latestReport = null;

function setReportButtonsEnabled(enabled) {
	copyReportButton.disabled = !enabled;
	downloadReportButton.disabled = !enabled;
	openIssueButton.disabled = !enabled;
}

function buildIssueBody(report) {
	const env = report?.extension || {};
	const sys = report?.environment || {};
	const frames = (report?.page?.pages || []).flatMap((page) => page?.frames || []);
	const uniq = (values) => values.filter((value, index, all) => all.indexOf(value) === index);
	const pageTypes = uniq(
		(report?.page?.summary?.pageTypes || []).concat(frames.flatMap((frame) => frame?.data?.pageType || [])),
	).filter((type) => type && type !== "unknown");
	const origins = uniq(frames.map((frame) => frame?.data?.frame?.origin).filter(Boolean));
	return [
		"### What went wrong",
		"<!-- Describe what you expected and what actually happened. -->",
		"",
		"### Steps to reproduce",
		"1. ",
		"",
		"### Environment",
		`- Extension version: ${env.version || "?"}`,
		`- UI language: ${env.uiLanguage || "?"}`,
		`- Affected page type(s): ${pageTypes.length ? pageTypes.join(", ") : "?"}`,
		`- Grade scale (detected): ${report?.page?.summary?.gradesScale || "n/a"}`,
		`- EduPage origin(s): ${origins.length ? origins.join(", ") : "?"}`,
		`- Browser: ${sys.userAgent || "?"}`,
		`- Personal data hidden: ${report?.redacted ? "yes" : "no"}`,
		"",
		"### Diagnostic report",
		"<!-- Attach the downloaded .json file, or paste its contents below. -->",
		"",
		"```json",
		"(attach or paste the report here)",
		"```",
	].join("\n");
}

generateReportButton.addEventListener("click", () => {
	generateReportButton.disabled = true;
	setReportButtonsEnabled(false);
	reportStatus.textContent = t("reportGenerating") || "Generating report…";
	chrome.runtime.sendMessage(
		{ type: "ee-collect-report", redact: reportRedactToggle.checked },
		(response) => {
			generateReportButton.disabled = false;
			if (chrome.runtime.lastError || !response?.ok) {
				reportStatus.textContent = (t("reportError") || "Could not generate report:") +
					" " + (response?.error || chrome.runtime.lastError?.message || "unknown error");
				return;
			}
			latestReport = response.report;
			reportOutput.value = JSON.stringify(latestReport, null, 2);
			reportOutput.hidden = false;
			setReportButtonsEnabled(true);
			const page = latestReport?.page;
			if (!page?.tabFound) {
				reportStatus.textContent = t("reportNoTab") ||
					"Report ready, but no EduPage tab was found — open the affected page in another tab and regenerate for page details.";
			} else if (page?.summary?.empty) {
				reportStatus.textContent = t("reportEmpty") ||
					"Report ready, but no recognizable EduPage content was captured — open the page that is actually broken (grades, timetable, attendance) and regenerate.";
			} else {
				reportStatus.textContent = t("reportReady") ||
					"Report ready. Review it, then copy, download, or open an issue.";
			}
		}
	);
});

copyReportButton.addEventListener("click", async () => {
	if (!reportOutput.value) return;
	try {
		await navigator.clipboard.writeText(reportOutput.value);
		reportStatus.textContent = t("reportCopied") || "Report copied to clipboard.";
	} catch (error) {
		reportOutput.select();
		reportStatus.textContent = t("reportCopyManual") || "Could not copy automatically — the report is selected, press Ctrl/Cmd+C.";
	}
});

downloadReportButton.addEventListener("click", () => {
	if (!reportOutput.value) return;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const blob = new Blob([reportOutput.value], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `edupage-extras-report-${stamp}.json`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	reportStatus.textContent = t("reportDownloaded") || "Report downloaded.";
});

const exportExcludedRangesInput = document.getElementById("ExportExcludedRangesInput");
const EXPORT_EXCLUDED_RANGES_KEY = "eeIcsExcludedDateRanges";

if (exportExcludedRangesInput) {
	chrome.storage.local.get([EXPORT_EXCLUDED_RANGES_KEY], (result) => {
		exportExcludedRangesInput.value = String(result[EXPORT_EXCLUDED_RANGES_KEY] || "");
	});
	exportExcludedRangesInput.addEventListener("change", () => {
		chrome.storage.local.set({ [EXPORT_EXCLUDED_RANGES_KEY]: exportExcludedRangesInput.value });
	});
}

const exportTimetableWeekButton = document.getElementById("ExportTimetableWeekButton");
const exportTimetableHalfyearButton = document.getElementById("ExportTimetableHalfyearButton");
const exportTimetableIncludeChangesCheckbox = document.getElementById("ExportTimetableIncludeChangesCheckbox");
const exportTimetableStatus = document.getElementById("ExportTimetableStatus");

function downloadIcsFile(ics, filename) {
	const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename || "edupage-timetable.ics";
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function requestTimetableExport(range) {
	if (!exportTimetableStatus) return;
	const buttons = [exportTimetableWeekButton, exportTimetableHalfyearButton];
	buttons.forEach((button) => { if (button) button.disabled = true; });
	const includeChanges = exportTimetableIncludeChangesCheckbox
		? exportTimetableIncludeChangesCheckbox.checked
		: true;
	exportTimetableStatus.textContent = t("exportTimetableWorking") || "Reading your timetable…";
	chrome.runtime.sendMessage({ type: "ee-export-timetable-ics", range, includeChanges }, (response) => {
		buttons.forEach((button) => { if (button) button.disabled = false; });
		if (chrome.runtime.lastError || !response || !response.ok) {
			const detail = response?.error || chrome.runtime.lastError?.message || "";
			exportTimetableStatus.textContent = `${t("exportTimetableError") || "Export failed:"} ${detail}`.trim();
			return;
		}
		downloadIcsFile(response.ics, response.filename);
		exportTimetableStatus.textContent = (t("exportTimetableDone") || "Exported {count} lessons.")
			.replace("{count}", String(response.count));
	});
}

if (exportTimetableWeekButton) {
	exportTimetableWeekButton.addEventListener("click", () => requestTimetableExport("week"));
}
if (exportTimetableHalfyearButton) {
	exportTimetableHalfyearButton.addEventListener("click", () => requestTimetableExport("halfyear"));
}

openIssueButton.addEventListener("click", () => {
	if (!latestReport) return;
	const version = latestReport?.extension?.version || "?";
	chrome.runtime.sendMessage({
		type: "ee-report-open-issue",
		title: `[Bug] (v${version}) `,
		body: buildIssueBody(latestReport),
	}, (response) => {
		if (chrome.runtime.lastError || !response?.ok) {
			reportStatus.textContent = (t("reportError") || "Could not open a GitHub issue:") +
				" " + (response?.error || chrome.runtime.lastError?.message || "unknown error");
			return;
		}
		reportStatus.textContent = t("reportIssueOpened") ||
			"Opened a new GitHub issue — attach the downloaded report or paste it in.";
	});
});

openShortcutSettingsButton.addEventListener("click", () => {
	// chrome://extensions/shortcuts doesn't exist in Firefox — there's no direct
	// deep link to its shortcuts UI there, so point to about:addons instead.
	if (window.eeI18n?.isFirefox) {
		chrome.tabs.create({ url: "about:addons" });
		if (themeShortcutStatus) themeShortcutStatus.textContent = t("shortcutSettingsFirefoxHint");
		return;
	}
	chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Experimental stays outside the searchable, scrollable settings document.
// Its acknowledgement is tied to the installed extension version, so an
// update presents the warning again without adding another permission.
const experimentalConfirmDialog = document.getElementById("ExperimentalConfirmDialog");
const experimentalConfirmCancel = document.getElementById("ExperimentalConfirmCancel");
const EXPERIMENTAL_ACKNOWLEDGEMENT_KEY = "eeExperimentalAcknowledgedVersion";
const currentExtensionVersion = chrome.runtime.getManifest().version;
let experimentalAcknowledged = false;

function isExperimentalConfirmed() {
	return experimentalAcknowledged;
}

chrome.storage.local.get([EXPERIMENTAL_ACKNOWLEDGEMENT_KEY], (result) => {
	experimentalAcknowledged = result[EXPERIMENTAL_ACKNOWLEDGEMENT_KEY] === currentExtensionVersion;
});

function renderActivityShieldShortcutStatus() {
	if (!activityShieldShortcutStatus) return;
	if (!chrome.commands?.getAll) {
		activityShieldShortcutStatus.textContent = t("shortcutUnavailable");
		return;
	}
	chrome.commands.getAll((commands) => {
		const command = commands.find((entry) => entry.name === ACTIVITY_SHIELD_COMMAND);
		const shortcut = command?.shortcut?.trim();
		activityShieldShortcutStatus.textContent = shortcut
			? t("currentHotkey", [shortcut])
			: t("noHotkey");
	});
}

function renderAiShortcutStatus() {
	if (!aiShortcutStatus) return;
	if (!chrome.commands?.getAll) {
		aiShortcutStatus.textContent = t("shortcutUnavailable");
		return;
	}
	chrome.commands.getAll((commands) => {
		const command = commands.find((entry) => entry.name === AI_SUGGEST_QUESTION_COMMAND);
		const shortcut = command?.shortcut?.trim();
		aiShortcutStatus.textContent = shortcut ? t("currentHotkey", [shortcut]) : t("noHotkey");
	});
}

function setExperimentalStatus(message, isError = false) {
	if (!experimentalSaveStatus) return;
	experimentalSaveStatus.textContent = message;
	experimentalSaveStatus.style.color = isError ? "var(--danger-color)" : "var(--accent-color)";
	window.clearTimeout(setExperimentalStatus.timer);
	setExperimentalStatus.timer = window.setTimeout(() => {
		experimentalSaveStatus.textContent = "";
	}, 2200);
}

function setAiConnectionStatus(message, isError = false) {
	if (!aiConnectionStatus) return;
	aiConnectionStatus.textContent = message;
	aiConnectionStatus.style.color = isError ? "var(--danger-color)" : "var(--accent-color)";
}

function currentAiSettings() {
	return {
		[AI_HELPER_ENABLED_KEY]: aiQuestionHelperToggle?.checked === true,
		[AI_PROVIDER_KEY]: aiProviderSelect?.value || "ollama",
		[AI_ENDPOINT_KEY]: aiEndpointInput?.value.trim() || "",
		[AI_MODEL_KEY]: aiModelInput?.value.trim() || "",
		[AI_ACCESS_TOKEN_KEY]: aiAccessTokenInput?.value.trim() || "",
	};
}

function saveAiSettings(callback) {
	chrome.storage.local.set(currentAiSettings(), callback);
}

function getAiPermissionPattern() {
	const provider = aiProviderSelect?.value || "ollama";
	if (provider === "openrouter") return "https://openrouter.ai/*";
	if (provider === "nvidia") return "https://integrate.api.nvidia.com/*";
	if (provider === "gemini") return "https://generativelanguage.googleapis.com/*";
	let endpoint;
	try {
		endpoint = new URL(aiEndpointInput?.value.trim() || AI_DEFAULT_ENDPOINTS[provider]);
	} catch (_) {
		throw new Error(t("aiInvalidEndpoint"));
	}
	if (endpoint.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(endpoint.hostname.toLowerCase())) {
		throw new Error(t("aiInvalidEndpoint"));
	}
	return `${endpoint.protocol}//${endpoint.hostname}/*`;
}

function requestAiHostPermission(pattern) {
	return new Promise((resolve, reject) => {
		if (!chrome.permissions?.contains) {
			reject(new Error(t("aiPermissionUnavailable")));
			return;
		}
		const requestedOrigins = { origins: [pattern] };
		chrome.permissions.contains(requestedOrigins, (alreadyGranted) => {
			const error = chrome.runtime.lastError;
			if (error) {
				reject(new Error(t("aiPermissionDenied")));
				return;
			}
			// Gemini is a required host permission so it is already present after
			// installation. Only optional provider origins need a user prompt.
			if (alreadyGranted) {
				resolve();
				return;
			}
			if (!chrome.permissions.request) {
				reject(new Error(t("aiPermissionUnavailable")));
				return;
			}
			chrome.permissions.request(requestedOrigins, (granted) => {
				const requestError = chrome.runtime.lastError;
				if (requestError || !granted) {
					reject(new Error(t("aiPermissionDenied")));
					return;
				}
				resolve();
			});
		});
	});
}

openTestingSiteButton?.addEventListener("click", () => {
	openTestingSiteButton.disabled = true;
	if (!chrome.permissions?.request) {
		setExperimentalStatus(t("testingSitePermissionUnavailable"), true);
		openTestingSiteButton.disabled = false;
		return;
	}
	chrome.permissions.request({ origins: [TESTING_SITE_PERMISSION] }, (granted) => {
		const error = chrome.runtime.lastError;
		openTestingSiteButton.disabled = false;
		if (error || !granted) {
			setExperimentalStatus(t("testingSitePermissionDenied"), true);
			return;
		}
		chrome.tabs.create({ url: TESTING_SITE_URL });
	});
});

function updateActivityShieldDependentControls() {
	const enabled = document.getElementById("ActivityShieldEnabled")?.checked === true;
	activityShieldControlledSettings.forEach(([elementId]) => {
		const element = document.getElementById(elementId);
		if (element) element.disabled = !enabled;
	});
}

function renderActivityShieldSettings(result) {
	activityShieldSettings.forEach(([elementId, key]) => {
		const element = document.getElementById(elementId);
		if (element) element.checked = result[key];
	});
	updateActivityShieldDependentControls();
}

activityShieldSettings.forEach(([elementId, key]) => {
	const element = document.getElementById(elementId);
	if (!element) return;
	element.addEventListener("change", () => {
		chrome.storage.local.set({ [key]: element.checked }, () => {
			if (elementId === "ActivityShieldEnabled") {
				updateActivityShieldDependentControls();
				notifyEdupageTabs();
			}
			setExperimentalStatus(t("savedStatus"));
		});
	});
});

if (resetActivityShieldButton) {
	resetActivityShieldButton.addEventListener("click", () => {
		chrome.storage.local.remove("eeActivityShieldPolicies", () => {
			chrome.storage.local.set(activityShieldDefaults, () => {
				renderActivityShieldSettings(activityShieldDefaults);
				setExperimentalStatus(t("resetStatus"));
			});
		});
	});
}

if (reloadEdupageTabsButton) {
	reloadEdupageTabsButton.addEventListener("click", () => {
		chrome.tabs.query({ url: "https://*.edupage.org/*" }, (tabs) => {
			tabs.forEach((tab) => {
				if (tab.id) chrome.tabs.reload(tab.id);
			});
			setExperimentalStatus(tabs.length ? t("tabsReloaded") : t("noTabsOpen"));
		});
	});
}

if (experimentalShortcutSettingsButton) {
	experimentalShortcutSettingsButton.addEventListener("click", () => {
		if (window.eeI18n?.isFirefox) {
			chrome.tabs.create({ url: "about:addons" });
			setExperimentalStatus(t("shortcutSettingsFirefoxHint"));
			return;
		}
		chrome.tabs.create({ url: "chrome://extensions/shortcuts" }, () => {
			if (chrome.runtime.lastError) {
				setExperimentalStatus(t("shortcutSettingsFailed"), true);
				return;
			}
			setExperimentalStatus(t("shortcutSettingsOpened"));
		});
	});
}

chrome.storage.local.get(activityShieldDefaults, renderActivityShieldSettings);
renderActivityShieldShortcutStatus();
window.addEventListener("focus", renderActivityShieldShortcutStatus);

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (activityShieldStorageKeys.some((key) => changes[key])) {
		chrome.storage.local.get(activityShieldDefaults, renderActivityShieldSettings);
	}
});

if (etestAutoThemeOffToggle) {
	chrome.storage.local.get({ [ETEST_AUTO_THEME_OFF_KEY]: true }, (result) => {
		etestAutoThemeOffToggle.checked = result[ETEST_AUTO_THEME_OFF_KEY] !== false;
	});
	etestAutoThemeOffToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [ETEST_AUTO_THEME_OFF_KEY]: etestAutoThemeOffToggle.checked });
		notifyEdupageTabs();
	});
}

if (autoLoginToggle) {
	chrome.storage.local.get([AUTOLOGIN_KEY], (result) => {
		autoLoginToggle.checked = result[AUTOLOGIN_KEY] === true;
		updateDependentControls();
	});
	autoLoginToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [AUTOLOGIN_KEY]: autoLoginToggle.checked });
		updateDependentControls();
	});
}

if (autoLoginPreferredAccountInput) {
	chrome.storage.local.get([AUTOLOGIN_PREFERRED_ACCOUNT_KEY], (result) => {
		autoLoginPreferredAccountInput.value = result[AUTOLOGIN_PREFERRED_ACCOUNT_KEY] || "";
	});
	autoLoginPreferredAccountInput.addEventListener("change", () => {
		chrome.storage.local.set({ [AUTOLOGIN_PREFERRED_ACCOUNT_KEY]: autoLoginPreferredAccountInput.value.trim() });
	});
}

if (ucivoExportToggle) {
	chrome.storage.local.get([UCIVO_EXPORT_KEY], (result) => {
		ucivoExportToggle.checked = result[UCIVO_EXPORT_KEY] === true;
	});
	ucivoExportToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [UCIVO_EXPORT_KEY]: ucivoExportToggle.checked });
	});
}

if (gradesSortFilterToggle) {
	chrome.storage.local.get([GRADES_SORT_FILTER_KEY], (result) => {
		gradesSortFilterToggle.checked = result[GRADES_SORT_FILTER_KEY] !== false;
	});
	gradesSortFilterToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [GRADES_SORT_FILTER_KEY]: gradesSortFilterToggle.checked });
	});
}

if (gradesExportToggle) {
	chrome.storage.local.get([GRADES_EXPORT_KEY], (result) => {
		gradesExportToggle.checked = result[GRADES_EXPORT_KEY] === true;
	});
	gradesExportToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [GRADES_EXPORT_KEY]: gradesExportToggle.checked });
	});
}

if (timetableExportToggle) {
	chrome.storage.local.get([TIMETABLE_EXPORT_KEY], (result) => {
		timetableExportToggle.checked = result[TIMETABLE_EXPORT_KEY] === true;
		updateTimetableExportVisibility();
	});
	timetableExportToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [TIMETABLE_EXPORT_KEY]: timetableExportToggle.checked });
		updateTimetableExportVisibility();
	});
}

if (etestCopyToggle) {
	chrome.storage.local.get([
		ETEST_COPY_KEY,
		ETEST_QUESTION_BUTTONS_KEY,
		ETEST_WHOLE_TEST_BUTTON_KEY,
		ETEST_INCLUDE_ANSWERS_KEY,
		ETEST_INCLUDE_IMAGES_KEY,
	], (result) => {
		etestCopyToggle.checked = result[ETEST_COPY_KEY] === true;
		if (etestQuestionButtonsToggle) {
			etestQuestionButtonsToggle.checked = result[ETEST_QUESTION_BUTTONS_KEY] !== false;
		}
		if (etestWholeTestButtonToggle) {
			etestWholeTestButtonToggle.checked = result[ETEST_WHOLE_TEST_BUTTON_KEY] !== false;
		}
		if (etestIncludeAnswersToggle) etestIncludeAnswersToggle.checked = result[ETEST_INCLUDE_ANSWERS_KEY] !== false;
		if (etestIncludeImagesToggle) etestIncludeImagesToggle.checked = result[ETEST_INCLUDE_IMAGES_KEY] !== false;
		updateDependentControls();
	});
	etestCopyToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [ETEST_COPY_KEY]: etestCopyToggle.checked });
		updateDependentControls();
	});
}

openEtestCopyShortcutSettingsButton?.addEventListener("click", () => {
	openBrowserShortcutSettings();
});

if (etestQuestionButtonsToggle) {
	etestQuestionButtonsToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [ETEST_QUESTION_BUTTONS_KEY]: etestQuestionButtonsToggle.checked });
	});
}

if (etestWholeTestButtonToggle) {
	etestWholeTestButtonToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [ETEST_WHOLE_TEST_BUTTON_KEY]: etestWholeTestButtonToggle.checked });
	});
}

if (etestIncludeAnswersToggle) {
	etestIncludeAnswersToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [ETEST_INCLUDE_ANSWERS_KEY]: etestIncludeAnswersToggle.checked });
	});
}

if (etestIncludeImagesToggle) {
	etestIncludeImagesToggle.addEventListener("change", () => {
		chrome.storage.local.set({ [ETEST_INCLUDE_IMAGES_KEY]: etestIncludeImagesToggle.checked });
	});
}

if (aiQuestionHelperToggle) {
	chrome.storage.local.get([
		AI_HELPER_ENABLED_KEY,
		AI_PROVIDER_KEY,
		AI_ENDPOINT_KEY,
		AI_MODEL_KEY,
		AI_ACCESS_TOKEN_KEY,
	], (result) => {
		const provider = ["ollama", "lmstudio", "nvidia", "openrouter", "gemini"].includes(result[AI_PROVIDER_KEY])
			? result[AI_PROVIDER_KEY]
			: "ollama";
		aiQuestionHelperToggle.checked = result[AI_HELPER_ENABLED_KEY] === true;
		if (aiProviderSelect) aiProviderSelect.value = provider;
		if (aiEndpointInput) aiEndpointInput.value = result[AI_ENDPOINT_KEY] || AI_DEFAULT_ENDPOINTS[provider] || "";
		if (aiModelInput) aiModelInput.value = result[AI_MODEL_KEY] || "";
		if (aiAccessTokenInput) aiAccessTokenInput.value = result[AI_ACCESS_TOKEN_KEY] || "";
		updateDependentControls();
	});
	aiQuestionHelperToggle.addEventListener("change", () => {
		saveAiSettings();
		setAiConnectionStatus("");
		updateDependentControls();
	});
}

aiProviderSelect?.addEventListener("change", () => {
	const provider = aiProviderSelect.value;
	if (aiEndpointInput && AI_DEFAULT_ENDPOINTS[provider]) aiEndpointInput.value = AI_DEFAULT_ENDPOINTS[provider];
	saveAiSettings();
	setAiConnectionStatus("");
	updateDependentControls();
});

[aiEndpointInput, aiModelInput, aiAccessTokenInput].forEach((input) => {
	input?.addEventListener("change", () => {
		saveAiSettings();
		setAiConnectionStatus("");
	});
});

aiTestConnectionButton?.addEventListener("click", async () => {
	setAiConnectionStatus(t("aiConnectionTesting"));
	aiTestConnectionButton.disabled = true;
	try {
		const pattern = getAiPermissionPattern();
		await requestAiHostPermission(pattern);
		await new Promise((resolve) => saveAiSettings(resolve));
		const response = await chrome.runtime.sendMessage({ type: "ee-ai-test-connection" });
		if (!response?.ok) throw new Error(response?.error || t("aiConnectionFailed"));
		setAiConnectionStatus(t("aiConnectionSucceeded"));
	} catch (error) {
		setAiConnectionStatus(error?.message || t("aiConnectionFailed"), true);
	} finally {
		aiTestConnectionButton.disabled = aiQuestionHelperToggle?.checked !== true;
	}
});

function openBrowserShortcutSettings() {
	if (window.eeI18n?.isFirefox) {
		chrome.tabs.create({ url: "about:addons" });
		return;
	}
	chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}

openAiShortcutSettingsButton?.addEventListener("click", () => {
	openBrowserShortcutSettings();
	if (window.eeI18n?.isFirefox && aiShortcutStatus) {
		aiShortcutStatus.textContent = t("shortcutSettingsFirefoxHint");
	}
});

if (previewUpdateToastButton) {
	previewUpdateToastButton.addEventListener("click", () => {
		chrome.tabs.query({ url: "https://*.edupage.org/*" }, (tabs) => {
			if (reportStatus) {
				reportStatus.textContent = tabs.length
					? t("previewUpdateToastSent", [String(tabs.length)])
					: t("noTabsOpen");
			}
			tabs.forEach((tab) => {
				if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "ee-preview-update-toast" });
			});
		});
	});
}

renderShortcutStatus();
renderAiShortcutStatus();
renderDefaultHalfyearHints();
window.addEventListener("focus", () => {
	renderShortcutStatus();
	renderAiShortcutStatus();
});
window.addEventListener("pageshow", () => {
	renderShortcutStatus();
	renderAiShortcutStatus();
});
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) {
		renderShortcutStatus();
		renderAiShortcutStatus();
	}
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (changes[UPDATE_STATUS_KEY]) {
		renderUpdateStatus(changes[UPDATE_STATUS_KEY].newValue);
	}
});

// Update Reminders only apply to unpacked/developer installs. On store installs
// (Firefox AMO, future Chrome Web Store) the browser auto-updates the add-on, so
// hide the GitHub-only controls and show an "updates automatically" note instead.
// management.getSelf() works without the "management" permission.
if (chrome.management && typeof chrome.management.getSelf === "function") {
	chrome.management.getSelf((info) => {
		if (chrome.runtime.lastError || !info || info.installType === "development") return;
		isStoreInstall = true;
		updateReminderToggle?.closest(".setting-row")?.setAttribute("hidden", "");
		if (checkUpdatesButton) checkUpdatesButton.hidden = true;
		renderUpdateStatus(null);
	});
}

const settingsNavItems = Array.from(document.querySelectorAll(".settings-nav-item"));
const standardNavItems = settingsNavItems.filter((item) => item.dataset.target !== "experimental");
const standardSettingsContent = document.getElementById("StandardSettingsContent");
const standardSettingsSections = Array.from(document.querySelectorAll(".settings-standard-section"));
const experimentalSection = document.getElementById("panel-experimental");
const settingsSearch = document.getElementById("SettingsSearch");
const settingsSearchInput = document.getElementById("SettingsSearchInput");
const settingsSearchEmpty = document.getElementById("SettingsSearchEmpty");
const reduceSettingsMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
let settingsScrollFrame = 0;

function normalizeSettingsSearch(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase()
		.trim();
}

function setActiveSettingsNav(target) {
	const currentItem = settingsNavItems.find((item) => item.getAttribute("aria-current") === "true");
	if (currentItem?.dataset.target === target) return;
	let activeItem = null;
	settingsNavItems.forEach((item) => {
		if (item.dataset.target === target) {
			item.setAttribute("aria-current", "true");
			activeItem = item;
		}
		else item.removeAttribute("aria-current");
	});
	if (activeItem && window.innerWidth <= 900) {
		const nav = activeItem.closest(".settings-nav");
		const left = activeItem.offsetLeft - ((nav?.clientWidth || 0) - activeItem.offsetWidth) / 2;
		nav?.scrollTo({ left: Math.max(0, left), behavior: reduceSettingsMotion?.matches ? "auto" : "smooth" });
	}
}

function clearSettingsSearch() {
	if (!settingsSearchInput) return;
	settingsSearchInput.value = "";
	applySettingsSearch();
}

function applySettingsSearch() {
	if (!settingsSearchInput) return;
	const query = normalizeSettingsSearch(settingsSearchInput.value);
	let visibleSections = 0;

	standardSettingsSections.forEach((section) => {
		const sectionName = normalizeSettingsSearch(section.querySelector("h2")?.textContent);
		const sectionMatches = Boolean(query && sectionName.includes(query));
		let visibleRows = 0;

		section.querySelectorAll(".setting-row").forEach((row) => {
			const unavailable = Boolean(row.closest("[hidden]"));
			const matches = !query || sectionMatches || (!unavailable && normalizeSettingsSearch(row.textContent).includes(query));
			row.classList.toggle("is-search-hidden", Boolean(query && !matches));
			if (!unavailable && matches) visibleRows += 1;
		});

		section.querySelectorAll(".setting-card").forEach((card) => {
			const availableRows = Array.from(card.querySelectorAll(".setting-row")).filter((row) => !row.closest("[hidden]"));
			const hasMatch = availableRows.some((row) => !row.classList.contains("is-search-hidden"));
			card.classList.toggle("is-search-hidden", Boolean(query && availableRows.length && !hasMatch));
		});

		const hasVisibleRows = !query || visibleRows > 0;
		section.classList.toggle("is-search-hidden", !hasVisibleRows);
		if (hasVisibleRows) visibleSections += 1;
	});

	if (settingsSearchEmpty) settingsSearchEmpty.hidden = !query || visibleSections > 0;
	if (query) {
		const firstVisibleSection = standardSettingsSections.find((section) => !section.classList.contains("is-search-hidden"));
		if (firstVisibleSection) setActiveSettingsNav(firstVisibleSection.id.replace("panel-", ""));
	} else {
		scheduleActiveSettingsUpdate();
	}
}

function showStandardSettings(target, { scroll = true } = {}) {
	if (standardSettingsContent) standardSettingsContent.hidden = false;
	if (experimentalSection) experimentalSection.hidden = true;
	if (settingsSearch) settingsSearch.hidden = false;
	clearSettingsSearch();
	const panel = document.getElementById(`panel-${target}`);
	if (!panel || !standardSettingsSections.includes(panel)) return;
	setActiveSettingsNav(target);
	if (scroll) {
		window.requestAnimationFrame(() => {
			panel.scrollIntoView({ behavior: reduceSettingsMotion?.matches ? "auto" : "smooth", block: "start" });
		});
	}
}

function showExperimentalSettings() {
	if (standardSettingsContent) standardSettingsContent.hidden = true;
	if (settingsSearchEmpty) settingsSearchEmpty.hidden = true;
	if (settingsSearch) settingsSearch.hidden = true;
	if (experimentalContent) experimentalContent.hidden = false;
	if (experimentalSection) experimentalSection.hidden = false;
	setActiveSettingsNav("experimental");
	window.scrollTo({ top: 0, behavior: "auto" });
}

function updateActiveSettingsSection() {
	settingsScrollFrame = 0;
	if (standardSettingsContent?.hidden) return;
	const offset = window.innerWidth <= 900 ? 148 : 84;
	let activeSection = standardSettingsSections.find((section) => !section.classList.contains("is-search-hidden"));
	standardSettingsSections.forEach((section) => {
		if (!section.classList.contains("is-search-hidden") && section.getBoundingClientRect().top <= offset) {
			activeSection = section;
		}
	});
	if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
		activeSection = standardSettingsSections.filter((section) => !section.classList.contains("is-search-hidden")).at(-1) || activeSection;
	}
	if (activeSection) setActiveSettingsNav(activeSection.id.replace("panel-", ""));
}

function scheduleActiveSettingsUpdate() {
	if (!settingsScrollFrame) settingsScrollFrame = window.requestAnimationFrame(updateActiveSettingsSection);
}

standardNavItems.forEach((item) => {
	item.addEventListener("click", () => showStandardSettings(item.dataset.target));
});

experimentalSettingsButton?.addEventListener("click", () => {
	if (isExperimentalConfirmed()) showExperimentalSettings();
	else experimentalConfirmDialog?.showModal();
});

experimentalConfirmCancel?.addEventListener("click", () => experimentalConfirmDialog.close());

experimentalConfirmDialog?.addEventListener("click", (event) => {
	if (event.target === experimentalConfirmDialog) experimentalConfirmDialog.close();
});

experimentalConfirmContinue?.addEventListener("click", () => {
	experimentalAcknowledged = true;
	chrome.storage.local.set({ [EXPERIMENTAL_ACKNOWLEDGEMENT_KEY]: currentExtensionVersion });
	experimentalConfirmDialog.close();
	showExperimentalSettings();
});

settingsSearchInput?.addEventListener("input", applySettingsSearch);
window.addEventListener("scroll", scheduleActiveSettingsUpdate, { passive: true });
window.addEventListener("resize", scheduleActiveSettingsUpdate);

document.querySelector(".settings-nav")?.addEventListener("keydown", (event) => {
	if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
	const currentIndex = settingsNavItems.indexOf(document.activeElement);
	if (currentIndex < 0) return;
	event.preventDefault();
	let nextIndex = currentIndex;
	if (["ArrowDown", "ArrowRight"].includes(event.key)) nextIndex = (currentIndex + 1) % settingsNavItems.length;
	else if (["ArrowUp", "ArrowLeft"].includes(event.key)) nextIndex = (currentIndex - 1 + settingsNavItems.length) % settingsNavItems.length;
	else if (event.key === "Home") nextIndex = 0;
	else if (event.key === "End") nextIndex = settingsNavItems.length - 1;
	settingsNavItems[nextIndex].focus();
});

const settingsVisibilityObserver = new MutationObserver(() => {
	if (settingsSearchInput?.value) applySettingsSearch();
});
if (standardSettingsContent) {
	settingsVisibilityObserver.observe(standardSettingsContent, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
}

setActiveSettingsNav("appearance");
