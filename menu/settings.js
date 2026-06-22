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
const rozvrhRoomChangeColorInput = document.getElementById("RozvrhRoomChangeColor");
const rozvrhSubstitutionColorInput = document.getElementById("RozvrhSubstitutionColor");
const customRozvrhRoomChangeInput = document.getElementById("CustomRozvrhRoomChange");
const customRozvrhSubstitutionInput = document.getElementById("CustomRozvrhSubstitution");
const updateReminderToggle = document.getElementById("UpdateReminderCheckbox");
const checkUpdatesButton = document.getElementById("CheckUpdatesButton");
const openRepositoryButton = document.getElementById("OpenRepositoryButton");
const updateStatusText = document.getElementById("UpdateStatusText");
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
const UPDATE_STATUS_KEY = "eeUpdateStatus";
const UPDATE_REMINDER_ENABLED_KEY = "eeUpdateReminderEnabled";
const THEME_TOGGLE_COMMAND = "toggle-theme-mode";
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
let rozvrhRoomChangeColor = DEFAULT_ROZVRH_ROOM_CHANGE_COLOR;
let rozvrhSubstitutionColor = DEFAULT_ROZVRH_SUBSTITUTION_COLOR;

function t(key, substitutions) {
	return window.eeI18n.msg(key, substitutions);
}

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
	if (rozvrhRoomChangeColorInput) rozvrhRoomChangeColorInput.disabled = !rozvrhColorsEnabled;
	if (rozvrhSubstitutionColorInput) rozvrhSubstitutionColorInput.disabled = !rozvrhColorsEnabled;
	if (customRozvrhRoomChangeInput) customRozvrhRoomChangeInput.disabled = !(rozvrhColorsEnabled && customVisible);
	if (customRozvrhSubstitutionInput) customRozvrhSubstitutionInput.disabled = !(rozvrhColorsEnabled && customVisible);
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
					rozvrhRoomChangeColor,
					rozvrhSubstitutionColor,
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

function renderUpdateStatus(status) {
	const reloadReminder = t("updateReloadReminder");
	updateStatusText.dataset.state = "";
	if (!status) {
		updateStatusText.textContent = t("noUpdateCheck");
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

function renderShortcutStatus() {
	if (!chrome.commands?.getAll) {
		themeShortcutStatus.textContent = t("shortcutUnavailable");
		return;
	}

	chrome.commands.getAll((commands) => {
		const command = commands.find((entry) => entry.name === THEME_TOGGLE_COMMAND);
		const shortcut = command?.shortcut?.trim();
		themeShortcutStatus.textContent = shortcut
			? t("currentHotkey", [shortcut])
			: t("noHotkey");
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
	});
	reportStatus.textContent = t("reportIssueOpened") ||
		"Opened a new GitHub issue — attach the downloaded report or paste it in.";
});

openShortcutSettingsButton.addEventListener("click", () => {
	chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

experimentalSettingsButton.addEventListener("click", () => {
	window.location.href = "experimental.html";
});

renderShortcutStatus();
renderDefaultHalfyearHints();
window.addEventListener("focus", renderShortcutStatus);

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local") return;
	if (changes[UPDATE_STATUS_KEY]) {
		renderUpdateStatus(changes[UPDATE_STATUS_KEY].newValue);
	}
});
